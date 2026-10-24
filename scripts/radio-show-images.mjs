#!/usr/bin/env node
/*
 * Radio : les onze visuels d'émissions gardés le 2026-10-23 (../live/docs/fonctionnalites/radio.md, « Les pochettes »).
 * Chacun est lu sur le site de la radio (le visuel de la page de l'émission), recadré en carré selon sa
 * règle, déposé dans organizers-images/radio-shows/ et posé dans radio_shows.image_url
 * (lib/radio/show-images.ts). Les autres émissions gardent la pochette que l'app dessine ; le back-office
 * (/admin/radio) en ajoute, en remplace ou en retire ensuite.
 *
 *   node --env-file=.env.local scripts/radio-show-images.mjs --out=<dossier>
 *       → simulation : télécharge et recadre chaque visuel dans <dossier>, à regarder ; rien en base
 *   node --env-file=.env.local scripts/radio-show-images.mjs --write --confirm=<ref du projet>
 *       → dépose les visuels et remplit image_url des émissions qui n'en ont pas encore
 *         (--replace : aussi celles qui en ont un)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const writeMode = args.includes("--write");
const replace = args.includes("--replace");
const outDir = option("out");

if (!outDir === !writeMode) {
  console.error("Indiquez --out=<dossier> (simulation) ou --write --confirm=<ref du projet>.");
  process.exit(1);
}
if (writeMode) {
  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Variables requises: NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (--env-file=.env.local).");
    process.exit(1);
  }
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  if (option("confirm") !== projectRef) {
    console.error(`Écriture refusée. Relancez avec --write --confirm=${projectRef} après la simulation.`);
    process.exit(1);
  }
}

const UPLOADS = "https://orleans.radiocampus.org/wp-content/uploads";

/**
 * Les visuels gardés, par slug d'émission (radio_shows.slug) : l'image de la page de l'émission sur le site
 * de la radio (og:image, lue le 2026-10-23) et la façon d'en faire un carré (lib/radio/show-images.ts).
 */
const KEPT = [
  // Le logo et son titre tiennent au centre du bandeau.
  { slug: "a-batons-rompus", url: `${UPLOADS}/2025/01/visu-2024.01.07-Erwann-visuel-A-batons-rompus-banniere.jpg`, fit: { kind: "cover" } },
  // Détourés : entiers, posés sur le noir des pochettes.
  { slug: "ecoute-ta-fac", url: `${UPLOADS}/2026/06/visu-2026.06.22-ETF-logo-simple-edited.png`, fit: { kind: "contain", padding: 0.08 } },
  { slug: "kawai-campus-club", url: `${UPLOADS}/2024/10/visu-2024.12.17-MarionErwann-KCC-logo-2.png`, fit: { kind: "cover" } },
  { slug: "entrez-cest-le-jazz", url: `${UPLOADS}/2026/09/Entrez-cest-du-jazz.jpg`, fit: { kind: "cover" } },
  { slug: "le-projet-seti", url: `${UPLOADS}/2022/05/240641683_104038408670071_939250330395175006_n.jpg`, fit: { kind: "cover" } },
  // La photo de Tesla, sans le titre écrit en haut à droite.
  { slug: "lemission-du-fictionnaire", url: `${UPLOADS}/2017/08/emission-du-fictionnaire.jpg`, fit: { kind: "crop", left: 0, top: 0.25, size: 0.75 } },
  // Son fond n'est pas tout à fait noir : posé sur le noir, il ferait des bandes ; le logo tient au centre.
  { slug: "nation-groove", url: `${UPLOADS}/2017/07/nation-groove.jpg`, fit: { kind: "cover" } },
  { slug: "pull-it-up", url: `${UPLOADS}/2026/07/PullItUp-768x768-1.jpg`, fit: { kind: "cover" } },
  { slug: "ride-on", url: `${UPLOADS}/2017/07/RideOn.jpg`, fit: { kind: "cover" } },
  { slug: "rien-ne-fera-venir-le-jour", url: `${UPLOADS}/2022/04/RNFVJinsta.png`, fit: { kind: "cover" } },
  { slug: "tentaculation", url: `${UPLOADS}/2017/07/Tentaculation-logo.001.jpeg`, fit: { kind: "cover" } },
];

const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const { downloadImage } = await jiti.import(path.join(root, "lib/image-cards/service.ts"));
const { setShowImage, squareShowImage } = await jiti.import(path.join(root, "lib/radio/show-images.ts"));

if (outDir) {
  mkdirSync(outDir, { recursive: true });
  for (const kept of KEPT) {
    try {
      const square = await squareShowImage(await downloadImage(kept.url), kept.fit);
      const file = path.join(outDir, `${kept.slug}.webp`);
      writeFileSync(file, square);
      console.log(`ok   ${kept.slug} (${kept.fit.kind}) → ${file}`);
    } catch (error) {
      console.error(`ÉCHEC ${kept.slug} : ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    }
  }
  process.exit();
}

const { createServiceClient } = await jiti.import(path.join(root, "lib/supabase/service.ts"));
const supabase = createServiceClient();
let posed = 0;
for (const kept of KEPT) {
  const { data: shows, error } = await supabase.from("radio_shows").select("id, slug, image_url").eq("slug", kept.slug);
  if (error) throw new Error(`Lecture de ${kept.slug} impossible (${error.message})`);
  if (!shows?.length) {
    console.warn(`absente  ${kept.slug} : pas d'émission de ce nom en base`);
    continue;
  }
  for (const show of shows) {
    if (show.image_url && !replace) {
      console.log(`gardé   ${kept.slug} : a déjà un visuel (${show.image_url})`);
      continue;
    }
    try {
      const square = await squareShowImage(await downloadImage(kept.url), kept.fit);
      const url = await setShowImage(supabase, show, square);
      posed += 1;
      console.log(`posé    ${kept.slug} → ${url}`);
    } catch (failure) {
      console.error(`ÉCHEC   ${kept.slug} : ${failure instanceof Error ? failure.message : failure}`);
      process.exitCode = 1;
    }
  }
}
console.log(`${posed} visuel(s) posé(s).`);
