import * as readline from "readline";
import { startIngest, approveExtraction, buildDisambiguationItems, commitSession } from "../../core/ingest.js";
import { reviewExtraction } from "../prompts/confirmation.js";
import { disambiguateEntity } from "../prompts/disambiguation.js";
import { getDb } from "../../db/client.js";
import { getProvider } from "../../ai/index.js";

async function readMultilineInput(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin });
  const lines: string[] = [];

  console.log('Type your log entry. Press Ctrl+D when done.\n');

  return new Promise((resolve, reject) => {
    rl.on("line", (line) => lines.push(line));
    rl.on("close", () => resolve(lines.join("\n").trim()));
    rl.on("error", reject);
  });
}

export async function logCommand(textArg?: string): Promise<void> {
  await getDb(); // ensure connected

  let rawText: string;
  if (textArg) {
    rawText = textArg.trim();
  } else {
    rawText = await readMultilineInput();
  }

  if (!rawText) {
    console.log("No text provided. Aborting.");
    return;
  }

  console.log("\n⏳ Extracting entities from your entry…");

  let sessionId: string;
  try {
    sessionId = await startIngest(rawText);
  } catch (err) {
    console.error("Extraction failed:", err);
    return;
  }

  // Get the session state (extraction is stored in DB)
  const { getSession } = await import("../../db/collections/sessions.js");
  const db = await getDb();
  const session = await getSession(db, sessionId);
  if (!session?.extraction) {
    console.error("Session state lost after extraction.");
    return;
  }

  // Step 1: Review extraction
  const approved = await reviewExtraction(session.extraction);
  if (!approved) {
    console.log("Entry discarded.");
    const { updateSession } = await import("../../db/collections/sessions.js");
    await updateSession(db, sessionId, { state: "abandoned" });
    return;
  }

  await approveExtraction(sessionId, approved);

  // Step 2: Disambiguation
  const disambigItems = await buildDisambiguationItems(sessionId);
  const disambiguations = new Map<string, string | null>();

  for (const item of disambigItems) {
    // Try AI disambiguation first, then ask user if ambiguous
    const ai = getProvider();
    const aiResult = await ai.disambiguate(
      item.extractedName,
      item.extractedTypeId,
      item.candidates,
      rawText
    );

    if (!aiResult.createNew && aiResult.chosenEntityId) {
      // AI is confident — still show and confirm
      const match = item.candidates.find((c) => c.entityId === aiResult.chosenEntityId);
      if (match) {
        console.log(
          `\n  AI matched "${item.extractedName}" → existing ${match.typeId}: ${match.name}`
        );
        disambiguations.set(item.extractedName, aiResult.chosenEntityId);
        continue;
      }
    }

    // Ask user
    const chosen = await disambiguateEntity(
      item.extractedName,
      item.extractedTypeId,
      item.candidates
    );
    disambiguations.set(item.extractedName, chosen);
  }

  // Step 3: Commit
  console.log("\n⏳ Saving to knowledge graph…");
  try {
    const result = await commitSession(sessionId, disambiguations);
    console.log(
      `\n✓ Entry saved — ${result.entityIds.length} entities, ${result.situationIds.length} situations updated.`
    );
  } catch (err) {
    console.error("Failed to commit:", err);
  }
}
