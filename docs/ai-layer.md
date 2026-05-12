# AI Layer

## Provider interface

`LLMProvider` in `src/types.ts` — all AI calls go through this interface, keeping the rest of the codebase provider-agnostic.

```typescript
interface LLMProvider {
  extractEntities(text: string, schemaContext: string): Promise<ExtractionResult>
  embed(text: string): Promise<number[]>
  disambiguate(name: string, typeId: string, candidates: Entity[], context: string): Promise<{ chosenEntityId?: string; createNew: boolean }>
  consult(question: string, contextEntries: Entry[], contextEntities: Entity[]): Promise<string>
}
```

The singleton is in `src/ai/index.ts` — `getProvider()` returns a cached `ClaudeProvider`.

## ClaudeProvider (`src/ai/claude.ts`)

### Models
```typescript
const EXTRACTION_MODEL   = "claude-haiku-4-5";   // fast + cheap; tool use
const CONSULTATION_MODEL = "claude-opus-4-7";    // full reasoning; streaming
```

### Extraction
Uses **forced tool use** so the output is always structured JSON, never free text:
```typescript
tool_choice: { type: "tool", name: "extract_entities" }
```

The system prompt (schema context) is **prompt-cached** to avoid re-tokenizing the full schema on every call within a session:
```typescript
system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }]
```

Schema context is built by `buildSchemaContext()` in `src/db/collections/schemas.ts` — it serializes all approved, non-deprecated `_schemas` into a compact prompt string.

### Embeddings
`embed()` returns `[]` — there is no Anthropic embeddings API endpoint. The search layer in `src/core/search.ts` detects `queryEmbedding.length === 0` and falls back to MongoDB `$text` search automatically.

### Consultation
Uses `stream()` with **adaptive thinking** and real-time stdout output:
```typescript
thinking: { type: "adaptive" } as any   // "as any" required — SDK 0.39.0 types don't include "adaptive"
max_tokens: 16000
```
Text deltas stream to stdout via `stream.on("text", delta => process.stdout.write(delta))`. The system prompt is also prompt-cached here.

### Disambiguation
Calls Haiku with a plain text prompt (no tool use). Parses JSON from the response text with a regex fallback (`/\{[\s\S]*\}/`). Returns `{ createNew: true }` on any parse failure.

## Prompt templates

| File | Used by |
|---|---|
| `src/ai/prompts/extract.ts` | `extractEntities()` — system prompt includes schema context; user prompt wraps the raw log text |
| `src/ai/prompts/disambiguate.ts` | `disambiguate()` — lists candidates with their fields, asks Claude to pick or create new |
| `src/ai/prompts/consult.ts` | `consult()` — system prompt sets the PM advisor persona; user prompt includes retrieved entries + entities + the question |

## Known SDK quirks

- `thinking: { type: "adaptive" }` requires `as any` — the `ThinkingConfigParam` type in `@anthropic-ai/sdk@0.39.0` only allows `"enabled" | "disabled"`. Remove the cast once the SDK types are updated.
- Prompt caching (`cache_control: { type: "ephemeral" }`) on system messages requires the system prompt to be passed as an array of content blocks, not a plain string.
