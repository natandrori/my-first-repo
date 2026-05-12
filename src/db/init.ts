import { getDb } from "./client.js";
import { initSchemaIndexes, schemasCol, upsertSchema } from "./collections/schemas.js";
import { initEntityIndexes } from "./collections/entities.js";
import { initEntryIndexes } from "./collections/entries.js";
import { initSituationIndexes } from "./collections/situations.js";
import { initSessionIndexes } from "./collections/sessions.js";
import { DEFAULT_SCHEMAS } from "./seed/default-schemas.js";

export async function initDb(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    initSchemaIndexes(db),
    initEntityIndexes(db),
    initEntryIndexes(db),
    initSituationIndexes(db),
    initSessionIndexes(db),
  ]);

  const existing = await schemasCol(db).countDocuments();
  if (existing === 0) {
    for (const schema of DEFAULT_SCHEMAS) {
      await upsertSchema(db, schema);
    }
    console.log(`Seeded ${DEFAULT_SCHEMAS.length} default entity types.`);
  }
}
