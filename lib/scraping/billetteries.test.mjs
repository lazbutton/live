/*
 * Billetteries lues à part, cas réels relevés le 23/10/2026 lors de la relecture des événements à venir
 * (pages dans fixtures/, réduites à ce qui sert) :
 *   - L'Astrolabe (Socoop) : le startDate est l'ouverture des portes ; le début est lu dans la présentation,
 *     sinon sur la page du spectacle de lastrolabe.org ;
 *   - prix d'appel : tarifs réservés écartés (« Abonné.e », « Carte Passerelle », adhérents, groupes,
 *     « Parcours culturel (MMD) », billet réservé aux étudiants inscrits à l'Université d'Orléans) ;
 *   - Mapado : tarifs de l'état de la page, ceux d'un événement à plusieurs séances sur la page d'une séance ;
 *   - Billetweb : tarifs de la boutique (iframe shop.php), description avec ses paragraphes ;
 *   - Fleury-les-Aubrais (Socoop) : deux séances le même jour, chacune son lien `?session=`.
 * Aucun accès réseau : les pages liées sont servies par un `fetch` simulé.
 *   node --test lib/scraping/billetteries.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const cheerio = require("cheerio");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });

const { scrapeEventPage } = await jiti.import(path.join(root, "lib/scraping/scrape-event-page.ts"));
const { findDoorsAndStart, parisToday } = await jiti.import(path.join(root, "lib/scraping/dates.ts"));
const { isRestrictedTariff, publicAmountsInText, publicPriceRange } = await jiti.import(path.join(root, "lib/scraping/prices.ts"));
const { findAstrolabeProgramUrl } = await jiti.import(path.join(root, "lib/scraping/astrolabe.ts"));
const { readBilletwebShopTariffs } = await jiti.import(path.join(root, "lib/scraping/billetweb.ts"));
const { buildEventFormPrefillFromImport } = await jiti.import(path.join(root, "lib/events/import-prefill.ts"));
const { createAgentEvent } = await jiti.import(path.join(root, "lib/agent/events.ts"));

const fixture = (name) => fs.readFileSync(path.join(root, "lib/scraping/fixtures", name), "utf8");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Remplace `fetch` : chaque adresse connue (la plus longue d'abord) renvoie sa page, le reste une 404. */
function serve(routes) {
  const requested = [];
  const keys = Object.keys(routes).sort((left, right) => right.length - left.length);
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    requested.push(url);
    const key = keys.find((candidate) => url === candidate || url.startsWith(candidate));
    if (!key) return new Response("introuvable", { status: 404, headers: { "content-type": "text/html" } });
    const response = new Response(routes[key], { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    Object.defineProperty(response, "url", { value: url });
    return response;
  };
  return requested;
}

/** Client Supabase factice : aucune configuration de source, rien n'est écrit. */
const emptySupabase = {
  from() {
    const query = new Proxy(
      {},
      {
        get: (_target, property) =>
          property === "then"
            ? (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject)
            : () => query,
      },
    );
    return query;
  },
};

async function scrape(url, html) {
  const result = await scrapeEventPage({ url, supabase: emptySupabase, prefetched: { html, finalUrl: url }, disableAI: true });
  assert.equal(result.ok, true);
  return result.data;
}

/* ------------------------------------------------------------------ */
/* Prix d'appel : tarifs ouverts au public                             */
/* ------------------------------------------------------------------ */

test("tarifs réservés : abonnés, carte du lieu, adhérents, groupes, élèves du conservatoire", () => {
  const restricted = [
    "Abonné.e", // L'Astrolabe
    "Abonné", // Espace Béraire (La Chapelle-Saint-Mesmin), réservé à qui prend 3 spectacles
    "Carte Passerelle", // La Passerelle (Fleury-les-Aubrais)
    "Tarif adhérent", // Scène nationale
    "Tarif adhérent Petit curieux",
    "Tarif groupe (10 personnes et plus)",
    " Tarif Adhérent(e)s", // Du Blues O' Swing (Billetweb)
    "Parcours culturel (MMD)", // L'Unisson
  ];
  for (const name of restricted) assert.equal(isRestrictedTariff({ name }), true, name);
  assert.equal(
    isRestrictedTariff({
      name: "Billet étudiant - Gratuit",
      description: "Sur présentation d'un justificatif.Réservé aux étudiants inscrits à l'Université d'Orléans et en Classes Préparatoires des Grandes Écoles.",
    }),
    true,
  );

  const open = [
    "Prévente",
    "Prévente adulte",
    "Enfants jusqu'à 12 ans",
    "Réduit",
    "Solidaire",
    "Plein",
    "Tarif étudiant",
    "Moins de 26 ans",
    "Enfants de moins de douze ans",
    "Adulte en situation de handicap",
  ];
  for (const name of open) assert.equal(isRestrictedTariff({ name }), false, name);
  // Un tarif réduit reste ouvert à tous, même quand il cite scolaires ou élèves du conservatoire parmi ses ayants droit.
  assert.equal(
    isRestrictedTariff({
      name: "Billet - Tarif réduit",
      description:
        "Sur présentation d'un justificatif.Réservé aux étudiants de l'enseignement supérieur (hors Université d'Orléans), lycéens, scolaires, élèves du Conservatoire,personnels de l'Université et du Crous, demandeurs d'emploi, bénéficiaires des minimas sociaux.",
    }),
    false,
  );
  assert.equal(
    isRestrictedTariff({
      name: "Tarif plein Petit curieux",
      description: "Tarif réservé aux enfants de - 18 ans accompagné d'un adulte. Un justificatif en cours de validité devra être présenté avant l'entrée en salle.",
    }),
    false,
  );
  assert.equal(isRestrictedTariff({ name: "Tarif non adhérent" }), false);
  // Tout est réservé : prix inconnu plutôt qu'un prix d'abonné.
  assert.deepEqual(publicPriceRange([{ name: "Abonné.e", price: 20 }]), {});
});

test("tarifs écrits en texte : le libellé de chaque montant compte", () => {
  // Résumé de partage de la page Razorlight de lastrolabe.org.
  assert.deepEqual(publicAmountsInText("ABONNÉ ASTRO : 20€ / PRÉVENTE : 25€ / SUR PLACE : 28€ PLACEMENT LIBRE, DEBOUT"), [25, 28]);
  // On sort ! (18/10/2026) : le prix avec la carte est écarté.
  assert.deepEqual(publicAmountsInText("Tarifs de 5€ à 25€, 15€ avec la Carte"), [5, 25]);
});

/* ------------------------------------------------------------------ */
/* L'Astrolabe : ouverture des portes et début                         */
/* ------------------------------------------------------------------ */

test("heures d'ouverture des portes et de début écrites dans une page", () => {
  assert.deepEqual(findDoorsAndStart(["OUVERTURE DES PORTES À 15H, DÉBUT À 15H30DURÉE 45 MINTOUT PUBLIC, À PARTIR DE 6 ANS"]), {
    doors: "15:00",
    start: "15:30",
  });
  assert.deepEqual(findDoorsAndStart(["PLACEMENT LIBRE, DEBOUT OUVERTURE DES PORTES À 20H, DÉBUT DE LA 1ÈRE PARTIE À 20H30"]), {
    doors: "20:00",
    start: "20:30",
  });
  assert.deepEqual(findDoorsAndStart(["DÉBUT DE LA 1ÈRE PARTIE À 21H"]), { start: "21:00" });
  // Textes réels sans horaire : Razorlight sur lastrolabe.org, Marche à l'étoile à Fleury.
  assert.deepEqual(findDoorsAndStart(["Razorlight a connu le succès au début des années 2000, avec des tubes tels que « America »."]), {});
  assert.deepEqual(findDoorsAndStart(["Un voyage sidéral qui débute sur les hauteurs du désert d’Atacama, au pied du plus puissant radiotélescope"]), {});
});

test("billetterie de L'Astrolabe : début lu dans la présentation, ouverture des portes à part (Panique)", async () => {
  const requested = serve({});
  const data = await scrape("https://billetterie.lastrolabe.org/agenda/242-PANIQUE", fixture("lastrolabe-billetterie-242-panique.html"));
  assert.equal(data.date, "2027-01-24T15:30:00");
  assert.equal(data.door_opening_time, "15:00");
  assert.equal(data.end_date, "2027-01-24T16:00:00");
  // « Prévente adulte » 10 €, « Enfants jusqu'à 12 ans » 8 € ; « Abonné.e » ne compte pas.
  assert.equal(data.price_min, 8);
  assert.equal(data.price_max, 10);
  // Le début est dans la présentation : lastrolabe.org n'est pas lu.
  assert.deepEqual(requested, []);
});

test("billetterie de L'Astrolabe : début lu sur la page du spectacle de lastrolabe.org (Razorlight)", async () => {
  const requested = serve({
    "https://www.lastrolabe.org/agenda/razorlight/": fixture("lastrolabe-razorlight.html"),
    "https://www.lastrolabe.org/": fixture("lastrolabe-accueil.html"),
  });
  const data = await scrape(
    "https://billetterie.lastrolabe.org/agenda/240-RAZORLIGHT-1ERE-PARTIE",
    fixture("lastrolabe-billetterie-240-razorlight.html"),
  );
  assert.equal(data.date, "2026-11-19T20:30:00");
  assert.equal(data.door_opening_time, "20:00");
  // « Prévente » 25 € : « Abonné.e » 20 € n'est pas le prix d'appel.
  assert.equal(data.price_min, 25);
  assert.equal(data.price_max, undefined);
  assert.deepEqual(requested, ["https://www.lastrolabe.org/", "https://www.lastrolabe.org/agenda/razorlight/"]);
});

test("billetterie de L'Astrolabe : en désaccord avec le site, le début écrit sur le site l'emporte (Zed Yun Pavarotti)", async () => {
  serve({
    "https://www.lastrolabe.org/agenda/zed-yun-pavarotti/": fixture("lastrolabe-zed-yun-pavarotti.html"),
    "https://www.lastrolabe.org/": fixture("lastrolabe-accueil.html"),
  });
  // Billetterie : 20:15 ; site : « OUVERTURE DES PORTES À 20H30, DÉBUT DE LA 1ÈRE PARTIE À 21H ».
  const data = await scrape(
    "https://billetterie.lastrolabe.org/agenda/256-ZED-YUN-PAVAROTTI-1ERE-PARTIE",
    fixture("lastrolabe-billetterie-256-zed-yun-pavarotti.html"),
  );
  assert.equal(data.date, "2027-02-11T21:00:00");
  assert.equal(data.door_opening_time, "20:30");
});

test("billetterie de L'Astrolabe : site injoignable, l'heure de la billetterie reste", async () => {
  serve({});
  const data = await scrape(
    "https://billetterie.lastrolabe.org/agenda/240-RAZORLIGHT-1ERE-PARTIE",
    fixture("lastrolabe-billetterie-240-razorlight.html"),
  );
  assert.equal(data.date, "2026-11-19T20:00:00");
  assert.equal(data.door_opening_time, undefined);
});

test("lastrolabe.org : page d'un spectacle retrouvée par le jour et le titre", () => {
  const $ = cheerio.load(fixture("lastrolabe-accueil.html"));
  assert.equal(
    findAstrolabeProgramUrl($, { title: "RAZORLIGHT + 1ÈRE PARTIE", date: "2026-11-19T20:00:00" }),
    "https://www.lastrolabe.org/agenda/razorlight/",
  );
  assert.equal(findAstrolabeProgramUrl($, { title: "PANIQUE!!", date: "2027-01-24T15:00:00" }), "https://www.lastrolabe.org/agenda/panique/");
  // Deux spectacles le 3 novembre : le titre départage.
  assert.equal(
    findAstrolabeProgramUrl($, { title: "PLUTO #1 : THE GNOMES", date: "2026-11-03T18:30:00" }),
    "https://www.lastrolabe.org/agenda/pluto-1-the-gnomes/",
  );
  assert.equal(
    findAstrolabeProgramUrl($, { title: "WEBINAIRE : LA CARTOGRAPHIE DES MUSIQUES ACTUELLES", date: "2026-11-03T19:00:00" }),
    "https://www.lastrolabe.org/agenda/webinaire-la-cartographie-des-musiques-actuelles/",
  );
  // Aucun spectacle ce jour-là, ou un autre titre : rien.
  assert.equal(findAstrolabeProgramUrl($, { title: "RAZORLIGHT", date: "2026-11-18T20:00:00" }), null);
  assert.equal(findAstrolabeProgramUrl($, { title: "JUKE-BOX BOUM", date: "2026-11-19T20:00:00" }), null);
});

/* ------------------------------------------------------------------ */
/* Mapado                                                              */
/* ------------------------------------------------------------------ */

test("Mapado : tarif réduit pour prix d'appel, abonnés écartés (Espace Béraire)", async () => {
  const data = await scrape(
    "https://ville-lachapellesaintmesmin.mapado.com/event/783772-tout-le-monde-ecrit-des-chansons",
    fixture("mapado-chapelle-tout-le-monde-ecrit-des-chansons.html"),
  );
  // « Tarif réduit » 11 €, « Tarif Plein » 16 € ; « Abonné » 10 € et « Abonnés » (exonération) écartés.
  assert.equal(data.price_min, 11);
  assert.equal(data.price_max, 16);
});

test("Mapado : l'option gratuite « Goûter/Atelier » n'est pas le prix du spectacle (Espace Béraire)", async () => {
  const data = await scrape(
    "https://ville-lachapellesaintmesmin.mapado.com/event/783065-le-magicien-des-couleurs",
    fixture("mapado-chapelle-le-magicien-des-couleurs.html"),
  );
  // « Tarif réduit » 5 €, « Tarif Plein » 8 € ; « Abonné » 4 € et le goûter gratuit des enfants écartés.
  assert.equal(data.price_min, 5);
  assert.equal(data.price_max, 8);
});

test("Mapado : spectacle gratuit sur réservation (Scène nationale)", async () => {
  const data = await scrape(
    "https://billetterie-sn-orleans.mapado.com/event/739225-jamais-sans-ma-tribu-4-6-ans",
    fixture("mapado-sn-jamais-sans-ma-tribu.html"),
  );
  assert.equal(data.price_min, 0);
  assert.equal(data.price_max, undefined);
});

test("Mapado : « Parcours culturel (MMD) », réservé aux élèves du conservatoire, écarté (L'Unisson)", async () => {
  const data = await scrape("https://billetterie-saintjeandelaruelle.mapado.com/event/815507-boom", fixture("mapado-unisson-boom.html"));
  assert.equal(data.price_min, 9);
  assert.equal(data.price_max, 12);
});

test("Mapado : plusieurs séances, tarifs lus sur la page de la séance (Scène nationale)", async () => {
  const pageUrl = "https://billetterie-sn-orleans.mapado.com/event/736768-nature-morte-cirque-le-roux";
  const requested = serve({ [`${pageUrl}?eventDate=2825232`]: fixture("mapado-sn-nature-morte-seance-2825232.html") });
  const data = await scrape(pageUrl, fixture("mapado-sn-nature-morte.html"));
  // « Tarif étudiant » 5 €, « Tarif plein » 30 € ; adhérents et groupes écartés.
  assert.equal(data.price_min, 5);
  assert.equal(data.price_max, 30);
  assert.deepEqual(requested, [`${pageUrl}?eventDate=2825232`]);
});

/* ------------------------------------------------------------------ */
/* Billetweb                                                           */
/* ------------------------------------------------------------------ */

test("Billetweb : tarifs de la boutique, description avec ses paragraphes (Du Blues O' Swing)", async () => {
  const requested = serve({
    "https://www.billetweb.fr/shop.php?event=max-de-bernardi-veronica-sbergia": fixture("billetweb-max-de-bernardi-boutique.html"),
  });
  const data = await scrape("https://www.billetweb.fr/max-de-bernardi-veronica-sbergia", fixture("billetweb-max-de-bernardi.html"));
  assert.equal(requested.length, 1);
  assert.match(requested[0], /^https:\/\/www\.billetweb\.fr\/shop\.php\?event=max-de-bernardi-veronica-sbergia&/);
  // « Enfants de moins de douze ans » 10 €, « Plein tarif » 25 € ; « Tarif Adhérent(e)s » écarté.
  assert.equal(data.price_min, 10);
  assert.equal(data.price_max, 25);
  assert.equal(data.date, "2026-11-15T16:30:00");
  assert.match(data.description, /de l’humour et du groove…\n\nVeronica Sbergia est une chanteuse/);
  assert.equal(data.description.split("\n\n").length, 5);
});

test("Billetweb : billet gratuit réservé aux étudiants de l'Université d'Orléans écarté (Le Bouillon)", () => {
  const tariffs = readBilletwebShopTariffs(cheerio.load(fixture("billetweb-lynx-irl-golimar-boutique.html")));
  assert.deepEqual(
    tariffs.map((tariff) => [tariff.name, tariff.price]),
    [
      ["Billet étudiant - Gratuit", 0],
      ["Billet - Tarif réduit", 12],
      ["Billet - Plein tarif", 15],
    ],
  );
  assert.deepEqual(publicPriceRange(tariffs), { min: 12, max: 15 });
});

/* ------------------------------------------------------------------ */
/* Fleury-les-Aubrais : un lien par séance                             */
/* ------------------------------------------------------------------ */

const FLEURY_URL = "https://billetterie.fleurylesaubrais.fr/agenda/335-MARCHE-A-L-ETOILE-LA-DIAGONALE-SUD-AMERICAINE";

test("Fleury : deux séances le même jour, chacune avec son lien de billetterie", async () => {
  const data = await scrape(FLEURY_URL, fixture("fleury-335-marche-a-l-etoile.html"));
  assert.equal(data.date, "2027-01-12T14:30:00");
  assert.equal(data.external_url, `${FLEURY_URL}?session=335`);
  assert.deepEqual(data.occurrences, [
    {
      date: "2027-01-12T20:30:00",
      end_date: "2027-01-12T21:45:00",
      external_url: "https://billetterie.fleurylesaubrais.fr/agenda/336-MARCHE-A-L-ETOILE-LA-DIAGONALE-SUD-AMERICAINE?session=336",
    },
  ]);
  // « Réduit » et « Solidaire » 4 €, « Plein » 7 € ; « Carte Passerelle » écartée.
  assert.equal(data.price_min, 4);
  assert.equal(data.price_max, 7);

  const { prefill } = await buildEventFormPrefillFromImport({ data, sourceUrl: FLEURY_URL, categories: [], locations: [], organizers: [] });
  assert.equal(prefill.form.external_url, `${FLEURY_URL}?session=335`);
  assert.deepEqual(prefill.additionalDates, [
    {
      date: "2027-01-12T20:30",
      end_date: "2027-01-12T21:45",
      external_url: "https://billetterie.fleurylesaubrais.fr/agenda/336-MARCHE-A-L-ETOILE-LA-DIAGONALE-SUD-AMERICAINE?session=336",
    },
  ]);
});

/** Client Supabase factice qui garde les lignes insérées (aucune donnée existante). */
function recordingSupabase() {
  const inserted = [];
  return {
    inserted,
    from(table) {
      let rows = null;
      const query = new Proxy(
        {},
        {
          get(_target, property) {
            if (property === "insert") {
              return (values) => {
                rows = Array.isArray(values) ? values : [values];
                inserted.push({ table, rows });
                return query;
              };
            }
            if (property === "single") return () => Promise.resolve({ data: { id: `${table}-${inserted.length}` }, error: null });
            if (property === "then") return (resolve, reject) => Promise.resolve({ data: rows ?? [], error: null }).then(resolve, reject);
            if (["update", "upsert", "delete"].includes(property)) throw new Error(`écriture inattendue (${table})`);
            return () => query;
          },
        },
      );
      return query;
    },
    storage: {
      from() {
        throw new Error("stockage interdit");
      },
    },
  };
}

test("Fleury : à la création, la deuxième séance reçoit son propre lien `?session=`", async () => {
  // L'affiche n'est pas recopiée (404) : son adresse d'origine reste.
  serve({});
  const scraped = await scrape(FLEURY_URL, fixture("fleury-335-marche-a-l-etoile.html"));
  // Séances du même jour, dans un mois : la date réelle (12/01/2027) passera.
  const day = new Date(`${parisToday()}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 30);
  const inAMonth = (value) => `${day.toISOString().slice(0, 10)}${value.slice(10)}`;
  const data = {
    ...scraped,
    date: inAMonth(scraped.date),
    end_date: inAMonth(scraped.end_date),
    occurrences: scraped.occurrences.map((occurrence) => ({
      ...occurrence,
      date: inAMonth(occurrence.date),
      end_date: inAMonth(occurrence.end_date),
    })),
  };

  const supabase = recordingSupabase();
  const result = await createAgentEvent(
    { supabase, dryRun: false },
    { data, sourceUrl: FLEURY_URL, source: null, createMissingArtists: false },
  );
  assert.equal(result.status, "pending", result.reason);
  const events = supabase.inserted.filter((entry) => entry.table === "events").flatMap((entry) => entry.rows);
  assert.deepEqual(
    events.map((row) => [row.date.slice(11, 16), row.external_url]),
    [
      ["14:30", `${FLEURY_URL}?session=335`],
      ["20:30", "https://billetterie.fleurylesaubrais.fr/agenda/336-MARCHE-A-L-ETOILE-LA-DIAGONALE-SUD-AMERICAINE?session=336"],
    ],
  );
  assert.ok(events.every((row) => row.scraping_url === FLEURY_URL));
});
