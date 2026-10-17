/*
 * Lecture des agendas et des pages pour la collecte : cas réels du passage du 17/10/2026
 * (La Ruche, Artéphé, Labomedia, L'Astrolabe, Dropkick…). Aucun accès réseau : les appels
 * à l'API Socoop et aux pages suivies sont simulés.
 *   node --test lib/scraping/collecte.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const cheerio = require("cheerio");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });

const dates = await jiti.import(path.join(root, "lib/scraping/dates.ts"));
const { discoverAgendaEvents, findAgendaLink } = await jiti.import(path.join(root, "lib/scraping/agenda.ts"));
const { readSocoopAgenda, socoopShowToAgendaEvent } = await jiti.import(path.join(root, "lib/scraping/socoop.ts"));
const { scrapeEventPage } = await jiti.import(path.join(root, "lib/scraping/scrape-event-page.ts"));
const { parseFacebookListDate } = await jiti.import(path.join(root, "lib/facebook/page-events.ts"));
const { instagramPostImageUrl } = await jiti.import(path.join(root, "lib/instagram/post-url.ts"));
const { resolveLocationFromImportedData } = await jiti.import(path.join(root, "lib/events/import-prefill.ts"));

/** Jour de la collecte : samedi 17 octobre 2026. */
const REFERENCE = new Date("2026-10-17T12:00:00+02:00");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Remplace `fetch` : chaque adresse connue renvoie sa page ou son JSON, le reste une 404. */
function serve(routes) {
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    const key = Object.keys(routes).find((candidate) => url.startsWith(candidate));
    if (!key) return new Response("introuvable", { status: 404, headers: { "content-type": "text/html" } });
    const body = routes[key];
    const json = typeof body !== "string";
    const response = new Response(json ? JSON.stringify(body) : body, {
      status: 200,
      headers: { "content-type": json ? "application/json" : "text/html; charset=utf-8" },
    });
    Object.defineProperty(response, "url", { value: url });
    return response;
  };
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

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

test("sans année, le jour de la semaine fixe l'année (événements passés compris)", () => {
  const wall = (text) => dates.toParisWallClock(text, REFERENCE)?.value;
  // La Ruche : « mercredi 7 octobre » est passé de 10 jours, ce n'est pas le 7 octobre 2027 (un jeudi).
  assert.equal(wall("mercredi 7 octobre 18h"), "2026-10-07T18:00:00");
  // Labomedia : atelier d'avril dernier, pas d'avril prochain.
  assert.equal(wall("Mercredi 8 Avril"), "2026-04-08T00:00:00");
  assert.equal(wall("jeudi 8 avril"), "2027-04-08T00:00:00");
  assert.equal(wall("lundi 5 janvier"), "2026-01-05T00:00:00");
  assert.equal(wall("dim. 01/11"), "2026-11-01T00:00:00");
  // Sans jour de semaine : prochaine occurrence, comme avant.
  assert.equal(wall("5 janvier"), "2027-01-05T00:00:00");
  // Artéphé : « Dimanche 11 novembre 2026 » est un mercredi.
  assert.equal(dates.toParisWallClock("dimanche 11 novembre 2026", REFERENCE)?.weekdayMismatch, true);
  assert.equal(
    dates.findDateInText("Mercredi 8 Avril : Atelier « La frise d’internet » au centre social", REFERENCE)?.value,
    "2026-04-08T00:00:00",
  );
});

test("contrôle d'une date lue : année corrigée, page incohérente, confirmation", () => {
  // L'IA avait daté WaveMinded du 7 octobre 2027.
  assert.deepEqual(dates.checkDateAgainstText("2027-10-07T18:00:00", ["WaveMinded", "mercredi 7 octobre\n18h"]), {
    value: "2026-10-07T18:00:00",
    corrected: true,
  });
  const artephe = dates.checkDateAgainstText("2026-11-11T14:00:00", [
    "Atelier broderie - dim. 01/11",
    "Date : Dimanche 11 novembre 2026\n14h, 2h30 d’atelier",
  ]);
  assert.equal(artephe.value, "2026-11-11T14:00:00");
  assert.match(artephe.warning, /Dimanche 11 novembre 2026.*mercredi/);
  assert.deepEqual(dates.checkDateAgainstText("2026-10-21T18:45:00", ["Rosa - Mercredi 21/10/2026"]), {
    value: "2026-10-21T18:45:00",
  });
  // Une autre édition écrite avec son année ne change rien.
  assert.deepEqual(dates.checkDateAgainstText("2026-11-21T20:00:00", ["Édition 2025 : vendredi 21 novembre 2025"]), {
    value: "2026-11-21T20:00:00",
  });
});

