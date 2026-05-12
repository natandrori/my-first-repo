# pwork — Claude Session Context

`pwork` is a local-first CLI for a Group PM. The user logs free-text daily notes; Claude AI extracts structured entities and stores them in a MongoDB knowledge graph. Plain-English questions get AI-synthesized answers grounded in the full logged history.

---

## Project integrity rules

**After every change, run `npm run build` and fix all TypeScript errors before committing.** The project must always compile clean.

- **`src/types.ts` is the source of truth.** Before changing any interface or type, grep for all usages across `src/`. Update every callsite in the same commit — never leave a type change that breaks downstream code.
- **Exported function signatures are a contract.** Before renaming or removing an export, confirm nothing in `src/` or `src/cli/` depends on it.
- **All imports use `.js` extensions** (ESM + `"moduleResolution": "bundler"`). New files must follow this convention or the build breaks.
- **MongoDB collection access goes through `src/db/collections/`.** Do not call `getDb()` and query collections directly from `core/` or `cli/` — route through the collection helpers.
- **The AI and DB layers must not call each other.** Dependency direction is: `cli/ → core/ → ai/` and `core/ → db/`. Keep it that way.

---

## Architecture

```
src/
├── cli/        # Commander.js commands + Inquirer prompts
├── ai/         # LLMProvider interface + Claude implementation + prompt templates
├── db/         # MongoDB connection, per-collection CRUD, seed data
├── core/       # Business logic: ingest, search, consultation
└── types.ts    # All shared TypeScript types — read this first
```

**Entry points**

| Command | File | What it does |
|---|---|---|
| `pwork log` | `src/cli/commands/log.ts` | 3-step ingest flow |
| `pwork ask` | `src/cli/commands/ask.ts` | Search + AI synthesis |
| `pwork summary` | `src/cli/commands/summary.ts` | Browse entities, situations, timelines |

All commands call `initDb()` before running and `closeDb()` after. `initDb()` (`src/db/init.ts`) creates indexes and seeds 11 default entity types on first run.

**Models:** Haiku 4.5 for extraction (tool use + prompt caching), Opus 4.7 for consultation (adaptive thinking + streaming).

---

## Where to find details

Read these only when you need to work in that area:

- **Ingest pipeline** (state machine, all 4 functions, step-by-step): [`docs/ingest-pipeline.md`](docs/ingest-pipeline.md)
- **Data model** (all collection schemas, document shapes, entity types): [`docs/data-model.md`](docs/data-model.md)
- **AI layer** (provider interface, extraction, consultation, prompt caching, SDK quirks): [`docs/ai-layer.md`](docs/ai-layer.md)

---

## Environment

Required: `ANTHROPIC_API_KEY`. Optional: `MONGODB_URI` (default: `mongodb://localhost:27017`), `MONGODB_DB` (default: `pwork`). Loaded from `.env` via `dotenv/config`.

Build: `npm run build` → `tsc` → `dist/`. Run: `node dist/cli/index.js <command>`.

---

## Known gaps

- `embed()` is a stub (returns `[]`); search falls back to MongoDB text search automatically.
- `pwork schema add` is designed but not implemented; `_schemas` collection is ready for it.
- `awaiting_summary_confirmation` state is reserved but currently skipped in the pipeline.
