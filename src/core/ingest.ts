import { randomUUID } from "crypto";
import type { Db } from "mongodb";
import type {
  ProcessingSession,
  ExtractionResult,
  ExtractedEntity,
  Entity,
  Entry,
  Situation,
} from "../types.js";
import { getDb } from "../db/client.js";
import { buildSchemaContext } from "../db/collections/schemas.js";
import { createSession, updateSession, getSession } from "../db/collections/sessions.js";
import { upsertEntity, getEntity, findEntitiesByName } from "../db/collections/entities.js";
import { createEntry } from "../db/collections/entries.js";
import { upsertSituation, getSituation } from "../db/collections/situations.js";
import { getProvider } from "../ai/index.js";

export async function startIngest(rawText: string): Promise<string> {
  const db = await getDb();
  const sessionId = randomUUID();
  const now = new Date();

  const session: ProcessingSession = {
    sessionId,
    rawText,
    state: "raw",
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  };
  await createSession(db, session);

  // Step 1: AI extraction
  const schemaContext = await buildSchemaContext(db);
  const ai = getProvider();
  const extraction = await ai.extractEntities(rawText, schemaContext);

  await updateSession(db, sessionId, {
    state: "awaiting_extraction_review",
    extraction,
  });

  return sessionId;
}

export async function approveExtraction(
  sessionId: string,
  approved: ExtractionResult
): Promise<void> {
  const db = await getDb();
  await updateSession(db, sessionId, {
    state: "awaiting_disambiguation",
    extractionApproved: approved,
  });
}

export async function buildDisambiguationItems(sessionId: string): Promise<
  Array<{
    extractedName: string;
    extractedTypeId: string;
    candidates: Entity[];
  }>
> {
  const db = await getDb();
  const session = await getSession(db, sessionId);
  if (!session?.extractionApproved) return [];

  const items = [];
  for (const entity of session.extractionApproved.entities) {
    if (!entity.isNew) continue;
    const candidates = await findEntitiesByName(db, entity.name, entity.typeId);
    if (candidates.length > 0) {
      items.push({
        extractedName: entity.name,
        extractedTypeId: entity.typeId,
        candidates,
      });
    }
  }
  return items;
}

export async function commitSession(
  sessionId: string,
  disambiguations: Map<string, string | null>
): Promise<{ entryId: string; entityIds: string[]; situationIds: string[] }> {
  const db = await getDb();
  const session = await getSession(db, sessionId);
  if (!session?.extractionApproved) {
    throw new Error("Session not in committable state");
  }

  const now = new Date();
  const extraction = session.extractionApproved;
  const entityIds: string[] = [];
  const situationIds: string[] = [];

  // Resolve and upsert entities
  const nameToEntityId = new Map<string, string>();

  for (const extracted of extraction.entities) {
    let entityId: string;

    // Check if user chose an existing entity during disambiguation
    const chosenId = disambiguations.get(extracted.name);
    if (chosenId) {
      // Update existing entity with new info
      const existing = await getEntity(db, chosenId);
      if (existing) {
        const updated: Entity = {
          ...existing,
          fields: { ...existing.fields, ...extracted.fields },
          lastMentionedAt: now,
          updatedAt: now,
        };
        await upsertEntity(db, updated);
        entityId = chosenId;
      } else {
        entityId = chosenId;
      }
    } else {
      // Create new entity
      entityId = randomUUID();
      const entity: Entity = {
        entityId,
        typeId: extracted.typeId,
        name: extracted.name,
        _schemaVersion: 1,
        fields: extracted.fields,
        relationships: [],
        tags: [],
        createdAt: now,
        updatedAt: now,
        lastMentionedAt: now,
      };
      await upsertEntity(db, entity);
    }

    nameToEntityId.set(extracted.name, entityId);
    entityIds.push(entityId);
  }

  // Update relationships on entities
  for (const rel of extraction.relationships) {
    const fromId = nameToEntityId.get(rel.fromName);
    const toId = nameToEntityId.get(rel.toName);
    if (!fromId || !toId) continue;

    const fromEntity = await getEntity(db, fromId);
    const toEntity = await getEntity(db, toId);
    if (!fromEntity || !toEntity) continue;

    const alreadyLinked = fromEntity.relationships.some(
      (r) => r.targetEntityId === toId && r.label === rel.label
    );
    if (!alreadyLinked) {
      fromEntity.relationships.push({
        relationshipId: randomUUID(),
        targetEntityId: toId,
        targetName: toEntity.name,
        targetTypeId: toEntity.typeId,
        label: rel.label,
      });
      await upsertEntity(db, { ...fromEntity, updatedAt: now });
    }
  }

  // Upsert situations
  for (const extractedSit of extraction.situations) {
    let situationId: string;

    if (!extractedSit.isNew && extractedSit.matchedSituationId) {
      situationId = extractedSit.matchedSituationId;
      const existing = await getSituation(db, situationId);
      if (existing) {
        await upsertSituation(db, {
          ...existing,
          summary: extractedSit.summary,
          updatedAt: now,
        });
      }
    } else {
      situationId = randomUUID();
      const situation: Situation = {
        situationId,
        name: extractedSit.name,
        category: extractedSit.category,
        status: "active",
        involvedEntityIds: entityIds,
        relatedEntryIds: [],
        summary: extractedSit.summary,
        startDate: now,
        createdAt: now,
        updatedAt: now,
      };
      await upsertSituation(db, situation);
    }

    situationIds.push(situationId);
  }

  // Create the journal entry
  const entryId = randomUUID();
  const entry: Entry = {
    entryId,
    rawText: session.rawText,
    mentionedEntityIds: entityIds,
    situationIds,
    loggedAt: now,
    createdAt: now,
  };
  await createEntry(db, entry);

  // Mark session committed
  await updateSession(db, sessionId, { state: "committed" });

  return { entryId, entityIds, situationIds };
}
