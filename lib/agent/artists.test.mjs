/*
 * Garde-fous des fiches artistes créées par l'agent, d'après la collecte du 2026-10-17 :
 * artistes musicaux seulement (concerts et DJ sets), plateaux « A + B », mentions « 1ère partie »,
 * titre de l'événement, prénoms seuls, ateliers, compagnies.
 *   node --test lib/agent/artists.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });

const { artistRefusal, isFirstNameOnly, isMusicCategory, splitArtistNames } = await jiti.import(
  path.join(root, "lib/events/artist-names.ts"),
);
const { findOrCreateArtist } = await jiti.import(path.join(root, "lib/agent/artists.ts"));
const { createAgentEvent } = await jiti.import(path.join(root, "lib/agent/events.ts"));
const { scrapeEventPage } = await jiti.import(path.join(root, "lib/scraping/scrape-event-page.ts"));

/** Toujours dans le futur, pour que les événements de test ne soient jamais « déjà passés ». */
const YEAR = new Date().getFullYear() + 1;

/** Catégories actives de l'admin (2026-10-17). */
const CATEGORIES = ["Atelier", "Cinéma", "Concert", "Danse", "DJ Set", "Expo", "Festival", "Rencontre", "Spectacle"].map(
  (name) => ({ id: `category-${name.toLowerCase().replace(/\s+/g, "-")}`, name }),
);

const concert = (title) => ({ title, category: "Concert" });

/**
 * Page de la billetterie de L'Astrolabe (extrait du balisage d'origine) : le JSON-LD recopie le
 * titre de l'événement dans `performer`.
 */
function astrolabePage({ id, title }) {
  const url = `https://billetterie.lastrolabe.org/agenda/${id}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Event",
      name: title,
      url: `${url}?session=${id.split("-")[0]}`,
      startDate: `${YEAR}-11-19T20:00`,
      endDate: `${YEAR}-11-19T23:00`,
      eventStatus: "https://schema.org/EventScheduled",
      location: {
        "@type": "Place",
        name: "L'Astrolabe",
        address: { "@type": "PostalAddress", streetAddress: "1 rue Alexandre Avisse", addressLocality: "ORLEANS", postalCode: "45000" },
      },
      image: ["https://billetterie.lastrolabe.org/sites/billetterie.lastrolabe.org/files/styles/large/public/multiseances/affiche.png"],
      description: "ROCK - POP",
      offers: [{ url, priceCurrency: "EUR", availability: "https://schema.org/InStock", name: "Prévente", price: 25 }],
      performer: { "@type": "PerformingGroup", name: title },
      organizer: { "@type": "Organization", name: "L’Antirouille – L’Astrolabe", url: "https://billetterie.lastrolabe.org" },
    },
  ];
  const html = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta property="og:title" content="${title} | 19 Novembre ${YEAR}, L'Astrolabe"/>
    <meta property="og:site_name" content="L'Astrolabe"/>
    <meta property="og:description" content="ROCK - POP"/>
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  </head>
  <body><h1>${title}</h1></body>
</html>`;
  return { url, html };
}

/** Client Supabase factice pour la lecture d'une page : aucune configuration, n'écrit rien. */
function emptySupabase() {
  return {
    from() {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
      };
      return query;
    },
  };
}

/** Lecture de la page sans IA, puis la catégorie que l'IA donne en production (« Concert »). */
async function scrapeAstrolabe(page, { category = "Concert" } = {}) {
  const { url, html } = astrolabePage(page);
  const result = await scrapeEventPage({ url, supabase: emptySupabase(), prefetched: { html, finalUrl: url }, disableAI: true });
  assert.equal(result.ok, true);
  return { url, data: result.data, imported: { ...result.data, category } };
}

/** Contexte d'agent en simulation : référentiels donnés, base vide, toute écriture est notée. */
function fakeAgentContext({ artists = [] } = {}) {
  const writes = [];
  const from = (table) => {
    const query = new Proxy(
      {},
      {
        get(_target, method) {
          if (method === "then") return (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject);
          if (typeof method !== "string") return undefined;
          if (["insert", "update", "upsert", "delete"].includes(method)) {
            return (...args) => {
              writes.push({ table, method, args });
              return query;
            };
          }
          return () => query;
        },
      },
    );
    return query;
  };
  const ctx = {
    dryRun: true,
    supabase: { from },
    references: Promise.resolve({ locations: [], organizers: [], artists, tags: [], categories: CATEGORIES }),
  };
  return { ctx, writes };
}

async function importInDryRun(data, { artists = [], sourceUrl = null } = {}) {
  const { ctx, writes } = fakeAgentContext({ artists });
  const result = await createAgentEvent(ctx, { data, sourceUrl, source: null, createMissingArtists: true });
  assert.deepEqual(writes, [], "la simulation n'écrit rien");
  return result;
}

