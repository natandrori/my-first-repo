# pwork — Personal Work OS

A local-first CLI that turns your free-text daily notes into a queryable knowledge graph. Built for Group PMs who carry a lot of context across people, projects, decisions, and situations — and want to stop losing it.

## The problem it solves

PMs hold enormous amounts of context in their heads: who said what, which decisions were made and why, which situations are simmering, who can be trusted with what. This context degrades the moment it's not written down, and it's nearly impossible to search across when you need it later.

`pwork` is a daily logging habit with a knowledge graph as its output. You write casually; the AI structures it. You ask questions later in plain English; it answers from your history.

---

## How it works

### The logging flow

```
pwork log
  │
  ├─ You type a free-text daily update (multi-line, Ctrl+D to finish)
  │
  ├─ [Step 1] Claude Haiku extracts entities, relationships, and situations
  │           Shows you what it found — you approve or cancel
  │
  ├─ [Step 2] For ambiguous names, Claude and you disambiguate:
  │           "Is this Alice Chen (Platform) or Alice Rodriguez (Growth)?"
  │
  └─ [Step 3] Commit to MongoDB — entities upserted, entry saved, situations updated
```

### The consultation flow

```
pwork ask "Should I promote Alice given what's happened this quarter?"
  │
  ├─ Searches journal entries and entities for relevant context
  │
  └─ Claude Opus 4.7 synthesizes a grounded answer, streaming in real time
```

### The knowledge graph

Everything is stored as typed entities in MongoDB. Entities are linked by relationships. Journal entries are the raw evidence. Situations are temporal clusters — ongoing conflicts, negotiations, dependencies — that span multiple entries and entities over time.

---

## Setup

**Prerequisites**

- Node.js 20+
- `mongod` running locally (default: `mongodb://localhost:27017`)
- An Anthropic API key (`claude-haiku-4-5` for extraction, `claude-opus-4-7` for consultation)

**Install**

```bash
git clone <repo>
cd my-first-repo
npm install
npm run build
```

**Configure**

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

**Run**

```bash
# First run seeds the database with 11 default entity types
node dist/cli/index.js log
```

Or add a shell alias:

```bash
alias pwork="node /path/to/my-first-repo/dist/cli/index.js"
```

---

## Commands

### `pwork log [text]`

Log a work entry. Without an argument, opens a multi-line prompt (Ctrl+D to submit).

```bash
pwork log
pwork log "Had 1:1 with Alice. She's frustrated about the Q3 timeline slip."
```

### `pwork ask [question]`

Ask your knowledge graph anything. Claude answers using your logged history as context.

```bash
pwork ask "How is my relationship with Alice trending?"
pwork ask "What decisions are we still waiting on for the mobile project?"
pwork ask "Who do I need to align with before the Q4 planning meeting?"
```

### `pwork summary`

Browse your knowledge graph.

```bash
pwork summary                       # overview of people, projects, situations
pwork summary --person Alice        # Alice's full profile + recent mentions
pwork summary --project "Q3 launch" # project entity + related history
pwork summary --situation           # list all active situations
pwork summary --week                # this week's entries
pwork summary --entity "billing"    # any entity by name fragment
```

---

## Entity types

On first run, 11 entity types are seeded. Claude will extract these automatically from your log entries.

| Type | What it tracks |
|---|---|
| `person` | Role, department, reporting chain, trust level |
| `org_unit` | Teams, divisions, their heads and mandates |
| `project` | Status, owner, priority, blockers, launch date |
| `initiative` | Strategic/tactical goals, success criteria |
| `decision` | Options considered, rationale, decided by, revisit trigger |
| `experiment` | A/B tests — hypothesis, metric, status, result |
| `customer` | Account tier, champion, ARR, health, last contact |
| `situation` | Ongoing conflicts, negotiations, dependencies, risks |
| `meeting` | Attendees, agenda, outcomes, action items |
| `risk` | Probability, impact, mitigation plan |
| `reflection` | Lessons, patterns, mistakes, wins |

---

## Architecture

```
src/
├── cli/
│   ├── index.ts              # Commander.js entry — log, ask, summary
│   ├── commands/
│   │   ├── log.ts            # Drives the 3-step ingest flow
│   │   ├── ask.ts            # Consultation command
│   │   └── summary.ts        # Browse entities, timelines, situations
│   └── prompts/
│       ├── confirmation.ts   # Extraction review UI (Inquirer)
│       └── disambiguation.ts # Entity matching UI
├── ai/
│   ├── claude.ts             # Anthropic SDK implementation
│   │   │                       Haiku for extraction (tool use + prompt caching)
│   │   │                       Opus 4.7 for consultation (adaptive thinking + streaming)
│   ├── prompts/              # Prompt templates for each AI step
│   └── index.ts              # Provider singleton
├── db/
│   ├── client.ts             # MongoDB connection singleton
│   ├── collections/          # One file per collection — CRUD operations
│   └── seed/
│       └── default-schemas.ts  # 11 entity type definitions
├── core/
│   ├── ingest.ts             # 3-step confirmation pipeline
│   ├── search.ts             # Cosine similarity + MongoDB text search fallback
│   └── consult.ts            # RAG consultation orchestration
└── types.ts                  # All shared TypeScript types
```

**MongoDB collections**

| Collection | Purpose |
|---|---|
| `_schemas` | Entity type definitions — versioned, growable |
| `_schema_history` | Immutable audit log of schema changes |
| `entities` | Knowledge graph nodes |
| `entries` | Raw journal entries, linked to entities and situations |
| `situations` | Temporal clusters spanning multiple entries |
| `_processing_sessions` | Stateful ingest sessions (auto-expire 24h) |

---

## Design principles

**Confirmation-first**: Claude proposes; you confirm. Nothing is written to the graph without your explicit approval at each step.

**Schema evolution**: Entity types and fields are stored in MongoDB, not hardcoded. The schema can grow as your work evolves.

**Local today, cloud-ready tomorrow**: `mongod` locally now; the connection string is just an env var (`MONGODB_URI`). Swap to Atlas when you're ready.

**Search degrades gracefully**: Vector embeddings aren't implemented yet — the search layer falls back cleanly to MongoDB full-text search. Embeddings can be added without changing the interface.