test("titres : date retirée, date contradictoire repérée", () => {
  assert.equal(dates.stripDateFromTitle("Atelier broderie - dim. 01/11"), "Atelier broderie");
  assert.equal(dates.stripDateFromTitle('Rosa Bursztein dans "Dédoublée" - Mercredi 21/10/2026'), 'Rosa Bursztein dans "Dédoublée"');
  assert.equal(dates.stripDateFromTitle('Alicia Cesttout dans "Insolences"- Mercredi 28/10/2026'), 'Alicia Cesttout dans "Insolences"');
  assert.equal(
    dates.stripDateFromTitle("Samedi 31 octobre 2026 : Atelier SITA Confectionner un vêtement simple"),
    "Atelier SITA Confectionner un vêtement simple",
  );
  assert.equal(dates.stripDateFromTitle("30/30 - Jeudi 22/10/2026"), "30/30");
  assert.equal(dates.stripDateFromTitle("Nuit du 4 août"), "Nuit du 4 août");
  assert.equal(dates.stripDateFromTitle("Festival du 19 au 21/11"), "Festival du 19 au 21/11");

  assert.match(dates.titleDateConflict("Atelier teinture végétale (Shibori) - dim. 12/07", ["2026-11-21T14:00:00"]), /12\/07/);
  assert.equal(dates.titleDateConflict("Rosa - Mercredi 21/10/2026", ["2026-10-21T18:45:00"]), null);
  assert.equal(dates.titleDateConflict("30/30 - Jeudi 22/10/2026", ["2026-10-22T18:45:00"]), null);
  assert.equal(dates.titleDateConflict("Fulgurances du 19 au 21/11", ["2026-11-19T18:00:00"]), null);
  assert.equal(dates.titleDateConflict("Jam session", ["2026-11-13T20:00:00"]), null);
});

/* ------------------------------------------------------------------ */
/* Agendas                                                             */
/* ------------------------------------------------------------------ */

const SOCOOP_PAGE = `<!DOCTYPE html><html lang="fr"><body>
  <sonic-tickets-app token="jeton-client-anonyme" serviceURL="/api/v2" defaultFrontend="true">
    <sonic-agenda displayTitle displayText></sonic-agenda>
  </sonic-tickets-app>
</body></html>`;

const SOCOOP_SHOWS = {
  success: true,
  data: [
    {
      id: 241,
      slug: "241-JUKE-BOX-BOUM",
      start_date: 1792497600,
      edito: { title: "JUKE-BOX BOUM" },
      picture: { url: "https://billetterie.lastrolabe.org/sites/files/multiseances/241.png" },
      infos_status: { publication: "on_sale" },
    },
    {
      id: 240,
      slug: "240-RAZORLIGHT-1ERE-PARTIE",
      start_date: 1795118400,
      edito: { title: "RAZORLIGHT + 1ÈRE PARTIE" },
      picture: null,
      infos_status: { publication: "cancelled" },
    },
  ],
};

test("billetterie Socoop : agenda lu par l'API publique de la page", async () => {
  const pageUrl = "https://billetterie.lastrolabe.org/agenda";
  assert.deepEqual(readSocoopAgenda(cheerio.load(SOCOOP_PAGE), pageUrl), {
    origin: "https://billetterie.lastrolabe.org",
    apiUrl: "https://billetterie.lastrolabe.org/api/v2",
    token: "jeton-client-anonyme",
  });
  assert.deepEqual(socoopShowToAgendaEvent(SOCOOP_SHOWS.data[0], "https://billetterie.lastrolabe.org"), {
    url: "https://billetterie.lastrolabe.org/agenda/241-JUKE-BOX-BOUM",
    title: "JUKE-BOX BOUM",
    date: "2026-10-20T14:00:00",
    image_url: "https://billetterie.lastrolabe.org/sites/files/multiseances/241.png",
    cancelled: undefined,
  });

  let authorization = null;
  serve({ "https://billetterie.lastrolabe.org/api/v2/shows": SOCOOP_SHOWS });
  const served = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    authorization = new Headers(init?.headers).get("authorization");
    return served(input, init);
  };
  const result = await discoverAgendaEvents({ agendaUrl: pageUrl, prefetched: { html: SOCOOP_PAGE, finalUrl: pageUrl } });
  assert.equal(result.method, "socoop");
  assert.equal(authorization, "Bearer jeton-client-anonyme");
  assert.deepEqual(
    result.events.map((event) => [event.url, event.cancelled ?? false]),
    [
      ["https://billetterie.lastrolabe.org/agenda/241-JUKE-BOX-BOUM", false],
      ["https://billetterie.lastrolabe.org/agenda/240-RAZORLIGHT-1ERE-PARTIE", true],
    ],
  );
});

