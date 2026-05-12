import type { Entity } from "../../types.js";

export function buildDisambiguationPrompt(
  name: string,
  typeId: string,
  candidates: Entity[],
  context: string
): string {
  const candidateList = candidates
    .map((c, i) => {
      const fields = Object.entries(c.fields)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      return `${i + 1}. ${c.name} (${c.typeId}) — ${fields || "no extra fields"}`;
    })
    .join("\n");

  return `You are helping disambiguate an entity reference in a PM's work log.

The log mentions: "${name}" (likely a ${typeId})

Existing matches in the knowledge graph:
${candidateList}

Log context: "${context}"

Based on the context, determine which existing entity this refers to, or if it's a new entity.

Return a JSON object with:
- "chosenEntityId": the entityId of the matching entity (from the list), or null if none match
- "createNew": true if this is clearly a new entity, false if an existing one matches

Be conservative — only match if you're confident.`;
}
