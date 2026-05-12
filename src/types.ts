import type { ObjectId } from "mongodb";

// ── Schema types ─────────────────────────────────────────────────────────────

export type FieldDataType =
  | "string"
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "enum"
  | "string[]"
  | "entity_ref"
  | "entity_ref[]";

export interface FieldDefinition {
  fieldId: string;
  label: string;
  dataType: FieldDataType;
  required: boolean;
  enumValues?: string[];
  description?: string;
}

export interface RelationshipDefinition {
  relationshipId: string;
  label: string;
  targetTypeId: string | "*";
  cardinality: "one" | "many";
}

export interface SchemaDoc {
  _id?: ObjectId;
  typeId: string;
  displayName: string;
  version: number;
  fields: FieldDefinition[];
  relationships: RelationshipDefinition[];
  createdBy: "system" | "user" | "ai";
  approvedAt: Date | null;
  deprecated: boolean;
  createdAt: Date;
}

// ── Entity types ──────────────────────────────────────────────────────────────

export interface EntityRelationship {
  relationshipId: string;
  label: string;
  targetEntityId: string;
  targetName: string;
  targetTypeId: string;
}

export interface EntityInsight {
  summary: string;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  generatedAt: Date;
}

export interface Entity {
  _id?: ObjectId;
  entityId: string;
  typeId: string;
  name: string;
  _schemaVersion: number;
  fields: Record<string, unknown>;
  relationships: EntityRelationship[];
  tags: string[];
  insights?: EntityInsight;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
  lastMentionedAt: Date;
}

// ── Entry types ───────────────────────────────────────────────────────────────

export interface Entry {
  _id?: ObjectId;
  entryId: string;
  rawText: string;
  mentionedEntityIds: string[];
  situationIds: string[];
  embedding?: number[];
  loggedAt: Date;
  createdAt: Date;
}

// ── Situation types ───────────────────────────────────────────────────────────

export type SituationStatus = "active" | "resolved" | "stalled" | "watching";

export interface Situation {
  _id?: ObjectId;
  situationId: string;
  name: string;
  category: string;
  status: SituationStatus;
  involvedEntityIds: string[];
  relatedEntryIds: string[];
  summary: string;
  outcome?: string;
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── Processing session types ──────────────────────────────────────────────────

export type SessionState =
  | "raw"
  | "awaiting_extraction_review"
  | "awaiting_disambiguation"
  | "awaiting_summary_confirmation"
  | "committed"
  | "abandoned";

export interface ExtractedEntity {
  name: string;
  typeId: string;
  fields: Record<string, unknown>;
  isNew: boolean;
  matchedEntityId?: string;
}

export interface ExtractedRelationship {
  fromName: string;
  toName: string;
  label: string;
}

export interface ExtractedSituation {
  name: string;
  category: string;
  isNew: boolean;
  matchedSituationId?: string;
  summary: string;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  situations: ExtractedSituation[];
}

export interface DisambiguationItem {
  extractedName: string;
  extractedTypeId: string;
  candidates: Array<{ entityId: string; name: string; typeId: string; fields: Record<string, unknown> }>;
  chosenEntityId?: string;
  createNew?: boolean;
}

export interface ProcessingSession {
  _id?: ObjectId;
  sessionId: string;
  rawText: string;
  state: SessionState;
  extraction?: ExtractionResult;
  extractionApproved?: ExtractionResult;
  disambiguation?: DisambiguationItem[];
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── AI provider interface ─────────────────────────────────────────────────────

export interface LLMProvider {
  extractEntities(text: string, schemaContext: string): Promise<ExtractionResult>;
  embed(text: string): Promise<number[]>;
  disambiguate(
    name: string,
    typeId: string,
    candidates: Entity[],
    context: string
  ): Promise<{ chosenEntityId?: string; createNew: boolean }>;
  consult(
    question: string,
    contextEntries: Entry[],
    contextEntities: Entity[]
  ): Promise<string>;
}
