#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { initDb } from "../db/init.js";
import { closeDb } from "../db/client.js";
import { logCommand } from "./commands/log.js";
import { askCommand } from "./commands/ask.js";
import { summaryCommand } from "./commands/summary.js";

const program = new Command();

program
  .name("pwork")
  .description("Personal Work OS — log your day, query your knowledge graph")
  .version("0.1.0");

program
  .command("log [text]")
  .description("Log a daily work entry")
  .action(async (text?: string) => {
    await initDb();
    await logCommand(text);
    await closeDb();
  });

program
  .command("ask [question]")
  .description("Ask your knowledge graph anything")
  .action(async (question?: string) => {
    await initDb();
    await askCommand(question);
    await closeDb();
  });

program
  .command("summary")
  .description("Browse your knowledge graph")
  .option("-p, --person <name>", "Show summary for a person")
  .option("--project <name>", "Show summary for a project")
  .option("-s, --situation", "List all active situations")
  .option("-w, --week", "Show this week's entries")
  .option("-e, --entity <name>", "Show any entity by name")
  .action(async (opts) => {
    await initDb();
    await summaryCommand(opts);
    await closeDb();
  });

program.parseAsync(process.argv).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
