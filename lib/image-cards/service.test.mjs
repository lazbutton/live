/*
 * Vignettes des affiches (lib/image-cards/service.ts) et leurs routes (webhook de la base, cron),
 * exécutées contre un faux Supabase et un faux hébergeur d'images (fake-supabase.mjs), sans réseau.
 *   node --test lib/image-cards/service.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { after, beforeEach, mock, test } from "node:test";
import { fileURLToPath } from "node:url";

import { SUPABASE_URL, createFakeSupabase } from "./fake-supabase.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const sharp = require("sharp");
const { createClient } = require("@supabase/supabase-js");
const { NextRequest } = require("next/server");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });

const service = await jiti.import(path.join(root, "lib/image-cards/service.ts"));
const webhook = await jiti.import(path.join(root, "app/api/events/[id]/image-card/route.ts"));
const cron = await jiti.import(path.join(root, "app/api/cron/image-cards/route.ts"));

for (const method of ["log", "info", "warn", "error"]) mock.method(console, method, () => {});
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});
beforeEach(() => {
  delete process.env.IMAGE_CARD_WEBHOOK_SECRET;
  delete process.env.CRON_SECRET;
});

const POSTER = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#1b1464" } })
  .jpeg()
  .toBuffer();
const image = (body = POSTER, type = "image/jpeg") => () =>
  new Response(body, { status: 200, headers: { "content-type": type } });
const status = (code) => () => new Response("non", { status: code });
const redirect = (location) => () => new Response(null, { status: 302, headers: { location } });

const IMG = "https://images.test";
const ids = {
  a: "00000000-0000-4000-8000-00000000000a",
  b: "00000000-0000-4000-8000-00000000000b",
  c: "00000000-0000-4000-8000-00000000000c",
  d: "00000000-0000-4000-8000-00000000000d",
  e: "00000000-0000-4000-8000-00000000000e",
  f: "00000000-0000-4000-8000-00000000000f",
};
const event = (id, imageUrl, extra = {}) => ({
  id,
  date: "2026-11-01T19:00:00+00:00",
  image_url: imageUrl,
  image_card_url: null,
  image_width: null,
  image_height: null,
  image_color: null,
  image_card_error: null,
  ...extra,
});

function setup(options) {
  const backend = createFakeSupabase(options);
  globalThis.fetch = backend.fetch;
  const supabase = createClient(SUPABASE_URL, "service-key", { auth: { persistSession: false } });
  const row = (id) => backend.db.events.find((candidate) => candidate.id === id);
  const downloads = () => backend.calls.filter((call) => call.startsWith(`GET ${IMG}`)).length;
  return { backend, supabase, row, downloads };
}

test("affiche dans Storage : vignette déposée, colonnes remplies, puis rien à refaire", async () => {
  const { backend, supabase, row, downloads } = setup({
    events: [event(ids.a, `${IMG}/affiche.jpg`)],
    hosts: { [`${IMG}/affiche.jpg`]: image() },
  });

  const result = await service.refreshImageCard(supabase, ids.a);
  assert.equal(result.status, "created");

  const path = service.imageCardPath(`${IMG}/affiche.jpg`);
  assert.match(path, /^cards\/v2\/[0-9a-f]{32}\.webp$/);
  const stored = backend.storage.get(`event-images/${path}`);
  assert.ok(stored, "vignette déposée");
  assert.equal(stored.contentType, "image/webp");
  assert.equal(stored.cacheControl, "max-age=31536000");
  assert.equal(stored.upsert, "true");
  // 1080 px de large, sous les 1 200 de la vignette : gardée à sa taille.
  const output = await sharp(stored.body).metadata();
  assert.deepEqual([output.format, output.width, output.height], ["webp", 1080, 1350]);

  assert.deepEqual(
    {
      image_card_url: row(ids.a).image_card_url,
      image_width: row(ids.a).image_width,
      image_height: row(ids.a).image_height,
      image_card_error: row(ids.a).image_card_error,
    },
    {
      image_card_url: `${SUPABASE_URL}/storage/v1/object/public/event-images/${path}`,
      image_width: 1080,
      image_height: 1350,
      image_card_error: null,
    },
  );
  assert.match(row(ids.a).image_color, /^#[0-9a-f]{6}$/);

  assert.equal((await service.refreshImageCard(supabase, ids.a)).status, "up_to_date");
  assert.equal(downloads(), 1);
});

test("même affiche sur un autre événement (séance, doublon) : vignette reprise sans téléchargement", async () => {
  const card = {
    image_card_url: `${SUPABASE_URL}/storage/v1/object/public/event-images/cards/v2/x.webp`,
    image_width: 1080,
    image_height: 1350,
    image_color: "#1b1464",
  };
  const { backend, supabase, row, downloads } = setup({
    events: [event(ids.a, `${IMG}/affiche.jpg`, card), event(ids.b, `${IMG}/affiche.jpg`)],
  });

  const result = await service.refreshImageCard(supabase, ids.b);
  assert.equal(result.status, "reused");
  assert.equal(downloads(), 0);
  assert.equal(backend.storage.size, 0);
  assert.deepEqual(
    [row(ids.b).image_card_url, row(ids.b).image_width, row(ids.b).image_height, row(ids.b).image_color],
    Object.values(card),
  );
});

test("échec définitif noté dans image_card_error ; échec passager : rien de noté", async () => {
  const { supabase, row } = setup({
    events: [event(ids.a, `${IMG}/absente.jpg`), event(ids.b, `${IMG}/serveur-en-panne.jpg`), event(ids.c, `${IMG}/page.html`)],
    hosts: {
      [`${IMG}/absente.jpg`]: status(404),
      [`${IMG}/serveur-en-panne.jpg`]: status(503),
      [`${IMG}/page.html`]: image(Buffer.from("<!doctype html><p>Billetterie</p>"), "text/html"),
    },
  });

  assert.deepEqual(await service.refreshImageCard(supabase, ids.a), {
    eventId: ids.a,
    status: "failed",
    error: "Image inaccessible (HTTP 404)",
    retry: false,
  });
  assert.equal(row(ids.a).image_card_error, "Image inaccessible (HTTP 404)");

  const transient = await service.refreshImageCard(supabase, ids.b);
  assert.equal(transient.status, "failed");
  assert.equal(transient.retry, true);
  assert.equal(row(ids.b).image_card_error, null);

  const notAnImage = await service.refreshImageCard(supabase, ids.c);
  assert.equal(notAnImage.retry, false);
  assert.match(row(ids.c).image_card_error, /^Image illisible/);
  assert.equal(row(ids.c).image_card_url, null);
});

test("affiche changée pendant le traitement : la vignette de l'ancienne n'est pas écrite", async () => {
  const { supabase, row } = setup({
    events: [event(ids.a, `${IMG}/ancienne.jpg`)],
    hosts: {
      [`${IMG}/ancienne.jpg`]: (request, db) => {
        // Enregistrement concurrent : la base a remis les colonnes à null, un nouveau webhook suit.
        db.events[0].image_url = `${IMG}/nouvelle.jpg`;
        return image()();
      },
    },
  });

  assert.deepEqual(await service.refreshImageCard(supabase, ids.a), { eventId: ids.a, status: "stale" });
  assert.equal(row(ids.a).image_card_url, null);
});

test("redirections : suivies vers un hôte public, refusées vers une adresse locale", async () => {
  const { supabase, row } = setup({
    events: [event(ids.a, `${IMG}/court`), event(ids.b, `${IMG}/vers-local`), event(ids.c, "http://localhost:3000/a.jpg")],
    hosts: {
      [`${IMG}/court`]: redirect("/affiche.jpg"),
      [`${IMG}/affiche.jpg`]: image(),
      [`${IMG}/vers-local`]: redirect("http://169.254.169.254/latest/meta-data"),
    },
  });

  assert.equal((await service.refreshImageCard(supabase, ids.a)).status, "created");
  for (const id of [ids.b, ids.c]) {
    const result = await service.refreshImageCard(supabase, id);
    assert.equal(result.status, "failed");
    assert.equal(result.error, "Adresse d'image refusée (hôte local ou adresse IP)");
    assert.equal(row(id).image_card_error, result.error);
  }
});

test("événement introuvable ou sans affiche", async () => {
  const { supabase } = setup({ events: [event(ids.a, null), event(ids.b, "  ")] });
  assert.equal((await service.refreshImageCard(supabase, ids.c)).status, "not_found");
  assert.equal((await service.refreshImageCard(supabase, ids.a)).status, "no_image");
  assert.equal((await service.refreshImageCard(supabase, ids.b)).status, "no_image");
});

test("rattrapage : une vignette par affiche, échecs notés écartés ensuite, compte de ce qui reste", async () => {
  const { backend, supabase, row, downloads } = setup({
    events: [
      event(ids.a, `${IMG}/festival.jpg`, { date: "2026-11-01T19:00:00+00:00" }),
      event(ids.b, `${IMG}/festival.jpg`, { date: "2026-11-02T19:00:00+00:00" }),
      event(ids.c, `${IMG}/absente.jpg`),
      event(ids.d, `${IMG}/deja-en-echec.jpg`, { image_card_error: "Image inaccessible (HTTP 404)" }),
      event(ids.e, null),
      event(ids.f, `${IMG}/serveur-en-panne.jpg`),
    ],
    hosts: {
      [`${IMG}/festival.jpg`]: image(),
      [`${IMG}/absente.jpg`]: status(404),
      [`${IMG}/serveur-en-panne.jpg`]: status(503),
    },
  });

  const first = await service.fillMissingImageCards(supabase);
  assert.deepEqual(
    {
      ...first,
      averageBytes: first.averageBytes > 0,
      maxBytes: first.maxBytes > 0,
      // Trois affiches traitées en parallèle : ordre d'arrivée variable.
      errors: [...first.errors].sort((left, right) => left.eventId.localeCompare(right.eventId)),
    },
    {
      events: 4,
      images: 3,
      created: 2,
      reused: 0,
      failed: 1,
      retryLater: 1,
      stale: 0,
      notProcessed: 0,
      cards: 1,
      averageBytes: true,
      maxBytes: true,
      errors: [
        { eventId: ids.c, imageUrl: `${IMG}/absente.jpg`, error: "Image inaccessible (HTTP 404)" },
        { eventId: ids.f, imageUrl: `${IMG}/serveur-en-panne.jpg`, error: "Image inaccessible (HTTP 503)" },
      ],
      remaining: 1,
    },
  );
  assert.equal(row(ids.a).image_card_url, row(ids.b).image_card_url);
  assert.equal(backend.storage.size, 1);
  assert.equal(downloads(), 3);

  // Le passage suivant ne reprend que l'échec passager.
  const second = await service.fillMissingImageCards(supabase);
  assert.deepEqual([second.events, second.retryLater, second.remaining], [1, 1, 1]);

  // --retry-errors reprend aussi les échecs notés.
  const pending = await service.listMissingImageCards(supabase, { retryErrors: true });
  assert.deepEqual(pending.map((p) => p.id).sort(), [ids.c, ids.d, ids.f]);
  assert.equal(await service.countMissingImageCards(supabase, { retryErrors: true }), 3);
});

// Vignettes d'un ancien rendu (CARD_VERSION 1 : fichiers à la racine de cards/).
const oldCard = (name) => ({
  image_card_url: `${SUPABASE_URL}/storage/v1/object/public/event-images/cards/${name}.webp`,
  image_width: 1080,
  image_height: 1350,
  image_color: "#1b1464",
});

test("vignette d'un ancien rendu : ni reprise pour une autre séance, ni « à jour » pour le webhook", async () => {
  const { backend, supabase, row, downloads } = setup({
    events: [event(ids.a, `${IMG}/affiche.jpg`, oldCard("ancienne")), event(ids.b, `${IMG}/affiche.jpg`)],
    hosts: { [`${IMG}/affiche.jpg`]: image() },
  });

  assert.equal(service.isCurrentImageCard(row(ids.a).image_card_url), false);
  // Nouvelle séance de la même affiche : vignette refaite au rendu actuel, pas l'ancienne reprise.
  assert.equal((await service.refreshImageCard(supabase, ids.b)).status, "created");
  assert.equal(downloads(), 1);
  const current = `${SUPABASE_URL}/storage/v1/object/public/event-images/${service.imageCardPath(`${IMG}/affiche.jpg`)}`;
  assert.equal(row(ids.b).image_card_url, current);
  assert.ok(service.isCurrentImageCard(current));

  // Webhook sur l'événement à l'ancienne vignette : la nouvelle, déjà faite, est reprise.
  assert.equal((await service.refreshImageCard(supabase, ids.a)).status, "reused");
  assert.equal(row(ids.a).image_card_url, current);
  assert.equal(downloads(), 1);
  assert.equal(backend.storage.size, 1);
});

test("ancien rendu : laissé au rattrapage (pas au cron), refait ; un échec garde l'ancienne", async () => {
  const { supabase, row, downloads } = setup({
    events: [
      event(ids.a, `${IMG}/sans-vignette.jpg`, { date: "2026-11-05T19:00:00+00:00" }),
      event(ids.b, `${IMG}/ancienne.jpg`, { ...oldCard("b"), date: "2026-11-04T19:00:00+00:00" }),
      event(ids.c, `${IMG}/disparue.jpg`, { ...oldCard("c"), date: "2026-11-03T19:00:00+00:00" }),
      event(ids.d, `${IMG}/a-jour.jpg`, {
        image_card_url: `${SUPABASE_URL}/storage/v1/object/public/event-images/${service.imageCardPath(`${IMG}/a-jour.jpg`)}`,
        image_width: 1080,
        image_height: 1350,
        image_color: "#1b1464",
      }),
      event(ids.e, `${IMG}/autre-ancienne.jpg`, { ...oldCard("e"), image_card_error: "Image inaccessible (HTTP 404)" }),
    ],
    hosts: {
      [`${IMG}/sans-vignette.jpg`]: image(),
      [`${IMG}/ancienne.jpg`]: image(),
      [`${IMG}/disparue.jpg`]: status(404),
    },
  });

  assert.deepEqual(
    (await service.listMissingImageCards(supabase, { need: "outdated" })).map((pending) => pending.id),
    [ids.b, ids.c],
  );
  assert.equal(await service.countMissingImageCards(supabase, { need: "outdated" }), 2);
  assert.equal(await service.countMissingImageCards(supabase, { need: "outdated", retryErrors: true }), 3);

  // Le cron ne fait que la manquante : refaire les autres réécrit tous les événements.
  const cron = await service.fillMissingImageCards(supabase);
  assert.deepEqual([cron.events, cron.created, cron.remaining], [1, 1, 0]);
  assert.ok(service.isCurrentImageCard(row(ids.a).image_card_url));
  assert.equal(row(ids.b).image_card_url, oldCard("b").image_card_url);

  // Le rattrapage (scripts/backfill-image-cards.mjs) les refait.
  const outdated = await service.listMissingImageCards(supabase, { need: "outdated" });
  const { report } = await service.applyImageCards(supabase, outdated);
  assert.deepEqual([report.events, report.created, report.failed], [2, 1, 1]);
  assert.equal(await service.countMissingImageCards(supabase, { need: "outdated" }), 0);
  assert.ok(service.isCurrentImageCard(row(ids.b).image_card_url));
  assert.deepEqual([row(ids.b).image_width, row(ids.b).image_height], [1080, 1350]);
  // L'affiche a disparu : l'ancienne vignette reste affichée, l'échec est noté (plus retenté).
  assert.equal(row(ids.c).image_card_url, oldCard("c").image_card_url);
  assert.equal(row(ids.c).image_card_error, "Image inaccessible (HTTP 404)");
  assert.equal(downloads(), 3);
});

test("rattrapage : plus rien n'est commencé après l'échéance", async () => {
  const { supabase, downloads } = setup({ events: [event(ids.a, `${IMG}/affiche.jpg`)] });
  const result = await service.fillMissingImageCards(supabase, { deadline: Date.now() - 1 });
  assert.deepEqual([result.events, result.notProcessed, result.remaining], [0, 1, 1]);
  assert.equal(downloads(), 0);
});

test("dépôt Storage en échec : échec passager, rien de noté", async () => {
  const { supabase, row } = setup({
    events: [event(ids.a, `${IMG}/affiche.jpg`)],
    hosts: { [`${IMG}/affiche.jpg`]: image() },
    storageError: "Bucket not found",
  });
  const result = await service.refreshImageCard(supabase, ids.a);
  assert.deepEqual([result.status, result.retry], ["failed", true]);
  assert.equal(row(ids.a).image_card_error, null);
});

const webhookRequest = (id, secret) =>
  webhook.POST(
    new NextRequest(`https://www.outlive.fr/api/events/${id}/image-card`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify({ event_id: id }),
    }),
    { params: Promise.resolve({ id }) },
  );

test("webhook : secret requis, puis vignette faite ; statuts lus par pg_net", async () => {
  const { row } = setup({
    events: [event(ids.a, `${IMG}/affiche.jpg`), event(ids.b, `${IMG}/serveur-en-panne.jpg`)],
    hosts: { [`${IMG}/affiche.jpg`]: image(), [`${IMG}/serveur-en-panne.jpg`]: status(503) },
  });

  assert.equal((await webhookRequest(ids.a, "secret-de-test")).status, 503, "secret non configuré");
  process.env.IMAGE_CARD_WEBHOOK_SECRET = "secret-de-test";
  assert.equal((await webhookRequest(ids.a)).status, 401);
  assert.equal((await webhookRequest(ids.a, "secret-de-tesT")).status, 401);
  assert.equal((await webhookRequest("pas-un-uuid", "secret-de-test")).status, 400);
  assert.equal((await webhookRequest(ids.c, "secret-de-test")).status, 404);

  const done = await webhookRequest(ids.a, "secret-de-test");
  assert.equal(done.status, 200);
  assert.equal((await done.json()).status, "created");
  assert.ok(row(ids.a).image_card_url);

  const transient = await webhookRequest(ids.b, "secret-de-test");
  assert.equal(transient.status, 503);
  assert.equal((await transient.json()).retry, true);
});

test("cron : CRON_SECRET requis, puis rattrapage", async () => {
  const { row } = setup({ events: [event(ids.a, `${IMG}/affiche.jpg`)], hosts: { [`${IMG}/affiche.jpg`]: image() } });
  const call = (secret) =>
    cron.GET(
      new NextRequest("https://www.outlive.fr/api/cron/image-cards", {
        headers: secret ? { authorization: `Bearer ${secret}` } : {},
      }),
    );

  assert.equal((await call("cron")).status, 401, "CRON_SECRET non configuré");
  process.env.CRON_SECRET = "cron";
  assert.equal((await call()).status, 401);

  const response = await call("cron");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual([body.ok, body.result.created, body.result.remaining], [true, 1, 0]);
  assert.ok(row(ids.a).image_card_url);
});
