import { confirm, select, checkbox } from "@inquirer/prompts";
import type { ExtractionResult, ExtractedEntity, ExtractedSituation } from "../../types.js";

function formatEntity(e: ExtractedEntity): string {
  const fields = Object.entries(e.fields)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  const status = e.isNew ? "[NEW]" : "[EXISTING]";
  return `  ${status} ${e.typeId}: ${e.name}${fields ? ` (${fields})` : ""}`;
}

export async function reviewExtraction(
  extraction: ExtractionResult
): Promise<ExtractionResult | null> {
  if (
    extraction.entities.length === 0 &&
    extraction.relationships.length === 0 &&
    extraction.situations.length === 0
  ) {
    console.log("\nNo entities extracted from this entry.");
    const proceed = await confirm({
      message: "Save entry anyway (as raw text only)?",
      default: true,
    });
    return proceed ? extraction : null;
  }

  console.log("\n── Extracted entities ──────────────────────────────");
  extraction.entities.forEach((e) => console.log(formatEntity(e)));

  if (extraction.relationships.length > 0) {
    console.log("\n── Relationships ───────────────────────────────────");
    extraction.relationships.forEach((r) =>
      console.log(`  ${r.fromName} → ${r.label} → ${r.toName}`)
    );
  }

  if (extraction.situations.length > 0) {
    console.log("\n── Situations ──────────────────────────────────────");
    extraction.situations.forEach((s) =>
      console.log(
        `  [${s.isNew ? "NEW" : "UPDATE"}] ${s.name} (${s.category}): ${s.summary}`
      )
    );
  }

  console.log("");

  const choice = await select({
    message: "How do you want to proceed?",
    choices: [
      { name: "✓ Looks good, continue", value: "approve" },
      { name: "✗ Cancel (discard this entry)", value: "cancel" },
    ],
  });

  if (choice === "cancel") return null;
  return extraction;
}
