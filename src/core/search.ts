import type { Db } from "mongodb";
import type { Entry, Entity } from "../types.js";
import { getEntriesWithEmbeddings, entriesCol } from "../db/collections/entries.js";
import { getEntitiesWithEmbeddings, entitiesCol } from "../db/collections/entities.js";

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function searchEntries(
  db: Db,
  queryEmbedding: number[],
  queryText: string,
  topK = 10
): Promise<Entry[]> {
  // If embeddings are available, use cosine similarity
  if (queryEmbedding.length > 0) {
    const entries = await getEntriesWithEmbeddings(db);
    return entries
      .map((e) => ({ entry: e, score: cosineSimilarity(queryEmbedding, e.embedding ?? []) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((r) => r.entry);
  }

  // Fallback: MongoDB text search
  const words = queryText.trim().split(/\s+/).slice(0, 10).join(" ");
  const results = await entriesCol(db)
    .find({ $text: { $search: words } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort({ score: { $meta: "textScore" } } as any)
    .limit(topK)
    .toArray();

  if (results.length > 0) return results;

  // Last resort: recency
  return entriesCol(db).find({}).sort({ loggedAt: -1 }).limit(topK).toArray();
}

export async function searchEntities(
  db: Db,
  queryEmbedding: number[],
  queryText: string,
  topK = 5
): Promise<Entity[]> {
  if (queryEmbedding.length > 0) {
    const entities = await getEntitiesWithEmbeddings(db);
    return entities
      .map((e) => ({ entity: e, score: cosineSimilarity(queryEmbedding, e.embedding ?? []) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((r) => r.entity);
  }

  const words = queryText.trim().split(/\s+/).slice(0, 10).join(" ");
  const results = await entitiesCol(db)
    .find({ $text: { $search: words } })
    .sort({ lastMentionedAt: -1 })
    .limit(topK)
    .toArray();

  if (results.length > 0) return results;

  return entitiesCol(db).find({}).sort({ lastMentionedAt: -1 }).limit(topK).toArray();
}