const reasons = (result) => Object.fromEntries((result.artists_skipped || []).map((entry) => [entry.name, entry.reason]));

/* ------------------------------------------------------------------ */
/* Découpage des noms (extraction)                                     */
/* ------------------------------------------------------------------ */

test("« A + B » donne deux artistes, « 1ère partie » disparaît", () => {
  assert.deepEqual(splitArtistNames(["RAZORLIGHT + 1ÈRE PARTIE"]), ["RAZORLIGHT"]);
  assert.deepEqual(splitArtistNames(["ASSASSIN + TRIPTIK"]), ["ASSASSIN", "TRIPTIK"]);
  assert.deepEqual(splitArtistNames(["FOLIE'S + 1ERE PARTIE", "Syd Matters + 1re partie"]), ["FOLIE'S", "Syd Matters"]);
  assert.deepEqual(splitArtistNames(["LA JUNGLE + SODOM & SAGESSE"]), ["LA JUNGLE", "SODOM & SAGESSE"]);
  assert.deepEqual(splitArtistNames(["Kloahk + Supershotgun + Midnight Street of Rage"]), ["Kloahk", "Supershotgun", "Midnight Street of Rage"]);
});

test("la première partie annoncée par son nom est gardée", () => {
  assert.deepEqual(splitArtistNames(["Youn Sun Nah + 1ère partie Nit And Dogs"]), ["Youn Sun Nah", "Nit And Dogs"]);
  assert.deepEqual(splitArtistNames(["Razorlight (1ère partie : The Hara)"]), ["Razorlight", "The Hara"]);
  assert.deepEqual(splitArtistNames(["Alcest + première partie : Grey Aura"]), ["Alcest", "Grey Aura"]);
});

test("mentions seules, doublons et valeurs vides sont retirés", () => {
  assert.deepEqual(splitArtistNames(["1ère partie", "Special guests", "  ", 42, null]), []);
  assert.deepEqual(splitArtistNames(["Assassin", "ASSASSIN + Triptik"]), ["Assassin", "Triptik"]);
  assert.deepEqual(splitArtistNames(undefined), []);
  // Sans espace autour du « + », le nom reste entier.
  assert.deepEqual(splitArtistNames(["C+C Music Factory"]), ["C+C Music Factory"]);
});

test("le découpage est stable (un nom déjà découpé ne change plus)", () => {
  const once = splitArtistNames(["Youn Sun Nah + 1ère partie Nit And Dogs", "Razorlight (1ère partie : The Hara)"]);
  assert.deepEqual(splitArtistNames(once), once);
});

/* ------------------------------------------------------------------ */
/* Refus à la création                                                 */
/* ------------------------------------------------------------------ */

test("seuls les concerts et DJ sets créent des fiches", () => {
  assert.equal(isMusicCategory("Concert"), true);
  assert.equal(isMusicCategory("DJ Set"), true);
  for (const category of ["Spectacle", "Danse", "Atelier", "Cinéma", "Rencontre", "Festival", "Expo", null]) {
    assert.equal(isMusicCategory(category), false, String(category));
  }
  const cases = [
    ["Sarah Devaux", "Plonger | SARAH DEVAUX, COMPAGNIE MENTEUSES", "Spectacle"],
    ["Rosa Bursztein", 'Rosa Bursztein dans "Dédoublée" - Mercredi 21/10/2026', "Spectacle"],
    ["Linda Hayford", "Abîmes | LINDA HAYFORD", "Danse"],
    ["Laurent Cantet", '"Entre les murs" de Laurent Cantet', "Cinéma"],
    ["Cécile Caillibotte", "La Fabrique des sensations", "Atelier"],
  ];
  for (const [name, title, category] of cases) {
    assert.match(artistRefusal(name, { event: { title, category } }) || "", /Événement non musical/, name);
  }
  assert.match(artistRefusal("Igor Ivanov", { event: { title: "Live Atelier", category: null } }) || "", /Catégorie inconnue/);
  assert.equal(artistRefusal("Omar Sosa", { event: concert("Sahravane | SOUAD ASLA & OMAR SOSA") }), null);
  assert.equal(artistRefusal("DJ Stig", { event: { title: "Kidi'boum", category: "DJ Set" } }), null);
});

test("compagnies, cirques et types non musicaux refusés, même sans événement", () => {
  for (const name of ["Compagnie Menteuses", "Cie les Modits", "Cirque Alfonse", "Ballet de l'opéra de Tunis"]) {
    assert.match(artistRefusal(name) || "", /pas un artiste musical/, name);
  }
  for (const typeLabel of ["Humoriste", "Drag", "Danseuse", "Compagnie de théâtre"]) {
    assert.match(artistRefusal("Mimi Styc", { typeLabel }) || "", /Type non musical/, typeLabel);
  }
  for (const typeLabel of ["Groupe", "DJ", "Danseuse et chanteuse", "Auteur-compositeur-interprète", null]) {
    assert.equal(artistRefusal("Beyond The Styx", { typeLabel }), null, String(typeLabel));
  }
  // « La Compagnie Créole » est un groupe : seul un nom qui commence par « Compagnie » est écarté.
  assert.equal(artistRefusal("La Compagnie Créole", { event: concert("Bal antillais") }), null);
});

