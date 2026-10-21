#!/usr/bin/env node
/*
 * Photos libres des artistes (docs/ARTIST_PHOTOS.md) : cherche sur Wikimedia Commons une photo sous licence
 * libre (CC BY, CC BY-SA, CC0, domaine public) pour chaque artiste sans photo, écrit la liste à relire,
 * puis pose les photos gardées avec leur crédit.
 *
 *   node --env-file=.env.local scripts/artist-photos.mjs --out=photos.json
 *       → recherche : lit les artistes sans photo et écrit les photos trouvées dans photos.json ;
 *         rien n'est écrit en base
 *   node --env-file=.env.local scripts/artist-photos.mjs --plan=photos.json
 *       → simulation de l'écriture : ce qui serait posé, artiste par artiste
 *   node --env-file=.env.local scripts/artist-photos.mjs --plan=photos.json --write --confirm=<ref du projet>
 *       → copie chaque photo de la liste (relue, lignes retirées au besoin) dans organizers-images/artists/
 *         et remplit image_url, image_credit, image_license et image_source_url, seulement si l'artiste
 *         n'a toujours pas de photo
 *
 * Option de la recherche : --limit=N.
 */
import { readFileSync, writeFileSync } from "node:fs";
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
const planPath = option("plan");
const outPath = option("out");
const limit = Number(option("limit") ?? Number.POSITIVE_INFINITY);

if (!planPath === !outPath) {
  console.error("Indiquez --out=<fichier> (recherche) ou --plan=<fichier> (écriture).");
  process.exit(1);
}
if (!(limit > 0)) {
  console.error("--limit doit être un nombre positif.");
  process.exit(1);
}
if (writeMode && (!planPath || option("confirm") !== projectRef)) {
  console.error(`Écriture refusée. Relancez avec --plan=<fichier> --write --confirm=${projectRef} après la simulation.`);
  process.exit(1);
}

const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const { downloadCommonsPhoto, findArtistPhoto } = await jiti.import(path.join(root, "lib/artists/commons-photos.ts"));
const { storeImage } = await jiti.import(path.join(root, "lib/agent/images.ts"));
const { createServiceClient } = await jiti.import(path.join(root, "lib/supabase/service.ts"));

const supabase = createServiceClient();

if (outPath) {
  const { data, error } = await supabase.from("artists").select("id, name").is("image_url", null).order("name");
  if (error) throw new Error(`Lecture des artistes impossible (${error.message})`);
  const artists = (data ?? []).slice(0, limit);
  console.log(`${projectRef} : ${artists.length} artistes sans photo.`);

  const found = [];
  const others = {};
  for (const [index, artist] of artists.entries()) {
    const result = await findArtistPhoto(artist.name);
    if (result.status === "found") {
      const { photo } = result;
      found.push({
        artist_id: artist.id,
        name: artist.name,
        description: photo.description,
        wikidata: `https://www.wikidata.org/wiki/${photo.wikidataId}`,
        image_url: photo.imageUrl,
        size: `${photo.width}x${photo.height}`,
        credit: photo.credit,
        license: photo.license,
        source_url: photo.sourceUrl,
      });
      console.log(`  ✓ ${artist.name} : ${photo.description ?? "sans description"} — ${photo.license}, ${photo.credit}`);
    } else {
      (others[result.status] ??= []).push(`${artist.name} (${result.detail})`);
    }
    if ((index + 1) % 20 === 0) console.log(`${index + 1}/${artists.length}`);
  }
  // Les événements de l'artiste chez nous, pour juger si la fiche Wikidata est la bonne (homonymes).
  const { data: links, error: linksError } = await supabase
    .from("event_artists")
    .select("artist_id, event:events(title, date)")
    .in("artist_id", found.map((entry) => entry.artist_id));
  if (linksError) throw new Error(`Lecture des événements impossible (${linksError.message})`);
  for (const entry of found) {
    entry.events = (links ?? [])
      .filter((link) => link.artist_id === entry.artist_id && link.event)
      .map((link) => `${link.event.date.slice(0, 10)} ${link.event.title}`)
      .sort()
      .reverse()
      .slice(0, 3);
  }
  writeFileSync(outPath, `${JSON.stringify(found, null, 2)}\n`);
  console.log(`\n${found.length} photos trouvées, à relire dans ${outPath} (retirez les lignes à ne pas poser).`);
  for (const [status, names] of Object.entries(others)) {
    console.log(`${status} : ${names.length}`);
    if (status !== "not_found") for (const name of names) console.log(`  ${name}`);
  }
  process.exit(0);
}

const plan = JSON.parse(readFileSync(planPath, "utf8"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;
for (const entry of plan) {
  const { data: artist, error } = await supabase
    .from("artists")
    .select("id, name, image_url")
    .eq("id", entry.artist_id)
    .maybeSingle();
  if (error) throw new Error(`Lecture de l'artiste ${entry.artist_id} impossible (${error.message})`);
  if (!artist) {
    console.log(`  ! ${entry.name} : artiste introuvable`);
    continue;
  }
  if (artist.image_url) {
    console.log(`  ! ${artist.name} : a déjà une photo, laissée`);
    continue;
  }
  console.log(`  ${artist.name} : ∅ → ${entry.source_url} (${entry.license}, ${entry.credit})`);
  if (!writeMode) continue;
  try {
    // Une photo par seconde : Commons limite les téléchargements en rafale.
    await sleep(1000);
    const { url } = await storeImage(supabase, await downloadCommonsPhoto(entry.image_url), {
      bucket: "organizers-images",
      folder: "artists",
    });
    const { data: written, error: writeError } = await supabase
      .from("artists")
      .update({ image_url: url, image_credit: entry.credit, image_license: entry.license, image_source_url: entry.source_url })
      .eq("id", artist.id)
      .is("image_url", null)
      .select("id");
    if (writeError) throw writeError;
    console.log(written?.length ? `  ✓ ${url}` : "  ! photo posée entre-temps, copie non utilisée");
  } catch (copyError) {
    failures += 1;
    console.log(`  ✗ ${copyError instanceof Error ? copyError.message : copyError}`);
  }
}
if (!writeMode) console.log(`\nSimulation : rien n'est écrit. Pour écrire : --plan=${planPath} --write --confirm=${projectRef}`);
else if (failures) console.log(`\n${failures} photo${failures > 1 ? "s" : ""} non posée${failures > 1 ? "s" : ""}.`);
