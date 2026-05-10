# pwork — Claude Session Context

This file gives a Claude session the minimum context needed to contribute to this codebase without reading every source file. Read this before exploring or modifying the code.

---

## What this codebase is

`pwork` is a local-first CLI for a Group PM. The user logs free-text daily notes; Claude AI extracts structured entities (people, projects, decisions, situations, etc.) and stores them in a MongoDB knowledge graph. The user can later ask questions in plain English and get AI-synthesized answers grounded in their full logged history.

Two AI models are used:
- **Claude Haiku 4.5** (`claude-haiku-4-5`): fast/cheap extraction via tool use with structured JSON output
- **Claude Opus 4.7** (`claude-opus-4-7`): consultation with adaptive thinking and real-time streaming

---

## Architecture in one pass

```
src/
├── cli/              # User-facing: Commander.js commands + Inquirer prompts
├── ai/               # LLMProvider interface + Claude implementation + prompt templates
├── db/               # MongoDB: connection singleton, per-collection CRUD, seed data
├── core/             # Business logic: ingest pipeline, search, consultation
└── types.ts          # All shared TypeScript types — read this first
```

The CLI calls `core/`, `core/` calls `ai/` and `db/`. The AI and DB layers do not call each other.

---

## Entry points

| Command | File | What it does |
|---|---|---|
| `pwork log` | `src/cli/commands/log.ts` | Drives the 3-step ingest flow |
| `pwork ask` | `src/cli/commands/ask.ts` | Consultation: search + AI synthesis |
| `pwork summary` | `src/cli/commands/summary.ts` | Browse entities, timelines, situations |

All commands call `initDb()` before running and `closeDb()` after. `initDb()` (in `src/db/init.ts`) creates indexes and seeds the 11 default entity types on first run if `_schemas` is empty.

---

## The ingest pipeline (`pwork log`)

The log command is a **confirmation-first 3-step state machine**. Nothing is written to the graph without explicit user approval.

```
startIngest(rawText)
  → creates ProcessingSession in MongoDB (state: "raw")
  → calls ai.extractEntities() with schemaContext from _schemas
  → saves extraction to session (state: "awaiting_extraction_review")

[User reviews: approves/removes entities, relationships, situations]

approveExtraction(sessionId, approved)
  → saves approved extraction (state: "awaiting_disambiguation")

buildDisambiguationItems(sessionId)
  → for each "new" entity, finds name-similar existing entities in DB
  → returns candidates for the user to resolve

[User disambiguates: "Is this Alice Chen (Platform) or a new person?"]

commitSession(sessionId, disambiguations)
  → upserts entities (merge fields if existing, create if new)
  → writes relationships onto entity documents
  → upserts situations (update summary if existing, create if new)
  → creates the Entry document (raw text + mentionedEntityIds + situationIds)
  → marks session committed
```

Key functions: `startIngest`, `approveExtraction`, `buildDisambiguationItems`, `commitSession` — all in `src/core/ingest.ts`.

Processing sessions survive CLI restarts (stored in MongoDB, TTL auto-expire after 24h). `getPendingSession()` in `src/db/collections/sessions.ts` finds any in-progress session on startup.

---

## MongoDB collections

| Collection | Purpose |
|---|---|
| `_schemas` | Entity type definitions — versioned, approval-gated |
| `_schema_history` | Immutable audit log of schema changes |
| `entities` | Knowledge graph nodes |
| `entries` | Raw journal entries (raw text + entity/situation links) |
| `situations` | Temporal clusters spanning multiple entries |
| `_processing_sessions` | Ingest state machine state; TTL index on `expiresAt` |

### Key document shapes

**Entity** (`src/types.ts: Entity`):
```typescript
{
  entityId: string          // UUID, stable
  typeId: string            // "person", "decision", etc.
  name: string
  _schemaVersion: number
  fields: Record<string, unknown>   // dynamic per typeId
  relationships: EntityRelationship[]  // graph edges stored on the entity
  tags: string[]
  insights?: EntityInsight           // AI-generated summary + sentiment
  embedding?: number[]               // unused now; search falls back to text
  createdAt, updatedAt, lastMentionedAt: Date
}
```

**EntityRelationship** (embedded in Entity):
```typescript
{
  relationshipId: string
  label: string            // e.g. "works_with", "owns"
  targetEntityId: string
  targetName: string
  targetTypeId: string
}
```

**Entry** (`src/types.ts: Entry`):
```typescript
{
  entryId: string
  rawText: string
  mentionedEntityIds: string[]
  situationIds: string[]
  embedding?: number[]
  loggedAt: Date
  createdAt: Date
}
```

**ProcessingSession** (`src/types.ts: ProcessingSession`):
```typescript
{
  sessionId: string
  rawText: string
  state: "raw" | "awaiting_extraction_review" | "awaiting_disambiguation"
       | "awaiting_summary_confirmation" | "committed" | "abandoned"
  extraction?: ExtractionResult       // what AI extracted
  extractionApproved?: ExtractionResult  // what user approved
  disambiguation?: DisambiguationItem[]
  expiresAt: Date   // TTL: 24h from creation
}
```

