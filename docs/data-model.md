# Data Model

All TypeScript types live in `src/types.ts`. All MongoDB CRUD lives in `src/db/collections/`.

## Collections

| Collection | Purpose |
|---|---|
| `_schemas` | Entity type definitions — versioned, approval-gated |
| `_schema_history` | Immutable audit log of schema changes |
| `entities` | Knowledge graph nodes |
| `entries` | Raw journal entries (raw text + entity/situation links) |
| `situations` | Temporal clusters spanning multiple entries |
| `_processing_sessions` | Ingest state machine state; TTL index on `expiresAt` (24h) |

Indexes are created by `initDb()` in `src/db/init.ts` on first run. Text indexes on `entities` (name, fields) and `entries` (rawText) enable the MongoDB text search fallback in `src/core/search.ts`.

## Document shapes

### Entity
```typescript
{
  entityId: string            // stable UUID
  typeId: string              // "person" | "project" | etc.
  name: string
  _schemaVersion: number
  fields: Record<string, unknown>    // dynamic — defined by the typeId's schema
  relationships: EntityRelationship[] // outgoing graph edges, stored on the entity
  tags: string[]
  insights?: { summary: string; sentiment: "positive"|"neutral"|"negative"|"mixed"; generatedAt: Date }
  embedding?: number[]        // stub — unused; search falls back to text
  createdAt: Date
  updatedAt: Date
  lastMentionedAt: Date
}
```

### EntityRelationship (embedded in Entity)
```typescript
{
  relationshipId: string
  label: string               // e.g. "works_with", "owns", "has_stakeholder"
  targetEntityId: string
  targetName: string
  targetTypeId: string
}
```

### Entry
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

### Situation
```typescript
{
  situationId: string
  name: string
  category: string
  status: "active" | "resolved" | "stalled" | "watching"
  involvedEntityIds: string[]
  relatedEntryIds: string[]
  summary: string
  outcome?: string
  startDate: Date
  endDate?: Date
  createdAt: Date
  updatedAt: Date
}
```

### ProcessingSession
```typescript
{
  sessionId: string
  rawText: string
  state: "raw" | "awaiting_extraction_review" | "awaiting_disambiguation"
       | "awaiting_summary_confirmation" | "committed" | "abandoned"
  extraction?: ExtractionResult        // what AI extracted
  extractionApproved?: ExtractionResult // what the user approved
  disambiguation?: DisambiguationItem[]
  expiresAt: Date    // TTL field — MongoDB auto-deletes after 24h
  createdAt: Date
  updatedAt: Date
}
```

### SchemaDoc (`_schemas`)
```typescript
{
  typeId: string             // "person", "decision", etc.
  displayName: string
  version: number
  fields: FieldDefinition[]  // { fieldId, label, dataType, required, enumValues? }
  relationships: RelationshipDefinition[]
  createdBy: "system" | "user" | "ai"
  approvedAt: Date | null    // null = pending approval; only approved schemas sent to AI
  deprecated: boolean
  createdAt: Date
}
```

## Entity types (seeded on first run)

Defined in `src/db/seed/default-schemas.ts`. Added to `_schemas` only when the collection is empty.

| typeId | Notable fields |
|---|---|
| `person` | role, department, reporting_to (entity_ref), trust_level (enum: high/medium/low/unknown) |
| `org_unit` | level (enum: company/division/department/team/squad), parent_unit (entity_ref), head (entity_ref) |
| `project` | status (planning/active/blocked/shipped/cancelled), owner (entity_ref), priority (p0–p3), launch_date, blockers |
| `initiative` | vision, status, type (strategic/tactical), success_criteria |
| `decision` | options_considered, chosen_option, rationale, decided_by (entity_ref), decided_at, revisit_trigger |
| `experiment` | hypothesis, metric, variant_description, status (planned/running/completed/cancelled), result |
| `customer` | tier (enterprise/mid-market/smb/free), champion (entity_ref), arr, health_status |
| `situation` | category, status (active/resolved/stalled/watching), involved_parties, resolution |
| `meeting` | date, attendees (entity_ref[]), agenda, outcomes, action_items |
| `risk` | probability (enum: low/medium/high/critical), impact (enum: low/medium/high/critical), mitigation_plan |
| `reflection` | category (lesson/pattern/mistake/win), key_insights, related_entities |

To add a new entity type: insert a `SchemaDoc` with `approvedAt` set and `deprecated: false` into `_schemas`. The next `pwork log` will include it in the schema context sent to Claude.
