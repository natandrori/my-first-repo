export function buildExtractionSystemPrompt(schemaContext: string): string {
  return `You are an entity extractor for a personal work knowledge graph. Your job is to parse a PM's daily log entry and extract structured entities, relationships, and situations.

## Available entity types

${schemaContext}

## Instructions

Extract every meaningful entity, relationship, and ongoing situation from the log entry. Be thorough — err on the side of extracting more rather than less.

- For each entity: determine its type, name, and any field values you can infer
- For each relationship: identify the source entity, target entity, and the nature of the relationship
- For each situation: identify if it's new or ongoing, its category, and a brief summary

Return ONLY the JSON tool call — no prose, no explanation.`;
}

export function buildExtractionUserPrompt(text: string): string {
  return `Extract all entities, relationships, and situations from this log entry:

---
${text}
---`;
}
