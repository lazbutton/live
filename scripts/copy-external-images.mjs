#!/usr/bin/env node
/*
 * Images hébergées hors de Storage, recopiées dans leur bucket : affiches des événements (comme le
 * cron /api/cron/image-cards, qui refait ensuite leur vignette), photos des lieux, logos des
 * organisateurs, photos des artistes. Le lien est remplacé seulement s'il n'a pas changé entre-temps.
 * Voir docs/EVENT_IMAGE_CARDS.md.
 *
 *   node --env-file=.env.local scripts/copy-external-images.mjs
 *       → simulation : liste les images hors de Storage, rien n'est écrit
 *   node --env-file=.env.local scripts/copy-external-images.mjs --write --confirm=<ref du projet>
 *       → copie chaque image dans Storage et remplace le lien
 *
 * Option : --only=events,locations,organizers,artists (toutes par défaut).
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

/** Images des autres tables : même bucket et même dossier que les envois de l'admin. */
const OTHER_IMAGES = {
  locations: { column: "image_url", label: "name", bucket: "locations-images", folder: "locations" },
  organizers: { column: "logo_url", label: "name", bucket: "organizers-images", folder: "organizers" },
  artists: { column: "image_url", label: "name", bucket: "organizers-images", folder: "artists" },
};
const only = new Set((option("only") ?? ["events", ...Object.keys(OTHER_IMAGES)].join(",")).split(","));
const unknown = [...only].filter((name) => name !== "events" && !OTHER_IMAGES[name]);
if (unknown.length) {
  console.error(`--only : ${unknown.join(", ")} inconnu (events, ${Object.keys(OTHER_IMAGES).join(", ")}).`);
  process.exit(1);
}
if (writeMode && option("confirm") !== projectRef) {
  console.error(`Écriture refusée. Relancez avec --write --confirm=${projectRef} après la simulation.`);
  process.exit(1);
}

const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const { copyExternalPosters, listExternalPosters } = await jiti.import(
  path.join(root, "lib/image-cards/external-posters.ts"),
);
const { copyRemoteImage, isStorageUrl } = await jiti.import(path.join(root, "lib/agent/images.ts"));
const { createServiceClient } = await jiti.import(path.join(root, "lib/supabase/service.ts"));

const supabase = createServiceClient();
const plural = (count, word) => `${count} ${word}${count > 1 ? "s" : ""}`;
let failures = 0;

if (only.has("events")) {
  const pending = await listExternalPosters(supabase);
  const events = pending.reduce((sum, poster) => sum + poster.eventIds.length, 0);
  console.log(`events : ${plural(pending.length, "affiche")} hors de Storage (${plural(events, "événement")})`);
  for (const { imageUrl, eventIds } of pending) console.log(`  ${imageUrl} (${eventIds.join(", ")})`);
  if (writeMode && pending.length) {
    const report = await copyExternalPosters(supabase);
    for (const result of report.results) {
      console.log(
        result.status === "copied"
          ? `  ✓ ${result.imageUrl} → ${result.url} (${plural(result.updated, "événement")})`
          : `  ✗ ${result.imageUrl} : ${result.error}`,
      );
    }
    failures += report.failed;
  }
}

for (const [table, { column, label, bucket, folder }] of Object.entries(OTHER_IMAGES)) {
  if (!only.has(table)) continue;
  const { data, error } = await supabase
    .from(table)
    .select(`id, ${label}, ${column}`)
    .not(column, "is", null)
    .neq(column, "")
    .order(label);
  if (error) throw new Error(`Lecture de ${table} impossible (${error.message})`);
  const pending = (data ?? []).filter((row) => !isStorageUrl(row[column]));
  console.log(`${table} : ${plural(pending.length, "image")} hors de Storage`);
  for (const row of pending) {
    console.log(`  ${row[label]} (${row.id}) : ${row[column]}`);
    if (!writeMode) continue;
    try {
      const { url } = await copyRemoteImage(supabase, row[column], { bucket, folder });
      const { data: updated, error: updateError } = await supabase
        .from(table)
        .update({ [column]: url })
        .eq("id", row.id)
        .eq(column, row[column])
        .select("id");
      if (updateError) throw updateError;
      console.log(updated?.length ? `  ✓ → ${url}` : "  ! lien changé entre-temps, copie non posée");
    } catch (copyError) {
      failures += 1;
      console.log(`  ✗ ${copyError instanceof Error ? copyError.message : copyError}`);
    }
  }
}

if (!writeMode) console.log(`Simulation : rien n'est écrit. Pour copier : --write --confirm=${projectRef}`);
else if (failures) console.log(`${plural(failures, "image")} non copiée${failures > 1 ? "s" : ""} (liens gardés).`);
