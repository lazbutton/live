/*
 * Lecture des agendas et des pages pour la collecte : cas réels des passages du 17/10/2026
 * (La Ruche, Artéphé, Labomedia, L'Astrolabe, Dropkick…) et du 18/10/2026 (Du Blues O' Swing,
 * Fabrika Pulsion, Rêve Brut, Shotgun, HelloAsso). Aucun accès réseau : les appels à l'API
 * Socoop et aux pages suivies sont simulés.
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
const { assessAgendaDiscovery, discoverAgendaEvents, findAgendaLink } = await jiti.import(path.join(root, "lib/scraping/agenda.ts"));
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
  assert.equal(dates.stripDateFromTitle("LIVE de chant - Novembre 2026"), "LIVE de chant");
  assert.equal(dates.stripDateFromTitle("Expo photo (octobre 2026)"), "Expo photo");
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

/** Page d'accueil de Du Blues O' Swing : blocs à plat, chaque concert renvoie vers Billetweb. */
const DU_BLUES_HOME = `<!DOCTYPE html><html><body>
  <nav><a href="https://dubluesoswing.fr/">Accueil</a><a href="https://dubluesoswing.fr/qui-sommes-nous/">Qui sommes-nous ?</a></nav>
  <div class="entry clearfix">
    <h1><img src="https://dubluesoswing.fr/wp-content/uploads/2015/05/logo.jpg" alt="Logo New Orleans 004 segoe-001"></h1>
    <h3>du blues O’ swing</h3>
    <p>Concerts, conférences… de blues et de jazz à Orléans et aux alentours d’Orléans (F-45 Loiret)</p>
    <p><a href="https://dubluesoswing.fr/qui-sommes-nous/">plus de détails ici</a>.</p>
    <p>Cliquez sur <a href="https://dubluesoswing.fr/youtube/"><strong>YouTube</strong></a> pour voir nos vidéos.</p>
    <h3><em>Saison 12 – 2026 – 2027</em></h3>
    <h1>Max De Bernardi &amp; Veronica Sbergia</h1>
    <h3>Subtile blend de blues, ragtime, vaudeville et hillbilly</h3>
    <h4><img src="https://www.billetweb.fr/files/page/max-de-bernardi-veronica-sbergia.png" alt="Max De Bernardi &amp; Veronica Sbergia"></h4>
    <h3><em>Concert à 16 h 30</em></h3>
    <h3><span>Dimanche 15 Novembre</span><strong> </strong><span>2026</span></h3>
    <h3><em>salle L’ENVOLEE (ex salle des fêtes)</em></h3>
    <h4><a href="https://www.billetweb.fr/max-de-bernardi-veronica-sbergia"><em><strong>Billett</strong></em><em><strong>erie</strong></em></a></h4>
    <h1>***</h1>
    <h1>Nouveau Quintette du Hot Club de France</h1>
    <h4>Le Quintette du Hot Club de France renaît de ses cendres !</h4>
    <h4><img src="https://www.billetweb.fr/files/page/quintette-du-hot-club-de-france4.jpg" alt="Nouveau Quintette du Hot Club de France"></h4>
    <p><strong>Duved Dunayevski</strong> (guitare solo) – <strong>Daniel Garlitsky</strong> (violon)</p>
    <h3><span>Dimanche 06 Décembre</span><strong> </strong><span>2026</span></h3>
    <h4><a href="https://www.billetweb.fr/quintette-du-hot-club-de-france4"><strong>Billetterie</strong></a></h4>
    <h1>***</h1>
    <h2 class="event_name">Fapy Lafertin Trio</h2>
    <h1 class="event_name"><img src="https://www.billetweb.fr/files/page/fapy-lafertin-trio.jpg" alt="Fapy Lafertin Trio"></h1>
    <h3><span>Dimanche 14 Février</span><strong> </strong><span>2027</span></h3>
    <h4><a href="https://www.billetweb.fr/fapy-lafertin-trio"><strong>Billetterie</strong></a></h4>
    <h1>***</h1>
    <h2>BILLETTERIE Saison 12</h2>
    <h2>… <a href="https://dubluesoswing.fr/billetterie-saison-11/"><em>Ici</em></a></h2>
    <p><img src="https://dubluesoswing.fr/wp-content/uploads/dsc06040-001.jpg" alt="Dsc06040 001"><a href="https://dubluesoswing.fr/dsc06040-001/">photo</a></p>
  </div>
</body></html>`;

test("agenda à plat dont les concerts renvoient vers une billetterie : liens Billetweb, titre et date du bloc", async () => {
  const url = "https://dubluesoswing.fr/";
  serve({});
  const result = await discoverAgendaEvents({ agendaUrl: url, prefetched: { html: DU_BLUES_HOME, finalUrl: url } });
  assert.equal(result.method, "auto");
  assert.deepEqual(
    result.events.map((event) => [event.url, event.title, event.date]),
    [
      ["https://www.billetweb.fr/max-de-bernardi-veronica-sbergia", "Max De Bernardi & Veronica Sbergia", "2026-11-15T00:00:00"],
      ["https://www.billetweb.fr/quintette-du-hot-club-de-france4", "Nouveau Quintette du Hot Club de France", "2026-12-06T00:00:00"],
      ["https://www.billetweb.fr/fapy-lafertin-trio", "Fapy Lafertin Trio", "2027-02-14T00:00:00"],
    ],
  );
  assert.equal(result.events[2].image_url, "https://www.billetweb.fr/files/page/fapy-lafertin-trio.jpg");
  assert.equal(assessAgendaDiscovery(result), null);
});

