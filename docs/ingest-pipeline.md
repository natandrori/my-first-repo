# Ingest Pipeline — `pwork log`

The log command is a **confirmation-first 3-step state machine**. Nothing is written to the knowledge graph without explicit user approval at each step.

## State machine

```
raw
  → awaiting_extraction_review   (after AI extracts entities)
  → awaiting_disambiguation      (after user approves extraction)
  → awaiting_summary_confirmation  (reserved — currently skipped)
  → committed | abandoned
```

`ProcessingSession` is persisted in MongoDB with a 24h TTL. If the CLI is restarted mid-flow, `getPendingSession()` (`src/db/collections/sessions.ts`) resumes the in-progress session.

## Step-by-step

### Step 1 — AI extraction (`startIngest`)
`src/core/ingest.ts: startIngest(rawText)`

1. Creates a `ProcessingSession` (state: `"raw"`)
2. Calls `buildSchemaContext(db)` to serialize all approved `_schemas` into a prompt string
3. Calls `ai.extractEntities(rawText, schemaContext)` — Haiku with forced tool use
4. Saves `ExtractionResult` to session (state: `"awaiting_extraction_review"`)
5. Returns `sessionId`

`ExtractionResult` shape:
```typescript
{
  entities:      ExtractedEntity[]      // name, typeId, fields, isNew, matchedEntityId?
  relationships: ExtractedRelationship[] // fromName, toName, label
  situations:    ExtractedSituation[]   // name, category, isNew, matchedSituationId?, summary
}
```

The CLI (`src/cli/commands/log.ts`) renders this for the user to review, edit, and approve.

### Step 2 — Disambiguation (`buildDisambiguationItems`)
`src/core/ingest.ts: approveExtraction(sessionId, approved)` advances state to `"awaiting_disambiguation"`.

`buildDisambiguationItems(sessionId)` then:
- Iterates every entity where `isNew === true`
- Calls `findEntitiesByName(db, name, typeId)` to find fuzzy name matches in the `entities` collection
- Returns candidates only when matches exist (no candidates = silently auto-creates)

The CLI (`src/cli/prompts/disambiguation.ts` + `src/cli/commands/log.ts`) presents each ambiguous name with its candidates. The user picks an existing entity or creates a new one. Result is a `Map<name, entityId | null>`.

### Step 3 — Commit (`commitSession`)
`src/core/ingest.ts: commitSession(sessionId, disambiguations: Map<string, string | null>)`

For each extracted entity:
- If `disambiguations.get(name)` returns an existing `entityId`: merge fields into existing entity, update `lastMentionedAt`
- Otherwise: create a new `Entity` with a fresh UUID

For each extracted relationship:
- Resolve both sides to `entityId` via the `nameToEntityId` map built during entity upserts
- Push an `EntityRelationship` onto the `fromEntity.relationships` array (skips if already linked by same label + target)

For each extracted situation:
- If `isNew === false` and `matchedSituationId` exists: update `summary` on the existing situation
- Otherwise: create a new `Situation` (status: `"active"`, `involvedEntityIds` = all entity IDs from this entry)

Finally:
- Creates an `Entry` document with `rawText`, `mentionedEntityIds`, `situationIds`
- Marks session `"committed"`

## Key files

| File | Role |
|---|---|
| `src/core/ingest.ts` | All four pipeline functions |
| `src/db/collections/sessions.ts` | Session CRUD + `getPendingSession()` |
| `src/db/collections/entities.ts` | `upsertEntity`, `findEntitiesByName` |
| `src/db/collections/situations.ts` | `upsertSituation`, `getSituation` |
| `src/db/collections/entries.ts` | `createEntry` |
| `src/cli/commands/log.ts` | CLI orchestration of all three steps |
| `src/cli/prompts/disambiguation.ts` | Interactive disambiguation UI |
