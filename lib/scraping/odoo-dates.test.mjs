/*
 * Dates des pages Odoo (Orléans Comedy Club) : Odoo écrit ses dates en UTC sans fuseau
 * (`<time datetime="2026-10-21 16:45:00">18:45</time>`), seul le texte affiché est à l'heure de Paris.
 * Une date importée avec fuseau (« 2026-10-29 17:45:00Z ») est convertie en heure de Paris jusqu'au
 * formulaire (relecture du 23/10/2026 : 30/30 du 29/10 enregistré à 17:45 au lieu de 18:45).
 *   node --test lib/scraping/odoo-dates.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const cheerio = require("cheerio");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });

const { toParisWallClock } = await jiti.import(path.join(root, "lib/scraping/dates.ts"));
const { extractStructuredEvents } = await jiti.import(path.join(root, "lib/scraping/structured-event.ts"));
const { scrapeEventPage } = await jiti.import(path.join(root, "lib/scraping/scrape-event-page.ts"));
const { buildEventFormPrefillFromImport, importedDateTime } = await jiti.import(path.join(root, "lib/events/import-prefill.ts"));
const { toFloatingParisIsoString } = await jiti.import(path.join(root, "lib/facebook/scrape-facebook-event.ts"));

/** Extrait d'une page d'événement Odoo (website_event), balisage d'origine. */
function odooEventPage({ title, startUtc, endUtc, startLabel, endLabel }) {
  return `<!DOCTYPE html>
<html lang="fr-FR" data-website-id="3" data-main-object="event.event(309,)">
  <head>
    <meta charset="utf-8"/>
    <meta name="generator" content="Odoo"/>
    <meta property="og:title" content="${title}"/>
    <meta property="og:site_name" content="Orléans Comedy Club"/>
    <title>${title} | Orléans Comedy Club</title>
  </head>
  <body>
    <div class="h-100" name="event" itemscope="itemscope" itemtype="http://schema.org/Event">
      <meta itemprop="startDate" content="${startUtc}Z"/>
      <meta itemprop="endDate" content="${endUtc}Z"/>
      <h2 itemprop="name" class="mt-3">${title}</h2>
      <div class="o_wevent_event_main_dates_mobile d-lg-none mt-3">
        <time class="o_wevent_day_header_number lh-1" datetime="${startUtc}" data-oe-type="datetime" data-oe-expression="event.date_begin">${startUtc.slice(8, 10)}</time>
        <div class="small">
          <time class="fw-bold lh-1" datetime="${startUtc}" data-oe-type="datetime" data-oe-expression="event.date_begin">${startLabel}</time>
          <i class="fa fa-long-arrow-right mx-1 text-muted" role="img"></i>
          <time class="fw-bold lh-1" datetime="${endUtc}" data-oe-type="datetime" data-oe-expression="event.date_end">${endLabel}</time>
          <span class="d-block lh-1">Europe/Paris</span>
        </div>
      </div>
      <aside id="o_wevent_event_main_sidebar" class="col-lg-4 py-3 pb-lg-0 d-print-none">
        <div class="o_wevent_bordered_block pb-3 mb-4 d-none d-lg-block">
          <meta itemprop="startDate" content="${startUtc.replace(" ", "T")}"/>
          <meta itemprop="endDate" content="${endUtc.replace(" ", "T")}"/>
        </div>
        <div class="o_wevent_sidebar_block" itemprop="location" itemscope="itemscope" itemtype="https://schema.org/Place">
          <div itemprop="name" class="mb-1">Orléans Comedy Club</div>
        </div>
      </aside>
    </div>
  </body>
</html>`;
}

