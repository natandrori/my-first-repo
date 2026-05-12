import type { Db } from "mongodb";
import type { Situation } from "../../types.js";

export function situationsCol(db: Db) {
  return db.collection<Situation>("situations");
}

export async function initSituationIndexes(db: Db) {
  const col = situationsCol(db);
  await col.createIndex({ situationId: 1 }, { unique: true });
  await col.createIndex({ status: 1 });
  await col.createIndex({ involvedEntityIds: 1 });
}

export async function upsertSituation(db: Db, situation: Situation): Promise<void> {
  await situationsCol(db).replaceOne(
    { situationId: situation.situationId },
    situation,
    { upsert: true }
  );
}

export async function getActiveSituations(db: Db): Promise<Situation[]> {
  return situationsCol(db).find({ status: { $in: ["active", "watching"] } }).toArray();
}

export async function getSituationsForEntity(db: Db, entityId: string): Promise<Situation[]> {
  return situationsCol(db)
    .find({ involvedEntityIds: entityId })
    .sort({ startDate: -1 })
    .toArray();
}

export async function getSituation(db: Db, situationId: string): Promise<Situation | null> {
  return situationsCol(db).findOne({ situationId });
}
