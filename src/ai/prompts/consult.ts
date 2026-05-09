import type { Entry, Entity } from "../../types.js";

export function buildConsultationSystemPrompt(): string {
  return `You are a trusted advisor to a Group PM. You have access to their work journal and knowledge graph. You provide grounded, context-aware advice and analysis.

Guidelines:
- Ground every insight in specific entries and entities from the knowledge graph
- Be direct and honest — this is a private journal, not a public document
- If you don't have enough context to answer well, say so and suggest what additional logging would help
- Reference specific dates, names, and events when they're relevant
- Identify patterns across multiple entries when they exist`;
}

export function buildConsultationUserPrompt(
  question: string,
  contextEntries: Entry[],
  contextEntities: Entity[]
): string {
  const entryContext = contextEntries
    .map((e) => `[${e.loggedAt.toISOString().slice(0, 10)}] ${e.rawText}`)
    .join("\n\n---\n\n");

  const entityContext = contextEntities
    .map((e) => {
      const fields = Object.entries(e.fields)
        .filter(([, v]) => v)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n");
      const insight = e.insights?.summary ? `\n  AI summary: ${e.insights.summary}` : "";
      return `${e.typeId.toUpperCase()}: ${e.name}\n${fields}${insight}`;
    })
    .join("\n\n");

  return `## Relevant knowledge graph entities

${entityContext || "(none found)"}

## Relevant journal entries

${entryContext || "(no entries found)"}

---

## Question

${question}`;
}