test("détection automatique : menus ignorés, fiches WordPress gardées et datées", async () => {
  const html = `<!DOCTYPE html><html><body>
    <header class="site-header"><nav>
      <a href="/infos-pratiques/">Infos pratiques</a><a href="/la-salle/">La salle</a><a href="/agenda/">Agenda</a>
    </nav></header>
    <main>
      <article><header class="entry-header"><h2>
        <a href="/samedi-31-octobre-2026-cafe-reparation-numerique/">Samedi 31 octobre 2026 : Café Réparation Numérique</a>
      </h2></header></article>
      <article><header class="entry-header"><h2>
        <a href="/samedi-28-novembre-2026-cafe-reparation-numerique/">Samedi 28 novembre 2026 : Café Réparation Numérique</a>
      </h2></header></article>
    </main>
    <footer><a href="/partenaires/">Partenaires</a><a href="/benevoles/">Bénévoles</a></footer>
  </body></html>`;
  const result = await discoverAgendaEvents({ agendaUrl: "https://labomedia.org/", prefetched: { html, finalUrl: "https://labomedia.org/" } });
  assert.equal(result.method, "auto");
  assert.deepEqual(
    result.events.map((event) => event.date),
    ["2026-10-31T00:00:00", "2026-11-28T00:00:00"],
  );
});

test("page d'accueil ou lien mort : le lien « Agenda » du site est suivi", async () => {
  const home = `<!DOCTYPE html><html><body>
    <nav><a href="/">Accueil</a><a href="/tarifs/">Tarifs</a><a href="/agenda-concerts-evenements-2026-2027/">Agenda</a></nav>
    <main><a href="/ecole/">L'école</a><a href="/equipe/">L'équipe</a><a href="/contacts/">Contacts</a></main>
  </body></html>`;
  const agenda = `<!DOCTYPE html><html><body><main>
    <div class="concert"><a href="/evenement/soiree-jazz/">Soirée jazz</a><p>vendredi 6 novembre 2026 à 20h30</p></div>
    <div class="concert"><a href="/evenement/bal-folk/">Bal folk</a><p>samedi 14 novembre 2026 à 21h</p></div>
  </main></body></html>`;
  assert.equal(findAgendaLink(cheerio.load(home), "https://musique-equilibre.fr/"), "https://musique-equilibre.fr/agenda-concerts-evenements-2026-2027/");

  serve({ "https://musique-equilibre.fr/agenda-concerts-evenements-2026-2027/": agenda, "https://musique-equilibre.fr/": home });
  const fromHome = await discoverAgendaEvents({ agendaUrl: "https://musique-equilibre.fr/" });
  assert.equal(fromHome.agendaUrl, "https://musique-equilibre.fr/agenda-concerts-evenements-2026-2027/");
  assert.deepEqual(
    fromHome.events.map((event) => [event.title, event.date]),
    [
      ["Soirée jazz", "2026-11-06T20:30:00"],
      ["Bal folk", "2026-11-14T21:00:00"],
    ],
  );

  // CCNO : l'adresse enregistrée répond 404, l'accueil donne la nouvelle page d'agenda.
  const deadLink = await discoverAgendaEvents({ agendaUrl: "https://musique-equilibre.fr/fr/calendrier" });
  assert.equal(deadLink.agendaUrl, "https://musique-equilibre.fr/agenda-concerts-evenements-2026-2027/");
  assert.equal(deadLink.events.length, 2);
});

/* ------------------------------------------------------------------ */
/* Pages d'événements                                                  */
/* ------------------------------------------------------------------ */

async function scrape(url, html) {
  const result = await scrapeEventPage({ url, supabase: emptySupabase, prefetched: { html, finalUrl: url }, disableAI: true });
  assert.equal(result.ok, true);
  return result.data;
}

const jsonLd = (event) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Event", ...event })}</script>`;

test("page sans image de partage : l'affiche du contenu est reprise (La Ruche)", async () => {
  const data = await scrape(
    "https://www.laruche-orleans.fr/evenement/kidiboum/",
    `<!DOCTYPE html><html><head><meta property="og:title" content="Kidi'boum - La Ruche en Scène"/></head><body>
      <header><img src="/wp-content/uploads/2022/08/logo-ruche.png" width="300" height="120" alt=""></header>
      <main>
        <img width="3194" height="36" data-src="/wp-content/uploads/2022/08/barre-hexagone.svg" src="data:image/svg+xml;base64,AAAA" alt="">
        <img fetchpriority="high" width="640" height="842" src="https://www.laruche-orleans.fr/wp-content/uploads/2026/09/kidiboum.jpg" class="attachment-large size-large wp-image-8144" alt="">
        <p>dimanche 1er novembre</p><p>16h</p>
      </main></body></html>`,
  );
  assert.equal(data.image_url, "https://www.laruche-orleans.fr/wp-content/uploads/2026/09/kidiboum.jpg");
});