/** Extrait de la page d'agenda Odoo (/event) : seules des dates UTC sans fuseau. */
const ODOO_AGENDA_PAGE = `<!DOCTYPE html>
<html lang="fr-FR">
  <head><meta name="generator" content="Odoo"/></head>
  <body>
    <a class="text-decoration-none text-reset" href="/event/rosa-bursztein-dans-dedoublee-mercredi-21-10-2026-309/register">
      <article itemscope="itemscope" itemtype="http://schema.org/Event" class="h-100 card">
        <meta itemprop="startDate" content="2026-10-21T16:45:00"/>
        <span class="o_wevent_event_day oe_hide_on_date_edit" data-oe-type="datetime" data-oe-expression="event.date_begin">21</span>
        <span itemprop="name">Rosa Bursztein dans &#34;Dédoublée&#34; - Mercredi 21/10/2026</span>
      </article>
    </a>
    <a class="text-decoration-none text-reset" href="/event/alicia-cesttout-dans-insolences-mercredi-28-10-2026-372/register">
      <article itemscope="itemscope" itemtype="http://schema.org/Event" class="h-100 card">
        <meta itemprop="startDate" content="2026-10-28T17:45:00"/>
        <span class="o_wevent_event_day oe_hide_on_date_edit" data-oe-type="datetime" data-oe-expression="event.date_begin">28</span>
        <span itemprop="name">Alicia Cesttout dans &#34;Insolences&#34;- Mercredi 28/10/2026</span>
      </article>
    </a>
  </body>
</html>`;

/** Sélecteurs configurés pour l'Orléans Comedy Club (organizer_scraping_configs). */
const COMEDY_CLUB_SELECTORS = [
  { event_field: "date", css_selector: 'data-oe-expression="event.date_begin"', attribute: "datetime", transform_function: "date", text_prefix: null },
  { event_field: "end_date", css_selector: 'data-oe-expression="event.date_end"', attribute: "datetime", transform_function: "date", text_prefix: null },
];

/** Client Supabase factice : renvoie les lignes données pour chaque table, n'écrit rien. */
function fakeSupabase(tables) {
  return {
    from(table) {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        then: (resolve, reject) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve, reject),
      };
      return query;
    },
  };
}

async function scrapeOdooPage(url, html) {
  const result = await scrapeEventPage({
    url,
    location_id: "orleans-comedy-club",
    supabase: fakeSupabase({ organizer_scraping_configs: COMEDY_CLUB_SELECTORS }),
    prefetched: { html, finalUrl: url },
    disableAI: true,
  });
  assert.equal(result.ok, true);
  return result.data;
}

test("heure d'été (avant le 25/10) : 16:45 UTC sur la page = 18:45 à Paris", async () => {
  const data = await scrapeOdooPage(
    "https://www.orleanscomedyclub.fr/event/rosa-bursztein-dans-dedoublee-mercredi-21-10-2026-309/register",
    odooEventPage({
      title: "Rosa Bursztein dans &#34;Dédoublée&#34; - Mercredi 21/10/2026",
      startUtc: "2026-10-21 16:45:00",
      endUtc: "2026-10-21 18:00:00",
      startLabel: "18:45",
      endLabel: "20:00",
    }),
  );
  assert.equal(data.date, "2026-10-21T18:45:00");
  assert.equal(data.end_date, "2026-10-21T20:00:00");
  assert.equal(data.time_known, true);
});

test("heure d'hiver (après le 25/10) : 17:45 UTC sur la page = 18:45 à Paris", async () => {
  const data = await scrapeOdooPage(
    "https://www.orleanscomedyclub.fr/event/alicia-cesttout-dans-insolences-mercredi-28-10-2026-372/register",
    odooEventPage({
      title: "Alicia Cesttout dans &#34;Insolences&#34;- Mercredi 28/10/2026",
      startUtc: "2026-10-28 17:45:00",
      endUtc: "2026-10-28 19:00:00",
      startLabel: "18:45",
      endLabel: "20:00",
    }),
  );
  assert.equal(data.date, "2026-10-28T18:45:00");
  assert.equal(data.end_date, "2026-10-28T20:00:00");
});

