import * as readline from "readline";
import { getDb } from "../../db/client.js";
import { consult } from "../../core/consult.js";

async function readQuestion(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function askCommand(questionArg?: string): Promise<void> {
  const db = await getDb();

  let question: string;
  if (questionArg) {
    question = questionArg.trim();
  } else {
    console.log("What would you like to know? (Press Enter to submit)\n");
    question = await readQuestion();
  }

  if (!question) {
    console.log("No question provided.");
    return;
  }

  console.log("\n⏳ Searching your knowledge graph…\n");

  try {
    await consult(db, question);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ANTHROPIC_API_KEY")) {
      console.error("Error: ANTHROPIC_API_KEY is not set. Add it to your .env file.");
    } else {
      console.error("Consultation failed:", err);
    }
  }
}
