/*
 * Dates des pages Odoo (Orléans Comedy Club) : Odoo écrit ses dates en UTC sans fuseau
 * (`<time datetime="2026-10-21 16:45:00">18:45</time>`), seul le texte affiché est à l'heure de Paris.
 *   node --test lib/scraping/odoo-dates.test.mjs
 */
import assert from "node:assert/strict";
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