test("agenda Odoo : les microdonnées sans fuseau sont lues en UTC", () => {
  const events = extractStructuredEvents(cheerio.load(ODOO_AGENDA_PAGE), "https://www.orleanscomedyclub.fr/event");
  assert.deepEqual(
    events.map((event) => event.date),
    ["2026-10-21T18:45:00", "2026-10-28T18:45:00"],
  );
});

test("autres sites : une date sans fuseau reste une heure murale", () => {
  const page = (startDate) =>
    cheerio.load(
      `<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: "Concert", startDate })}</script></head></html>`,
    );
  const dateOf = (startDate) => extractStructuredEvents(page(startDate), "https://www.billetweb.fr/concert")[0]?.date;
  assert.equal(dateOf("2026-10-21T20:30"), "2026-10-21T20:30:00");
  assert.equal(dateOf("2026-10-21T20:30:00+02:00"), "2026-10-21T20:30:00");
  assert.equal(dateOf("2026-10-28T19:30:00Z"), "2026-10-28T20:30:00");
});

test("toParisWallClock : option naiveUtc", () => {
  assert.equal(toParisWallClock("2026-10-21 16:45:00", undefined, { naiveUtc: true })?.value, "2026-10-21T18:45:00");
  assert.equal(toParisWallClock("2026-10-28T17:45:00", undefined, { naiveUtc: true })?.value, "2026-10-28T18:45:00");
  // Jour du changement d'heure (25/10 à 3 h) et passage de minuit.
  assert.equal(toParisWallClock("2026-10-25 17:45:00", undefined, { naiveUtc: true })?.value, "2026-10-25T18:45:00");
  assert.equal(toParisWallClock("2026-10-21 22:30:00", undefined, { naiveUtc: true })?.value, "2026-10-22T00:30:00");
  // Une date seule n'a pas de fuseau.
  assert.deepEqual(toParisWallClock("2026-10-21", undefined, { naiveUtc: true }), { value: "2026-10-21T00:00:00", timeKnown: false });
  assert.equal(toParisWallClock("2026-10-21 16:45:00")?.value, "2026-10-21T16:45:00");
});

/** Description d'une page Odoo, balisage d'origine (21/10/2026) : lignes coupées dans le source, liste imbriquée. */
const ODOO_DESCRIPTION = `<div class="mt-4" itemprop="description"><section class="s_text_block o_colored_level" data-name="Texte">
            <div><p><strong>Dans ce spectacle, Rosa poursuit son récit sur la quête
amoureuse et creuse ses contradictions. </strong></p><p>Elle retrace l’histoire de sa famille et se questionne sur
notre époque. </p></div><h5><font class="text-o-color-1">Informations pratiques</font></h5><ul><li>📍 <b>Lieu</b> : Orléans Comedy Club – Venelle Saint-Pierre Empont, Orléans</li><li><p>🚋 <b>Y accéder</b> :</p><ul><li>En tram : arrêtez-vous à <em>Cathédrale</em> ou <i>Jeanne d’Arc</i></li><li>En voiture : garez-vous au <i>Parking de la Cathédrale </i>au plus proche.</li></ul></li><li>🕕<strong> Durée 1h</strong></li><li>💸 <b>Tarif </b> : 20€</li></ul><p><strong>A partir de 16 ans</strong></p><p><strong>Soyez sur place au moins 15mn avant le début du spectacle.</strong></p>
        </section></div>`;

