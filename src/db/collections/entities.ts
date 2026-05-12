import type { Db } from "mongodb";
import type { Entity } from "../../types.js";

export function entitiesCol(db: Db) {
  return db.collection<Entity>("entities");
}

export async function initEntityIndexes(db: Db) {
  const col = entitiesCol(db);
  await col.createIndex({ entityId: 1 }, { unique: true });
  await col.createIndex({ typeId: 1 });
  await col.createIndex({ name: "text" });
  await col.createIndex({ tags: 1 });
  await col.createIndex({ lastMentionedAt: -1 });
}

export async function getEntity(db: Db, entityId: string): Promise<Entity | null> {
  return entitiesCol(db).findOne({ entityId });
}

export async function findEntitiesByType(db: Db, typeId: string): Promise<Entity[]> {
  return entitiesCol(db).find({ typeId }).sort({ lastMentionedAt: -1 }).toArray();
}

export async function findEntitiesByName(db: Db, name: string, typeId?: string): Promise<Entity[]> {
  const filter: Record<string, unknown> = { $text: { $search: name } };
  if (typeId) filter.typeId = typeId;
  return entitiesCol(db).find(filter).limit(10).toArray();
}

export async function findAllEntities(db: Db): Promise<Entity[]> {
  return entitiesCol(db).find({}).sort({ lastMentionedAt: -1 }).toArray();
}

export async function upsertEntity(db: Db, entity: Entity): Promise<void> {
  await entitiesCol(db).replaceOne({ entityId: entity.entityId }, entity, { upsert: true });
}

export async function getEntitiesWithEmbeddings(db: Db): Promise<Entity[]> {
  return entitiesCol(db).find({ embedding: { $exists: true } }).toArray();
}
