#!/usr/bin/env node
/*
 * Vignettes des affiches : rattrapage des événements qui n'en ont pas (docs/EVENT_IMAGE_CARDS.md).
 * Même traitement que le webhook de la base et que le cron quotidien /api/cron/image-cards.
 *
 *   node --env-file=.env.local scripts/backfill-image-cards.mjs
 *       → simulation : compte les affiches sans vignette, rien n'est écrit
 *   node --env-file=.env.local scripts/backfill-image-cards.mjs --write --confirm=<ref du projet>
 *       → fabrique les vignettes (Storage event-images/cards/) et remplit les colonnes de events
 *
 * Options : --retry-errors (reprend aussi les échecs notés dans image_card_error), --limit=N.
 */
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
const retryErrors = args.includes("--retry-errors");
const limit = Number(option("limit") ?? Number.POSITIVE_INFINITY);

if (!(limit > 0)) {
  console.error("--limit doit être un nombre positif.");
  process.exit(1);
}
if (writeMode && option("confirm") !== projectRef) {
  console.error(`Écriture refusée. Relancez avec --write --confirm=${projectRef} après la simulation.`);
  process.exit(1);
}

const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const { applyImageCards, listMissingImageCards } = await jiti.import(path.join(root, "lib/image-cards/service.ts"));
const { createServiceClient } = await jiti.import(path.join(root, "lib/supabase/service.ts"));

const supabase = createServiceClient();
const pending = await listMissingImageCards(supabase, { limit, retryErrors });
const images = [...new Set(pending.map((row) => row.image_url))];
const inStorage = images.filter((url) => url.includes("/storage/v1/object/public/")).length;

console.log(
  `${projectRef} : ${pending.length} événements sans vignette${retryErrors ? " (échecs notés compris)" : ""}, ` +
    `${images.length} affiches distinctes (${inStorage} dans Storage, ${images.length - inStorage} ailleurs).`,
);
if (!writeMode) {
  console.log(`Simulation : rien n'est écrit. Pour fabriquer les vignettes : --write --confirm=${projectRef}`);
  process.exit(0);
}

// Par lots : l'avancement s'affiche et un arrêt en cours de route garde ce qui est fait.
const totals = { created: 0, reused: 0, failed: 0, retryLater: 0, stale: 0, cards: 0 };
let totalBytes = 0;
let maxBytes = 0;
const BATCH = 30;
for (let index = 0; index < pending.length; index += BATCH) {
  const { report } = await applyImageCards(supabase, pending.slice(index, index + BATCH));
  for (const key of Object.keys(totals)) totals[key] += report[key];
  totalBytes += (report.averageBytes ?? 0) * report.cards;
  maxBytes = Math.max(maxBytes, report.maxBytes ?? 0);
  for (const { eventId, imageUrl, error } of report.errors) console.log(`  ✗ ${eventId} ${imageUrl} : ${error}`);
  console.log(`${Math.min(index + BATCH, pending.length)}/${pending.length} événements traités`);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} Ko`;
console.log(
  `Terminé : ${totals.cards} vignettes fabriquées (${totals.created} événements), ${totals.reused} événements ` +
    `servis par une vignette existante, ${totals.failed} échecs notés, ${totals.retryLater} échecs passagers ` +
    `(repris par le cron), ${totals.stale} affiches changées entre-temps.`,
);
if (totals.cards) {
  console.log(`Poids des vignettes : ${kb(totalBytes / totals.cards)} en moyenne, ${kb(maxBytes)} au plus.`);
}
