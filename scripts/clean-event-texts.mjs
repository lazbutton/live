#!/usr/bin/env node
/*
 * Titres et descriptions des événements déjà en base, repassés par les règles de la collecte
 * (lib/collecte/event-text.ts, U31 et U32) : date et lieu répétés, capitales, guillemets ; blocs
 * collés séparés, lignes recollées, hashtags et renvois de billetterie retirés.
 * Événements non archivés, publiés ou en attente.
 *
 *   node --env-file=.env.local scripts/clean-event-texts.mjs [--out=rapport.md]
 *       → simulation : liste avant → après (et rapport complet dans --out), rien n'est écrit
 *   node --env-file=.env.local scripts/clean-event-texts.mjs --write --confirm=<ref du projet>
 *       → écrit les titres et descriptions qui changent (journal d'audit : event.text_cleanup)
 *
 * Options : --only=title ou --only=description.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Variables requises: NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (--env-file=.env.local).");
  process.exit(1);
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const writeMode = args.includes("--write");
const only = option("only");
const out = option("out");

if (only && !["title", "description"].includes(only)) {
  console.error("--only vaut title ou description.");
  process.exit(1);
}
if (writeMode && option("confirm") !== projectRef) {
  console.error(`Écriture refusée. Relancez avec --write --confirm=${projectRef} après la simulation.`);
  process.exit(1);
}

const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const { applyEventTextChanges, formatCleanupReport, loadEventTextRows, planEventTextCleanup } = await jiti.import(
  path.join(root, "lib/collecte/clean-existing-events.ts"),
);
const { createServiceClient } = await jiti.import(path.join(root, "lib/supabase/service.ts"));

const supabase = createServiceClient();
const { rows, knownNames } = await loadEventTextRows(supabase);
const changes = planEventTextCleanup(rows, { knownNames, fields: only ? [only] : undefined });
const titleCount = changes.filter((change) => change.title).length;
const descriptionCount = changes.filter((change) => change.description).length;

console.log(
  `${projectRef} : ${rows.length} événements lus, ${changes.length} à corriger ` +
    `(${titleCount} titres, ${descriptionCount} descriptions).`,
);
for (const change of changes) {
  if (change.title) console.log(`  ${change.title.before}  →  ${change.title.after}`);
}
if (out) {
  fs.writeFileSync(out, formatCleanupReport(changes));
  console.log(`Rapport complet (descriptions comprises) : ${out}`);
}
if (!writeMode) {
  console.log(`Simulation : rien n'est écrit. Pour écrire : --write --confirm=${projectRef}`);
  process.exit(0);
}

const { updated, errors } = await applyEventTextChanges(supabase, changes, "script:clean-event-texts");
for (const { id, error } of errors) console.log(`  ✗ ${id} : ${error}`);
console.log(`Terminé : ${updated} événements mis à jour, ${errors.length} échecs.`);