---

## AI layer

**Interface**: `LLMProvider` in `src/types.ts`
```typescript
interface LLMProvider {
  extractEntities(text: string, schemaContext: string): Promise<ExtractionResult>
  embed(text: string): Promise<number[]>     // stub → returns [] (no Anthropic embeddings API yet)
  disambiguate(name, typeId, candidates, context): Promise<{ chosenEntityId?, createNew }>
  consult(question, contextEntries, contextEntities): Promise<string>
}
```

**Implementation**: `src/ai/claude.ts` (`ClaudeProvider`)

- **Extraction**: tool use with `extract_entities` tool forced via `tool_choice: { type: "tool", name: "extract_entities" }`. System prompt is prompt-cached (`cache_control: { type: "ephemeral" }`). Schema context is built by `buildSchemaContext()` in `src/db/collections/schemas.ts`.

- **embed()**: returns `[]` — no Anthropic embeddings endpoint exists yet. Search gracefully falls back to MongoDB text search (see `src/core/search.ts`).

- **Consultation**: uses `stream()` with `thinking: { type: "adaptive" } as any` (the `as any` is required because the SDK types at `0.39.0` don't include `adaptive`). Streams text deltas to stdout in real time. `max_tokens: 16000`.

- **Provider singleton**: `src/ai/index.ts` — `getProvider()` returns a cached `ClaudeProvider` instance.

Prompt templates live in `src/ai/prompts/`:
- `extract.ts` — system + user prompts for entity extraction
- `disambiguate.ts` — candidate matching prompt
- `consult.ts` — system + user prompts for RAG consultation

---

## Search and consultation

**Search** (`src/core/search.ts`):
1. If `queryEmbedding.length > 0`: cosine similarity over all documents with stored embeddings
2. Else: MongoDB `$text` search (requires the text indexes created by `initDb()`)
3. Last resort: recency sort

`searchEntries()` and `searchEntities()` both follow this same three-tier fallback.

**Consultation** (`src/core/consult.ts`):
1. `embed(question)` → always returns `[]` currently
2. `searchEntries()` + `searchEntities()` with the question text
3. `ai.consult(question, entries, entities)` — streams answer to stdout

---

## Entity types (seeded on first run)

11 types defined in `src/db/seed/default-schemas.ts`. Claude extracts these automatically from log entries.

| typeId | Notable fields |
|---|---|
| `person` | role, department, reporting_to (entity_ref), trust_level (enum: high/medium/low/unknown) |
| `org_unit` | level (enum: company/division/department/team/squad), parent_unit, head |
| `project` | status (planning/active/blocked/shipped/cancelled), owner, priority (p0-p3), launch_date, blockers |
| `initiative` | vision, status, type (strategic/tactical), success_criteria |
| `decision` | options_considered, chosen_option, rationale, decided_by, decided_at, **revisit_trigger** |
| `experiment` | hypothesis, metric, variant_description, status (planned/running/completed/cancelled), result |
| `customer` | tier (enterprise/mid-market/smb/free), champion (entity_ref), arr, health_status |
| `situation` | category, status (active/resolved/stalled/watching), involved_parties, resolution |
| `meeting` | date, attendees (entity_ref[]), agenda, outcomes, action_items |
| `risk` | probability (enum), impact (enum), mitigation_plan |
| `reflection` | category (lesson/pattern/mistake/win), key_insights, related_entities |

To add a new entity type: insert a new `SchemaDoc` into the `_schemas` collection (or via a future `pwork schema add` command). The next `pwork log` will automatically include it in the schema context sent to Claude.

---

## Environment / config

Required env var:
- `ANTHROPIC_API_KEY` — used by `ClaudeProvider` constructor; throws if missing

Optional env vars (with defaults):
- `MONGODB_URI` — defaults to `mongodb://localhost:27017`
- `MONGODB_DB` — defaults to `pwork`
- `PWORK_HOME` — not currently used at runtime (reserved for future config)

Load from `.env` via `import "dotenv/config"` at the top of `src/cli/index.ts`.

---

## Build and run

```bash
npm install
npm run build          # tsc → dist/
node dist/cli/index.js log
```

Requires `mongod` running locally. The `initDb()` call on first run creates indexes and seeds schemas.

TypeScript config: `"module": "ESNext"`, `"moduleResolution": "bundler"`, `"strict": true`. All imports use `.js` extension (ESM convention).

---

## Known gaps / future work

- **Embeddings**: `embed()` is a stub. When an Anthropic embedding API becomes available (or when adding a local model via `@xenova/transformers`), implement it in `ClaudeProvider.embed()` — the search layer will automatically use it.
- **Schema evolution command**: `pwork schema add` (AI-proposed new entity types) is designed but not implemented. The `_schemas` collection is ready for it.
- **Situation synthesis**: there's an `awaiting_summary_confirmation` state in the state machine that's currently skipped — the session goes directly to `commitSession`. A future step would have Claude synthesize a situation update for user review before committing.
- **`thinking: { type: "adaptive" }` cast**: will need to be removed once `@anthropic-ai/sdk` types catch up.
