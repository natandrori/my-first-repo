import { getDb } from "../../db/client.js";
import { findEntitiesByType, findAllEntities, entitiesCol } from "../../db/collections/entities.js";
import { getRecentEntries, getEntriesForEntity } from "../../db/collections/entries.js";
import { getActiveSituations } from "../../db/collections/situations.js";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function summaryCommand(options: {
  person?: string;
  project?: string;
  situation?: boolean;
  week?: boolean;
  entity?: string;
}): Promise<void> {
  const db = await getDb();

  if (options.situation) {
    const situations = await getActiveSituations(db);
    if (situations.length === 0) {
      console.log("No active situations.");
      return;
    }
    console.log("\n── Active situations ──────────────────────────────────");
    for (const s of situations) {
      console.log(`\n[${s.status.toUpperCase()}] ${s.name} (${s.category})`);
      console.log(`  Since: ${formatDate(s.startDate)}`);
      console.log(`  ${s.summary}`);
    }
    return;
  }

  if (options.week) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const entries = await getRecentEntries(db, 50);
    const weekEntries = entries.filter((e) => e.loggedAt >= since);

    if (weekEntries.length === 0) {
      console.log("No entries this week.");
      return;
    }

    console.log("\n── This week's entries ────────────────────────────────");
    for (const e of weekEntries) {
      console.log(`\n[${formatDate(e.loggedAt)}]`);
      console.log(e.rawText.slice(0, 300) + (e.rawText.length > 300 ? "…" : ""));
    }
    return;
  }

  const searchName = options.person ?? options.project ?? options.entity;
  if (searchName) {
    const allEntities = await findAllEntities(db);
    const matches = allEntities.filter((e) =>
      e.name.toLowerCase().includes(searchName.toLowerCase())
    );

    if (matches.length === 0) {
      console.log(`No entities found matching "${searchName}".`);
      return;
    }

    for (const entity of matches) {
      console.log(`\n── ${entity.typeId}: ${entity.name} ──────────────────────────`);
      console.log(`  Last mentioned: ${formatDate(entity.lastMentionedAt)}`);

      const fields = Object.entries(entity.fields).filter(([, v]) => v);
      if (fields.length > 0) {
        console.log("  Fields:");
        fields.forEach(([k, v]) => console.log(`    ${k}: ${v}`));
      }

      if (entity.relationships.length > 0) {
        console.log("  Relationships:");
        entity.relationships.forEach((r) =>
          console.log(`    → ${r.label} → ${r.targetName} (${r.targetTypeId})`)
        );
      }

      if (entity.insights?.summary) {
        console.log(`  AI summary: ${entity.insights.summary}`);
      }

      const entries = await getEntriesForEntity(db, entity.entityId);
      if (entries.length > 0) {
        console.log(`\n  Last ${Math.min(5, entries.length)} mentions:`);
        entries.slice(0, 5).forEach((e) => {
          console.log(`  [${formatDate(e.loggedAt)}] ${e.rawText.slice(0, 200)}…`);
        });
      }
    }
    return;
  }

  // Default: overview
  const [people, projects, allSituations, recentEntries] = await Promise.all([
    findEntitiesByType(db, "person"),
    findEntitiesByType(db, "project"),
    getActiveSituations(db),
    getRecentEntries(db, 5),
  ]);

  console.log("\n── Knowledge graph overview ───────────────────────────");
  console.log(`\nPeople: ${people.length}`);
  people.slice(0, 5).forEach((p) => console.log(`  • ${p.name}${p.fields.role ? ` (${p.fields.role})` : ""}`));
  if (people.length > 5) console.log(`  … and ${people.length - 5} more`);

  console.log(`\nProjects: ${projects.length}`);
  projects.slice(0, 5).forEach((p) =>
    console.log(`  • ${p.name} [${p.fields.status ?? "unknown"}]`)
  );
  if (projects.length > 5) console.log(`  … and ${projects.length - 5} more`);

  console.log(`\nActive situations: ${allSituations.length}`);
  allSituations.slice(0, 3).forEach((s) => console.log(`  • ${s.name} (${s.category})`));

  console.log(`\nRecent entries:`);
  recentEntries.forEach((e) =>
    console.log(`  [${formatDate(e.loggedAt)}] ${e.rawText.slice(0, 100)}…`)
  );
}
