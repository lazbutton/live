#!/usr/bin/env node
/*
 * La reprise des fiches à venir (étape 3 de « Pour toi », ../live/docs/chantiers/pour-toi.md) : genre, pour qui, âge
 * et réservation, lus par la même lecture que la collecte (lib/collecte/fill-existing-details.ts), seulement là où la
 * fiche est vide. Événements à venir, publiés ou en attente, non archivés.
 *
 *   node --env-file=.env.local scripts/fill-event-details.mjs [--out=<dossier>] [--limit=40] [--only=<id,…>]
 *       → simulation : lit les sources (IA comprise), écrit <dossier>/plan.json et <dossier>/relecture.html ;
 *         rien n'est écrit en base
 *   node --env-file=.env.local scripts/fill-event-details.mjs --write --plan=<dossier>/plan.json --confirm=<ref>
 *       [--skip=<id,…>] [--keep-tags | --keep-tags-of=<id,…>]
 *       → écrit le plan relu, tel quel (journal d'audit : event.details_fill) ; saute un événement modifié depuis
 *   node --env-file=.env.local scripts/fill-event-details.mjs --rollback --plan=<dossier>/plan.json --confirm=<ref>
 *       → remet l'état d'avant là où la reprise a écrit (journal d'audit : event.details_fill_undo)
 *   node scripts/fill-event-details.mjs --review --plan=<dossier>/plan.json
 *       → refait relecture.html à partir du plan, sans rien relire
 *
 * Prérequis : la migration 20261024170000_event_genres_audience_booking (event_genres et les colonnes).
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const reviewOnly = process.argv.includes("--review");
if (!reviewOnly && (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  console.error("Variables requises: NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (--env-file=.env.local).");
  process.exit(1);
}

const projectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split(".")[0] : "";
const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const list = (name) => new Set((option(name) || "").split(",").map((value) => value.trim()).filter(Boolean));
const writeMode = args.includes("--write");
const rollbackMode = args.includes("--rollback");

const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const reprise = await jiti.import(path.join(root, "lib/collecte/fill-existing-details.ts"));
const { formatDetailsReview } = await jiti.import(path.join(root, "lib/collecte/fill-details-review.ts"));
const { parisToday } = await jiti.import(path.join(root, "lib/scraping/dates.ts"));
const { createServiceClient } = await jiti.import(path.join(root, "lib/supabase/service.ts"));

const actor = "script:fill-event-details";
const readOnLabel = (iso) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(
    new Date(iso),
  );

if (reviewOnly) {
  const planPath = option("plan");
  if (!planPath || !fs.existsSync(planPath)) {
    console.error("--plan=<dossier>/plan.json : le plan de la simulation.");
    process.exit(1);
  }
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const target = path.join(path.dirname(planPath), "relecture.html");
  fs.writeFileSync(
    target,
    formatDetailsReview(plan.proposals, {
      readOn: readOnLabel(plan.readOn),
      eventsRead: plan.eventsRead,
      eventsToFill: plan.eventsToFill ?? plan.proposals.length,
      sourcesRead: plan.sourcesRead ?? 0,
    }),
  );
  console.log(`Relecture refaite : ${target}`);
  process.exit(0);
}

const supabase = createServiceClient();

if (writeMode || rollbackMode) {
  if (option("confirm") !== projectRef) {
    console.error(`Écriture refusée. Relancez avec --confirm=${projectRef} après la relecture du plan.`);
    process.exit(1);
  }
  const planPath = option("plan");
  if (!planPath || !fs.existsSync(planPath)) {
    console.error("--plan=<dossier>/plan.json : le plan relu de la simulation.");
    process.exit(1);
  }
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  if (plan.projectRef !== projectRef) {
    console.error(`Ce plan a été lu sur ${plan.projectRef}, pas sur ${projectRef}.`);
    process.exit(1);
  }
  const skip = list("skip");
  const keepTagsOf = list("keep-tags-of");
  const proposals = plan.proposals
    .filter((proposal) => !skip.has(proposal.id))
    .map((proposal) =>
      args.includes("--keep-tags") || keepTagsOf.has(proposal.id) ? { ...proposal, tagsToRemove: [] } : proposal,
    );

  if (rollbackMode) {
    const { restored, skipped } = await reprise.rollbackDetailsPlan(supabase, proposals, actor);
    for (const entry of skipped) console.log(`  · ${entry.title} : ${entry.reason}`);
    console.log(`Retour arrière : ${restored} événements remis comme avant, ${skipped.length} laissés.`);
    process.exit(0);
  }

  const { updated, skipped, errors } = await reprise.applyDetailsPlan(supabase, proposals, actor);
  for (const entry of skipped) console.log(`  · ${entry.title} : ${entry.reason}`);
  for (const entry of errors) console.log(`  ✗ ${entry.id} : ${entry.error}`);
  console.log(`Terminé : ${updated} événements écrits, ${skipped.length} sautés, ${errors.length} échecs.`);
  process.exit(errors.length ? 1 : 0);
}

// Simulation -------------------------------------------------------------------------------------------------------

const today = parisToday();
const out = path.resolve(option("out") || `reprise-fiches-${today}`);
const only = list("only");
const limit = Number(option("limit")) || Infinity;

const { rows, tags, genres } = await reprise.loadDetailsRows(supabase, today);
if (genres.length === 0) {
  console.error("Aucun genre (event_genres) : appliquez d'abord la migration 20261024170000.");
  process.exit(1);
}
const toFill = rows.filter((row) => (only.size === 0 || only.has(row.id)) && reprise.needsDetails(row, genres));
const groups = reprise.readingGroups(toFill).slice(0, limit);
console.log(`${projectRef} : ${rows.length} événements à venir, ${toFill.length} à compléter, ${groups.length} sources à lire.`);

const readings = new Map();
let done = 0;
let cursor = 0;
await Promise.all(
  Array.from({ length: Math.min(4, groups.length) }, async () => {
    while (cursor < groups.length) {
      const group = groups[cursor];
      cursor += 1;
      try {
        const reading = await reprise.readDetails(supabase, group.rows[0]);
        for (const row of group.rows) readings.set(row.id, reading);
      } catch (error) {
        console.log(`  ✗ ${group.rows[0].title} : ${error instanceof Error ? error.message : error}`);
      }
      done += 1;
      if (done % 10 === 0 || done === groups.length) console.log(`  ${done}/${groups.length} sources lues`);
    }
  }),
);

const read = toFill.filter((row) => readings.has(row.id));
const proposals = reprise.planDetails(read, readings, { genres, tags });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, "plan.json"),
  JSON.stringify(
    {
      projectRef,
      readOn: new Date().toISOString(),
      today,
      eventsRead: rows.length,
      eventsToFill: toFill.length,
      sourcesRead: groups.length,
      proposals,
    },
    null,
    2,
  ),
);
fs.writeFileSync(
  path.join(out, "relecture.html"),
  formatDetailsReview(proposals, {
    readOn: readOnLabel(new Date().toISOString()),
    eventsRead: rows.length,
    eventsToFill: toFill.length,
    sourcesRead: groups.length,
  }),
);

const filled = proposals.filter((proposal) => Object.keys(proposal.fill).length > 0);
const count = (key) => proposals.filter((proposal) => proposal.fill[key] !== undefined).length;
console.log(
  `Plan : ${filled.length} événements remplis (genre ${count("genres")}, pour qui ${count("audience")}, âge ` +
    `${count("min_age")}, réservation ${count("booking")}) ; « En famille » change pour ` +
    `${proposals.filter((proposal) => proposal.youngAudience).length} ; tags à retirer sur ` +
    `${proposals.filter((proposal) => proposal.tagsToRemove.length).length}.`,
);
console.log(`Relecture : ${path.join(out, "relecture.html")}`);
console.log(`Simulation : rien n'est écrit. Pour écrire : --write --plan=${path.join(out, "plan.json")} --confirm=${projectRef}`);
