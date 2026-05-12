import type { Db } from "mongodb";
import type { SchemaDoc } from "../../types.js";

export function schemasCol(db: Db) {
  return db.collection<SchemaDoc>("_schemas");
}

export function schemaHistoryCol(db: Db) {
  return db.collection<SchemaDoc>("_schema_history");
}

export async function initSchemaIndexes(db: Db) {
  const col = schemasCol(db);
  await col.createIndex({ typeId: 1 }, { unique: true });
}

export async function getSchema(db: Db, typeId: string): Promise<SchemaDoc | null> {
  return schemasCol(db).findOne({ typeId, deprecated: false });
}

export async function getAllSchemas(db: Db): Promise<SchemaDoc[]> {
  return schemasCol(db).find({ deprecated: false, approvedAt: { $ne: null } }).toArray();
}

export async function upsertSchema(db: Db, schema: SchemaDoc): Promise<void> {
  const col = schemasCol(db);
  const existing = await col.findOne({ typeId: schema.typeId });
  if (existing) {
    await schemaHistoryCol(db).insertOne({ ...existing });
    await col.replaceOne({ typeId: schema.typeId }, { ...schema, version: (existing.version ?? 0) + 1 });
  } else {
    await col.insertOne(schema);
  }
}

export async function buildSchemaContext(db: Db): Promise<string> {
  const schemas = await getAllSchemas(db);
  return schemas
    .map((s) => {
      const fields = s.fields.map((f) => `  - ${f.fieldId} (${f.dataType})${f.required ? " [required]" : ""}: ${f.description ?? ""}`).join("\n");
      return `Entity type: ${s.typeId} (${s.displayName})\nFields:\n${fields}`;
    })
    .join("\n\n");
}
