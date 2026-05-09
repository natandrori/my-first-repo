import type { Db } from "mongodb";
import { getProvider } from "../ai/index.js";
import { searchEntries, searchEntities } from "./search.js";

export async function consult(db: Db, question: string): Promise<string> {
  const ai = getProvider();
  const queryEmbedding = await ai.embed(question);

  const [contextEntries, contextEntities] = await Promise.all([
    searchEntries(db, queryEmbedding, question, 15),
    searchEntities(db, queryEmbedding, question, 8),
  ]);

  return ai.consult(question, contextEntries, contextEntities);
}