test("description Odoo : paragraphes et liste gardés, lignes du source recollées", async () => {
  const page = odooEventPage({
    title: "Rosa Bursztein dans &#34;Dédoublée&#34; - Mercredi 21/10/2026",
    startUtc: "2026-10-21 16:45:00",
    endUtc: "2026-10-21 18:00:00",
    startLabel: "18:45",
    endLabel: "20:00",
  }).replace('<aside id="o_wevent_event_main_sidebar"', `${ODOO_DESCRIPTION}\n      <aside id="o_wevent_event_main_sidebar"`);
  const data = await scrapeOdooPage(
    "https://www.orleanscomedyclub.fr/event/rosa-bursztein-dans-dedoublee-mercredi-21-10-2026-309/register",
    page,
  );
  assert.equal(
    data.description,
    [
      "Dans ce spectacle, Rosa poursuit son récit sur la quête amoureuse et creuse ses contradictions.",
      "",
      "Elle retrace l’histoire de sa famille et se questionne sur notre époque.",
      "",
      "Informations pratiques",
      "• 📍 Lieu : Orléans Comedy Club – Venelle Saint-Pierre Empont, Orléans",
      "• 🚋 Y accéder :",
      "• En tram : arrêtez-vous à Cathédrale ou Jeanne d’Arc",
      "• En voiture : garez-vous au Parking de la Cathédrale au plus proche.",
      "• 🕕 Durée 1h",
      "• 💸 Tarif : 20€",
      "",
      "A partir de 16 ans",
      "",
      "Soyez sur place au moins 15mn avant le début du spectacle.",
    ].join("\n"),
  );
});

/* ------------------------------------------------------------------ */
/* Dates avec fuseau, jusqu'au formulaire                              */
/* ------------------------------------------------------------------ */

/** Préremplissage du formulaire (ou de la création par l'agent) à partir de données importées. */
async function prefillOf(data) {
  const { prefill } = await buildEventFormPrefillFromImport({ data, categories: [], locations: [], organizers: [] });
  return prefill;
}

test("page réelle du 30/30 (29/10/2026, heure d'hiver) : 18:45 jusqu'au formulaire", async () => {
  const url = "https://www.orleanscomedyclub.fr/event/30-30-jeudi-29-10-2026-328/register";
  const html = fs.readFileSync(path.join(root, "lib/scraping/fixtures/orleanscomedyclub-30-30.html"), "utf8");
  // Avec les sélecteurs de la source, puis avec les seules microdonnées (« 2026-10-29 17:45:00Z »).
  for (const data of [
    await scrapeOdooPage(url, html),
    (await scrapeEventPage({ url, supabase: fakeSupabase({}), prefetched: { html, finalUrl: url }, disableAI: true })).data,
  ]) {
    assert.equal(data.date, "2026-10-29T18:45:00");
    assert.equal(data.end_date, "2026-10-29T20:00:00");
    const prefill = await prefillOf(data);
    assert.equal(prefill.form.date, "2026-10-29T18:45");
    assert.equal(prefill.form.end_date, "2026-10-29T20:00");
  }
});

test("date importée avec fuseau : convertie en heure de Paris, une date sans fuseau reste telle quelle", async () => {
  const prefill = await prefillOf({
    title: "30/30",
    // startDate de la page Odoo ; heure de Paris en UTC, écrite par l'ancien scraper des demandes.
    date: "2026-10-29 17:45:00Z",
    end_date: "2026-10-29T19:00:00.000Z",
    occurrences: [{ date: "2026-10-21T16:45:00+00:00" }, { date: "2026-10-30T18:45:00+01:00" }, { date: "2026-10-31T18:45:00" }],
  });
  assert.equal(prefill.form.date, "2026-10-29T18:45");
  assert.equal(prefill.form.end_date, "2026-10-29T20:00");
  assert.deepEqual(
    prefill.additionalDates.map((slot) => slot.date),
    ["2026-10-21T18:45", "2026-10-30T18:45", "2026-10-31T18:45"],
  );
  assert.equal(importedDateTime("2026-10-29"), "2026-10-29T00:00");
  assert.equal(importedDateTime(""), "");
});

test("Facebook : heure de Paris sans fuseau, gardée telle quelle à l'import", async () => {
  // 29/10/2026 à 18:45 à Paris (17:45 UTC).
  const date = toFloatingParisIsoString(Date.UTC(2026, 9, 29, 17, 45) / 1000);
  assert.equal(date, "2026-10-29T18:45:00");
  assert.equal((await prefillOf({ title: "Concert", date })).form.date, "2026-10-29T18:45");
});
