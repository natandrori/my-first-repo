import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ExtractionResult, Entity, Entry } from "../types.js";
import { buildExtractionSystemPrompt, buildExtractionUserPrompt } from "./prompts/extract.js";
import { buildDisambiguationPrompt } from "./prompts/disambiguate.js";
import { buildConsultationSystemPrompt, buildConsultationUserPrompt } from "./prompts/consult.js";

const EXTRACTION_MODEL = "claude-haiku-4-5";
const CONSULTATION_MODEL = "claude-opus-4-7";

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "extract_entities",
  description: "Extract entities, relationships, and situations from a work log entry",
  input_schema: {
    type: "object" as const,
    properties: {
      entities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            typeId: { type: "string" },
            fields: { type: "object" },
            isNew: { type: "boolean" },
            matchedEntityId: { type: "string" },
          },
          required: ["name", "typeId", "fields", "isNew"],
        },
      },
      relationships: {
        type: "array",
        items: {
          type: "object",
          properties: {
            fromName: { type: "string" },
            toName: { type: "string" },
            label: { type: "string" },
          },
          required: ["fromName", "toName", "label"],
        },
      },
      situations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            category: { type: "string" },
            isNew: { type: "boolean" },
            matchedSituationId: { type: "string" },
            summary: { type: "string" },
          },
          required: ["name", "category", "isNew", "summary"],
        },
      },
    },
    required: ["entities", "relationships", "situations"],
  },
};

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    this.client = new Anthropic({ apiKey });
  }

  async extractEntities(text: string, schemaContext: string): Promise<ExtractionResult> {
    const systemPrompt = buildExtractionSystemPrompt(schemaContext);

    const response = await this.client.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: systemPrompt,
          // Cache the schema context — it's stable across calls in the same session
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "extract_entities" },
      messages: [
        { role: "user", content: buildExtractionUserPrompt(text) },
      ],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (!toolUse) {
      return { entities: [], relationships: [], situations: [] };
    }

    return toolUse.input as ExtractionResult;
  }

  async embed(_text: string): Promise<number[]> {
    // Embeddings via Anthropic API are not yet available.
    // Return empty array — search falls back to MongoDB text search.
    return [];
  }

  async disambiguate(
    name: string,
    typeId: string,
    candidates: Entity[],
    context: string
  ): Promise<{ chosenEntityId?: string; createNew: boolean }> {
    if (candidates.length === 0) {
      return { createNew: true };
    }

    const prompt = buildDisambiguationPrompt(name, typeId, candidates, context);

    const response = await this.client.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );

    if (!textBlock) return { createNew: true };

    try {
      // Extract JSON from response (may have surrounding text)
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { createNew: true };
      const result = JSON.parse(jsonMatch[0]) as {
        chosenEntityId?: string | null;
        createNew?: boolean;
      };
      return {
        chosenEntityId: result.chosenEntityId ?? undefined,
        createNew: result.createNew ?? !result.chosenEntityId,
      };
    } catch {
      return { createNew: true };
    }
  }

  async consult(
    question: string,
    contextEntries: Entry[],
    contextEntities: Entity[]
  ): Promise<string> {
    const userPrompt = buildConsultationUserPrompt(question, contextEntries, contextEntities);

    const stream = this.client.messages.stream({
      model: CONSULTATION_MODEL,
      max_tokens: 16000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      thinking: { type: "adaptive" } as any,
      system: [
        {
          type: "text",
          text: buildConsultationSystemPrompt(),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    // Stream to stdout for real-time display
    process.stdout.write("\n");
    stream.on("text", (delta) => {
      process.stdout.write(delta);
    });

    const finalMessage = await stream.finalMessage();
    process.stdout.write("\n\n");

    const textBlock = finalMessage.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );

    return textBlock?.text ?? "(no response)";
  }
}