test("date lue confrontée à la page : année corrigée ou date signalée douteuse", async () => {
  const corrected = await scrape(
    "https://www.laruche-orleans.fr/evenement/waveminded/",
    `<html><head>${jsonLd({ name: "WaveMinded", startDate: "2027-10-07T18:00" })}</head>
      <body><main><p>mercredi 7 octobre</p><p>18h</p><p>WaveMinded est né…</p></main></body></html>`,
  );
  assert.equal(corrected.date, "2026-10-07T18:00:00");
  assert.match(corrected.date_note, /2027 → 2026/);

  const doubtful = await scrape(
    "https://www.artephe.fr/ateliers/p/atelier-broderie-sam-03/10-swyww",
    `<html><head>${jsonLd({ name: "Atelier broderie - dim. 01/11", startDate: "2026-11-11T14:00" })}</head>
      <body><main><p>Date : Dimanche 11 novembre 2026</p><p>14h, 2h30 d’atelier</p></main></body></html>`,
  );
  assert.equal(doubtful.date, "2026-11-11T14:00:00");
  assert.match(doubtful.date_warning, /mercredi/);
});

test("titre « … - lieu » : le lieu est retiré du titre", async () => {
  const data = await scrape(
    "https://billetterie-sn-orleans.mapado.com/event/736803-drache-nationale-compagnie-anoraks",
    `<html><head>${jsonLd({
      name: "Drache Nationale | COMPAGNIE ANORAKS - Théâtre de la Tête Noire",
      startDate: "2027-01-07T19:30:00+01:00",
      location: { "@type": "Place", name: "Théâtre de la Tête Noire" },
    })}</head><body></body></html>`,
  );
  assert.equal(data.title, "Drache Nationale | COMPAGNIE ANORAKS");
  assert.equal(data.location, "Théâtre de la Tête Noire");
});

/* ------------------------------------------------------------------ */
/* Réseaux et lieux                                                    */
/* ------------------------------------------------------------------ */

test("Facebook : date de la liste d'événements d'une page", () => {
  assert.equal(parseFacebookListDate("Sat, Oct 24 at 7:00 PM CEST", REFERENCE), "2026-10-24T19:00:00");
  assert.equal(parseFacebookListDate("Wed, Oct 21 at 8:30 PM CEST", REFERENCE), "2026-10-21T20:30:00");
  assert.equal(parseFacebookListDate("Thu, Nov 19 - Nov 22", REFERENCE), "2026-11-19T00:00:00");
  assert.equal(parseFacebookListDate("Sat, Nov 28 at 12:30 AM CET", REFERENCE), "2026-11-28T00:30:00");
  assert.equal(parseFacebookListDate("bientôt", REFERENCE), undefined);
});

test("Instagram : affiche d'un post sans lien d'image", () => {
  assert.equal(
    instagramPostImageUrl("https://www.instagram.com/p/Dd9VqNgDaxE/?igsh=MTBhM2E4YjJ6dGk2aw=="),
    "https://www.instagram.com/p/Dd9VqNgDaxE/media/?size=l",
  );
  assert.equal(instagramPostImageUrl("https://www.instagram.com/reel/DXyz123/"), "https://www.instagram.com/p/DXyz123/media/?size=l");
  assert.equal(instagramPostImageUrl("https://www.instagram.com/chafouin_orleans/"), null);
  assert.equal(instagramPostImageUrl("https://exemple.fr/affiche.jpg"), null);
});

test("lieux : « Salle du CREDO au 108 » est Le 108", () => {
  const locations = [
    { id: "le-108", name: "Le 108", address: "108 rue de Bourgogne, 45000 Orléans" },
    { id: "astrolabe", name: "L'Astrolabe", address: "1 rue Alexandre Avisse, 45000 Orléans" },
  ];
  assert.equal(resolveLocationFromImportedData(locations, "Salle du CREDO au 108")?.id, "le-108");
  assert.equal(resolveLocationFromImportedData(locations, "Concert à l'Astrolabe")?.id, "astrolabe");
  assert.equal(resolveLocationFromImportedData(locations, "Église Saint-Marceau"), null);
});
