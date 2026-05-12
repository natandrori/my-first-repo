import { select } from "@inquirer/prompts";
import type { Entity } from "../../types.js";

export async function disambiguateEntity(
  name: string,
  typeId: string,
  candidates: Entity[]
): Promise<string | null> {
  console.log(`\n── Disambiguation: "${name}" (${typeId}) ──`);

  const choices = [
    ...candidates.map((c) => {
      const fields = Object.entries(c.fields)
        .filter(([, v]) => v)
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      return {
        name: `Use existing: ${c.name}${fields ? ` (${fields})` : ""}`,
        value: c.entityId,
      };
    }),
    { name: `Create new entity: ${name}`, value: "new" },
  ];

  const chosen = await select({
    message: `Is "${name}" an existing entity or a new one?`,
    choices,
  });

  return chosen === "new" ? null : chosen;
}