test("jamais de fiche au nom du titre de l'événement (L'Astrolabe)", () => {
  for (const title of [
    "BUBBLE BOUM, ÇA CHAUFFE SUR LE RING",
    "LE CABARET MAGNIFIQUE : 1926",
    "PLUTO #1 : THE GNOMES",
    'PICHE "CARRÉ"',
    "PANIQUE!!",
    "COEUR GRUYÈRE - CINÉ CONCERT",
  ]) {
    const [name] = splitArtistNames([title]);
    assert.match(artistRefusal(name, { event: concert(title) }) || "", /Titre de l'événement/, title);
  }
  // Même un nom plausible : le titre seul ne suffit pas à créer une fiche.
  assert.match(artistRefusal("Brad Mehldau", { event: concert("Brad Mehldau") }) || "", /Titre de l'événement/);
});

test("prénoms seuls ignorés (Artéphé, L'alliage, La Ruche)", () => {
  for (const name of ["Candice", "Julie", "Marine", "Déborah", "Yohan", "Claire", "Antho"]) {
    assert.match(artistRefusal(name) || "", /Prénom seul/, name);
  }
  assert.match(artistRefusal("Yann", { event: concert("La guitare impertinente") }) || "", /Prénom seul/);
  assert.equal(isFirstNameOnly("CHARLOTTE"), true);
  assert.equal(isFirstNameOnly("Deborah"), true);
  assert.equal(isFirstNameOnly("Jean-Yves"), true);
});

test("un prénom tête d'affiche ou avec un compte Instagram reste un artiste", () => {
  assert.equal(artistRefusal("Zelie", { event: concert("ZELIE + 1ERE PARTIE") }), null);
  assert.equal(artistRefusal("Claire", { hasInstagram: true }), null);
});

test("noms commençant par « Atelier » ignorés", () => {
  for (const name of ["Atelier Afro-Cubain", "Atelier Jazzy", "ATELIERS PORTÉS ACROBATIQUES"]) {
    assert.match(artistRefusal(name, { event: concert("Live Atelier : Afro Cubain et Jazzy") }) || "", /Atelier/, name);
  }
});

test("les musiciens de la collecte restent acceptés", () => {
  for (const [name, title] of [
    ["Razorlight", "RAZORLIGHT + 1ÈRE PARTIE"],
    ["Assassin", "ASSASSIN + TRIPTIK"],
    ["Nit And Dogs", "Youn Sun Nah + 1ère partie Nit And Dogs"],
    ["Igor Ivanov", "Live Atelier : Afro Cubain et Jazzy"],
    ["Claire Diterzi", "Anny Karénine (fille de) | CLAIRE DITERZI"],
    ["Quatuor Béla", "Quatuor Béla | SCHUBERT, JANACEK, BRITTEN - Église Saint-Marceau"],
    ["Les Musiciens de Saint-Julien", "The Last Rose | ROSEMARY STANDLEY & LES MUSICIENS DE SAINT-JULIEN"],
    ["Berdzail", "Polysonik fait son show !"],
    ["Edgär", "Edgär + Diva Strana + El Coyoté @ Dropkick, Orléans"],
  ]) {
    assert.equal(artistRefusal(name, { event: concert(title) }), null, name);
  }
  // L'accent inhabituel d'« Edgär » en fait un nom de scène ; « Edgar » seul est un prénom.
  assert.equal(isFirstNameOnly("Edgar"), true);
});

test("upsert_artist : artistes musicaux, un nom par fiche, fiches existantes retrouvées", async () => {
  const { ctx } = fakeAgentContext({ artists: [{ id: "artist-candice", name: "Candice" }] });
  assert.deepEqual(await findOrCreateArtist(ctx, { name: "Candice" }), { id: "artist-candice", name: "Candice", created: false });
  assert.match((await findOrCreateArtist(ctx, { name: "Julie" })).skipped || "", /Prénom seul/);
  assert.match((await findOrCreateArtist(ctx, { name: "Razorlight + 1ère Partie" })).skipped || "", /un nom par fiche/);
  assert.match((await findOrCreateArtist(ctx, { name: "Atelier Jazzy" })).skipped || "", /Atelier/);
  assert.match((await findOrCreateArtist(ctx, { name: "Compagnie Menteuses" })).skipped || "", /pas un artiste musical/);
  assert.match((await findOrCreateArtist(ctx, { name: "Mimi Styc", artist_type_label: "Drag" })).skipped || "", /Type non musical/);
  assert.equal((await findOrCreateArtist(ctx, { name: "Beyond The Styx", artist_type_label: "Groupe" })).created, true);
  assert.equal((await findOrCreateArtist(ctx, { name: "Claire", instagram_url: "@claire.chante" })).created, true);
  assert.equal((await findOrCreateArtist(ctx, { name: "Razorlight" })).created, true);
});

/* ------------------------------------------------------------------ */
/* Bout en bout : lecture de la page puis import (simulation)          */
/* ------------------------------------------------------------------ */

test("L'Astrolabe : la page donne « RAZORLIGHT » et l'import crée « Razorlight »", async () => {
  const { url, data, imported } = await scrapeAstrolabe({ id: "240-RAZORLIGHT-1ERE-PARTIE", title: "RAZORLIGHT + 1ÈRE PARTIE" });
  assert.equal(data.title, "RAZORLIGHT + 1ÈRE PARTIE");
  assert.deepEqual(data.artists, ["RAZORLIGHT"]);

  const result = await importInDryRun(imported, { sourceUrl: url });
  assert.equal(result.status, "pending");
  assert.equal(result.category, "Concert");
  assert.deepEqual(result.artists_created, ["Razorlight"]);
  assert.equal(result.artists_skipped, undefined);
});

test("sans catégorie (IA indisponible), aucune fiche n'est créée", async () => {
  const { data } = await scrapeAstrolabe({ id: "240-RAZORLIGHT-1ERE-PARTIE", title: "RAZORLIGHT + 1ÈRE PARTIE" });
  const result = await importInDryRun(data);
  assert.equal(result.artists_created, undefined);
  assert.match(reasons(result).Razorlight || "", /Catégorie inconnue/);
});

test("L'Astrolabe : plateau découpé, tête d'affiche au prénom gardée, titre seul écarté", async () => {
  const assassin = await scrapeAstrolabe({ id: "226-ASSASSIN-TRIPTIK", title: "ASSASSIN + TRIPTIK" });
  assert.deepEqual((await importInDryRun(assassin.imported)).artists_created, ["Assassin", "Triptik"]);

  const zelie = await scrapeAstrolabe({ id: "234-ZELIE-1ERE-PARTIE", title: "ZELIE + 1ERE PARTIE" });
  assert.deepEqual((await importInDryRun(zelie.imported)).artists_created, ["Zelie"]);

  const pluto = await scrapeAstrolabe({ id: "245-PLUTO-1-THE-GNOMES", title: "PLUTO #1 : THE GNOMES" });
  const plutoResult = await importInDryRun(pluto.imported);
  assert.equal(plutoResult.artists_created, undefined);
  assert.match(reasons(plutoResult)["Pluto #1 : The Gnomes"] || "", /Titre de l'événement/);
});

test("spectacle, danse, atelier : aucune fiche ; concert-atelier : seuls les musiciens nommés", async () => {
  const plonger = await importInDryRun({
    title: "Plonger | SARAH DEVAUX, COMPAGNIE MENTEUSES",
    date: `${YEAR}-11-05T20:30`,
    category: "Spectacle",
    artists: ["Sarah Devaux", "Compagnie Menteuses"],
  });
  assert.equal(plonger.artists_created, undefined);
  assert.deepEqual(Object.keys(reasons(plonger)), ["Sarah Devaux", "Compagnie Menteuses"]);

  const artephe = await importInDryRun({
    title: "Atelier couture débutant - dim. 18/10",
    date: `${YEAR}-10-18T10:00`,
    category: "Atelier",
    artists: ["Candice"],
  });
  assert.equal(artephe.artists_created, undefined);
  assert.match(reasons(artephe).Candice || "", /Événement non musical \(Atelier\)/);

  const liveAtelier = await importInDryRun({
    title: "Live Atelier : Afro Cubain et Jazzy",
    date: `${YEAR}-11-14T20:30`,
    category: "Concert",
    artists: ["Atelier Afro-Cubain", "Igor Ivanov", "Atelier Jazzy", "Franck Sallé"],
  });
  assert.deepEqual(liveAtelier.artists_created, ["Igor Ivanov", "Franck Sallé"]);
  assert.deepEqual(Object.keys(reasons(liveAtelier)), ["Atelier Afro-Cubain", "Atelier Jazzy"]);
});

test("une fiche existante est toujours rattachée, même hors concert", async () => {
  const result = await importInDryRun(
    { title: "Atelier couture débutant - dim. 15/11", date: `${YEAR}-11-15T10:00`, category: "Atelier", artists: ["Candice"] },
    { artists: [{ id: "artist-candice", name: "Candice" }] },
  );
  assert.deepEqual(result.artists, ["Candice"]);
  assert.equal(result.artists_skipped, undefined);
});
