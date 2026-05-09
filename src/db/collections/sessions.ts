import type { Db } from "mongodb";
import type { ProcessingSession } from "../../types.js";

export function sessionsCol(db: Db) {
  return db.collection<ProcessingSession>("_processing_sessions");
}

export async function initSessionIndexes(db: Db) {
  const col = sessionsCol(db);
  await col.createIndex({ sessionId: 1 }, { unique: true });
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await col.createIndex({ state: 1 });
}

export async function createSession(db: Db, session: ProcessingSession): Promise<void> {
  await sessionsCol(db).insertOne(session);
}

export async function updateSession(
  db: Db,
  sessionId: string,
  update: Partial<ProcessingSession>
): Promise<void> {
  await sessionsCol(db).updateOne(
    { sessionId },
    { $set: { ...update, updatedAt: new Date() } }
  );
}

export async function getSession(db: Db, sessionId: string): Promise<ProcessingSession | null> {
  return sessionsCol(db).findOne({ sessionId });
}

export async function getPendingSession(db: Db): Promise<ProcessingSession | null> {
  return sessionsCol(db).findOne({
    state: {
      $in: ["awaiting_extraction_review", "awaiting_disambiguation", "awaiting_summary_confirmation"],
    },
  });
}
