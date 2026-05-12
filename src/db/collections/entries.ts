import type { Db } from "mongodb";
import type { Entry } from "../../types.js";

export function entriesCol(db: Db) {
  return db.collection<Entry>("entries");
}

export async function initEntryIndexes(db: Db) {
  const col = entriesCol(db);
  await col.createIndex({ entryId: 1 }, { unique: true });
  await col.createIndex({ loggedAt: -1 });
  await col.createIndex({ mentionedEntityIds: 1 });
  await col.createIndex({ situationIds: 1 });
}

export async function createEntry(db: Db, entry: Entry): Promise<void> {
  await entriesCol(db).insertOne(entry);
}

export async function getRecentEntries(db: Db, limit = 20): Promise<Entry[]> {
  return entriesCol(db).find({}).sort({ loggedAt: -1 }).limit(limit).toArray();
}

export async function getEntriesForEntity(db: Db, entityId: string): Promise<Entry[]> {
  return entriesCol(db)
    .find({ mentionedEntityIds: entityId })
    .sort({ loggedAt: -1 })
    .toArray();
}

export async function getEntriesWithEmbeddings(db: Db): Promise<Entry[]> {
  return entriesCol(db).find({ embedding: { $exists: true } }).toArray();
}

export async function updateEntryEmbedding(db: Db, entryId: string, embedding: number[]): Promise<void> {
  await entriesCol(db).updateOne({ entryId }, { $set: { embedding } });
}
