#!/usr/bin/env node
/*
 * Accès, photos, adresses et descriptions des lieux, d'après une liste relue (docs/LIEUX_ACCES.md) :
 * `locations.directions`, `image_url`, `address` (avec `latitude` et `longitude`) et `short_description`.
 * Une valeur ne s'écrit que si elle est encore celle relevée dans la liste.
 *
 *   node --env-file=.env.local scripts/location-details.mjs lieux.json
 *       → simulation : relit chaque lieu, affiche avant → après, rien n'est écrit
 *   node --env-file=.env.local scripts/location-details.mjs lieux.json --write --confirm=<ref du projet>
 *       → écrit ; relancer ne refait rien
 *
 * Liste (JSON), un objet par lieu :
 *   { "id": "<uuid>", "name": "<pour les messages>",
 *     "directions": { "before": <texte ou null>, "after": "<texte>" },
 *     "image": { "before": <url ou null>, "source": <url à copier, ou null pour retirer la photo> },
 *     "address": { "before": "<texte>", "after": "<texte>", "latitude": <nombre>, "longitude": <nombre> },
 *     "shortDescription": { "before": <texte ou null>, "after": "<texte>" } }
 * Tout est facultatif sauf `id`, `latitude` et `longitude` compris : sans elles, la nouvelle adresse garde les
 * coordonnées du lieu.
 * Une photo copiée va dans locations-images/locations/, comme les envois de l'admin. Une adresse passe, comme
 * dans l'admin, par les déclencheurs qui en tirent la ville (`sync_location_city`).
 */
import { readFileSync } from "node:fs";
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
const [planPath, ...args] = process.argv.slice(2);
const writeMode = args.includes("--write");
const confirm = args.find((arg) => arg.startsWith("--confirm="))?.slice("--confirm=".length);
if (!planPath || planPath.startsWith("--")) {
  console.error("Usage : scripts/location-details.mjs <liste.json> [--write --confirm=<ref du projet>]");
  process.exit(1);
}
if (writeMode && confirm !== projectRef) {
  console.error(`Écriture refusée. Relancez avec --write --confirm=${projectRef} après la simulation.`);
  process.exit(1);
}

const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const { copyRemoteImage } = await jiti.import(path.join(root, "lib/agent/images.ts"));
const { createServiceClient } = await jiti.import(path.join(root, "lib/supabase/service.ts"));

const supabase = createServiceClient();
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const show = (value) => (value == null ? "∅" : JSON.stringify(value));
const totals = { written: 0, upToDate: 0, changed: 0, failed: 0 };
/** Champs texte de la liste : clé dans la liste, colonne, nom dans les messages. */
const TEXT_FIELDS = [
  ["directions", "directions", "accès"],
  ["address", "address", "adresse"],
  ["shortDescription", "short_description", "description"],
];
const GUARDED = ["directions", "image_url", "address", "latitude", "longitude", "short_description"];

for (const entry of plan) {
  const { data: current, error } = await supabase
    .from("locations")
    .select(`id, name, ${GUARDED.join(", ")}`)
    .eq("id", entry.id)
    .maybeSingle();
  if (error) throw new Error(`Lecture du lieu ${entry.id} impossible (${error.message})`);
  if (!current) {
    console.log(`\n${entry.name ?? entry.id} : lieu introuvable`);
    totals.changed += 1;
    continue;
  }
  console.log(`\n${current.name} (${current.id})`);
  const update = {};

  for (const [key, column, label] of TEXT_FIELDS) {
    if (!entry[key]) continue;
    const { before = null, after } = entry[key];
    if (current[column] === after) {
      console.log(`  ${label} déjà à jour`);
      totals.upToDate += 1;
    } else if (current[column] !== before) {
      console.log(`  ! ${label} changé depuis la liste : ${show(current[column])} — laissé`);
      totals.changed += 1;
    } else {
      update[column] = after;
      if (key === "address" && entry.address.latitude != null && entry.address.longitude != null) {
        update.latitude = entry.address.latitude;
        update.longitude = entry.address.longitude;
        console.log(
          `  ${label} : ${show(current.address)} (${current.latitude}, ${current.longitude})\n` +
            `      → ${show(after)} (${update.latitude}, ${update.longitude})`,
        );
      } else {
        console.log(`  ${label} : ${show(current[column])}\n      → ${show(after)}`);
      }
    }
  }

  if (entry.image) {
    const { before = null, source = null } = entry.image;
    if (!source && current.image_url == null) {
      console.log("  photo déjà retirée");
      totals.upToDate += 1;
    } else if (current.image_url !== before) {
      console.log(`  ! photo changée depuis la liste : ${show(current.image_url)} — laissée`);
      totals.changed += 1;
    } else if (!source) {
      console.log(`  photo : ${show(current.image_url)} → ∅`);
      update.image_url = null;
    } else {
      console.log(`  photo : ${show(current.image_url)} → copie de ${source}`);
      if (writeMode) {
        try {
          update.image_url = (await copyRemoteImage(supabase, source, { bucket: "locations-images", folder: "locations" })).url;
        } catch (copyError) {
          console.log(`  ✗ ${copyError instanceof Error ? copyError.message : copyError}`);
          totals.failed += 1;
        }
      }
    }
  }

  if (!writeMode || Object.keys(update).length === 0) continue;
  // Écrit seulement si rien n'a bougé depuis la lecture.
  let query = supabase.from("locations").update(update).eq("id", current.id);
  for (const column of GUARDED) {
    query = current[column] == null ? query.is(column, null) : query.eq(column, current[column]);
  }
  const { data: written, error: writeError } = await query.select("id");
  if (writeError) throw new Error(`Écriture du lieu ${current.id} impossible (${writeError.message})`);
  if (written?.length) {
    console.log("  ✓ écrit");
    totals.written += 1;
  } else {
    console.log("  ! modifié entre-temps, rien d'écrit");
    totals.changed += 1;
  }
}

console.log(
  `\n${writeMode ? `${totals.written} lieux écrits` : "Simulation : rien n'est écrit"}, ${totals.upToDate} déjà à jour, ` +
    `${totals.changed} laissés (changés depuis la liste), ${totals.failed} copies de photo en échec.`,
);
if (!writeMode) console.log(`Pour écrire : --write --confirm=${projectRef}`);