test("seulement des pages qui ne sont pas des événements : signalé, pas importé", async () => {
  // Du Blues O' Swing avant la lecture des billetteries : « Accueil », « Youtube »…
  const url = "https://dubluesoswing.fr/";
  const html = DU_BLUES_HOME.replace(/https:\/\/www\.billetweb\.fr\/(?!files)[\w-]+/g, "#");
  // Le lien « Billetterie … Ici » suivi faute de mieux ne mène à rien de plus.
  serve({ [url]: html });
  const result = await discoverAgendaEvents({ agendaUrl: url });
  assert.ok(result.events.length > 0);
  assert.ok(result.events.every((event) => !event.url.includes("billetweb")));
  const unreadable = assessAgendaDiscovery(result);
  assert.equal(unreadable?.reason, "not_events");
  assert.match(unreadable.message, /ne ressemblent pas à des fiches d'événement \(« /);
});

test("agenda en texte seul, sans lien par événement : signalé illisible (Fabrika Pulsion, Rêve Brut)", async () => {
  // Fabrika Pulsion (Divi) : année en intertitre, puis date, titre et lieu de chaque date.
  const fabrika = `<!DOCTYPE html><html><body>
    <header><nav><a href="https://fabrikapulsion.fr/boulevard-du-duel/">Boulevard du duel</a><a href="https://fabrikapulsion.fr/agenda/">Agenda</a></nav></header>
    <div id="main-content"><div class="et_pb_section">
      <div class="et_pb_text_inner"><h3>2027</h3></div>
      <div class="et_pb_text_inner"><h3><strong><span>28 février</span></strong></h3>
        <h2>Boulevard du Duel &#8211; 20h30</h2><p>Les Fabricoles &#8211; La Fabrique Meung-sur-Loire</p></div>
      <div class="et_pb_text_inner"><h3><strong>17 juillet (à confirmer)</strong></h3>
        <h2>Boulevard du Duel</h2><p>La Bamboche &#8211; Olivet</p></div>
      <div class="et_pb_text_inner"><h3><strong><span>27 mai</span></strong></h3>
        <h2>Gunter &amp; Gunter</h2><p>Journée de sensibilisation à la sécurité routière &#8211; Orléans</p></div>
    </div></div>
    <footer><p>© 2026 Fabrika Pulsion</p></footer>
  </body></html>`;
  const fabrikaUrl = "https://fabrikapulsion.fr/agenda/";
  serve({ [fabrikaUrl]: fabrika, "https://fabrikapulsion.fr": fabrika });
  const fabrikaResult = await discoverAgendaEvents({ agendaUrl: fabrikaUrl });
  assert.equal(fabrikaResult.events.length, 0);
  assert.equal(fabrikaResult.textDates, 3);
  const unreadable = assessAgendaDiscovery(fabrikaResult);
  assert.equal(unreadable?.reason, "text_only");
  assert.match(unreadable.message, /3 dates/);

  // Rêve Brut (Wix, rendu côté serveur) : une ligne par date sous « À VENIR ».
  const reveBrut = `<!DOCTYPE html><html><body>
    <header><nav><a href="https://www.revebrut.com/agenda">Agenda</a><a href="https://www.revebrut.com/contact">Contact</a></nav></header>
    <main><h2>AGENDA</h2><h4>À VENIR</h4>
      <p>13 juin 2026 - Séance lecture bilingue FR-LSF Les Grandes Oreilles - Médiathèque de Saran (45)</p>
      <p>12 février 2027 - Les Diablogues - L'Eole à Gommerville (28)</p>
    </main>
  </body></html>`;
  const reveBrutUrl = "https://www.revebrut.com/agenda";
  const reveBrutResult = await discoverAgendaEvents({ agendaUrl: reveBrutUrl, prefetched: { html: reveBrut, finalUrl: reveBrutUrl } });
  assert.equal(reveBrutResult.events.length, 0);
  assert.equal(assessAgendaDiscovery(reveBrutResult)?.reason, "text_only");

  // Page sans aucune date (agenda vide, ou dessiné en JavaScript).
  const emptyUrl = "https://exemple.fr/agenda";
  const empty = await discoverAgendaEvents({
    agendaUrl: emptyUrl,
    prefetched: { html: `<html><body><div id="root"></div><script>render()</script></body></html>`, finalUrl: emptyUrl },
  });
  assert.equal(assessAgendaDiscovery(empty)?.reason, "empty");
});

test("billetterie qui refuse les robots (403, 429) : signalée bloquée", async () => {
  const statuses = { "https://shotgun.live": 429, "https://www.helloasso.com": 403 };
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    const status = Object.entries(statuses).find(([prefix]) => url.startsWith(prefix))?.[1] ?? 404;
    return new Response("Just a moment...", { status, headers: { "content-type": "text/html" } });
  };
  const shotgun = await discoverAgendaEvents({ agendaUrl: "https://shotgun.live/fr/venues/arka-atmosphere" });
  assert.equal(shotgun.failedStatus, 429);
  assert.deepEqual(assessAgendaDiscovery(shotgun), {
    reason: "blocked",
    message: "Le site limite la lecture automatique (erreur 429, trop de requêtes).",
  });
  const helloasso = await discoverAgendaEvents({ agendaUrl: "https://www.helloasso.com/associations/orleans-jazz-messengers" });
  assert.equal(assessAgendaDiscovery(helloasso)?.reason, "blocked");
  assert.match(assessAgendaDiscovery(helloasso).message, /erreur 403/);
  // Lien mort : illisible aussi, mais pour une autre raison.
  const dead = await discoverAgendaEvents({ agendaUrl: "https://exemple.fr/agenda" });
  assert.equal(assessAgendaDiscovery(dead)?.reason, "unreachable");
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
