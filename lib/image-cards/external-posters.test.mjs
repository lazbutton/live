/*
 * Affiches hors de Storage recopiées dans le bucket des affiches (lib/image-cards/external-posters.ts)
 * et copie des images de la collecte (lib/agent/images.ts), contre le faux Supabase et le faux
 * hébergeur d'images de fake-supabase.mjs, sans réseau.
 *   node --test lib/image-cards/external-posters.test.mjs
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

const posters = await jiti.import(path.join(root, "lib/image-cards/external-posters.ts"));
const images = await jiti.import(path.join(root, "lib/agent/images.ts"));
const cron = await jiti.import(path.join(root, "app/api/cron/image-cards/route.ts"));

for (const method of ["log", "info", "warn", "error"]) mock.method(console, method, () => {});
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});
beforeEach(() => {
  delete process.env.CRON_SECRET;
});

const POSTER = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#1b1464" } })
  .jpeg()
  .toBuffer();
const image = (body = POSTER, type = "image/jpeg") => () =>
  new Response(body, { status: 200, headers: { "content-type": type } });
const status = (code) => () => new Response("non", { status: code });

const IMG = "https://images.test";
const STORED = `${SUPABASE_URL}/storage/v1/object/public/event-images`;
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
  archived: false,
  image_url: imageUrl,
  image_card_url: null,
  image_card_error: null,
  ...extra,
});

function setup(options) {
  const backend = createFakeSupabase(options);
  globalThis.fetch = backend.fetch;
  const supabase = createClient(SUPABASE_URL, "service-key", { auth: { persistSession: false } });
  const row = (id) => backend.db.events.find((candidate) => candidate.id === id);
  /** Fichier de Storage derrière une adresse publique. */
  const stored = (url) => backend.storage.get(url.replace(`${SUPABASE_URL}/storage/v1/object/public/`, ""));
  return { backend, supabase, row, stored };
}

test("affiches distantes listées une fois chacune ; Storage, archivées et échecs notés écartés", async () => {
  const { supabase } = setup({
    events: [
      event(ids.a, `${IMG}/concert.png`, { date: "2026-11-02T19:00:00+00:00" }),
      event(ids.b, `${IMG}/concert.png`, { date: "2026-11-03T19:00:00+00:00" }),
      event(ids.c, `${STORED}/1792491808045-jz7gr4479m.jpg`),
      event(ids.d, `${IMG}/archivee.jpg`, { archived: true }),
      event(ids.e, `${IMG}/absente.jpg`, { image_card_error: "Image inaccessible (HTTP 404)" }),
      event(ids.f, `${IMG}/expo.jpg`, { date: "2026-12-01T10:00:00+00:00" }),
    ],
  });

  assert.deepEqual(await posters.listExternalPosters(supabase), [
    { imageUrl: `${IMG}/expo.jpg`, eventIds: [ids.f] },
    { imageUrl: `${IMG}/concert.png`, eventIds: [ids.b, ids.a] },
  ]);
  assert.deepEqual(await posters.listExternalPosters(supabase, { limit: 1 }), [
    { imageUrl: `${IMG}/expo.jpg`, eventIds: [ids.f] },
  ]);
});

test("copie : un fichier par affiche, posé sur toutes ses séances ; type lu dans le fichier", async () => {
  // Les affiches de Weezevent (S3) arrivent en application/octet-stream.
  const weezevent = "https://wzeweb.test/affiche_1951461.jpg";
  const { backend, supabase, row, stored } = setup({
    events: [
      event(ids.a, `${IMG}/concert.png`),
      event(ids.b, `${IMG}/concert.png`, { date: "2026-11-02T19:00:00+00:00" }),
      event(ids.c, weezevent),
    ],
    hosts: {
      [`${IMG}/concert.png`]: image(await sharp(POSTER).png().toBuffer(), "image/png"),
      [weezevent]: image(POSTER, "application/octet-stream"),
    },
  });

  const report = await posters.copyExternalPosters(supabase);
  assert.deepEqual(
    { ...report, results: report.results.map(({ status: s, updated }) => ({ status: s, updated })) },
    {
      posters: 2,
      events: 3,
      copied: 2,
      failed: 0,
      notProcessed: 0,
      results: [
        { status: "copied", updated: 2 },
        { status: "copied", updated: 1 },
      ],
    },
  );
  assert.equal(backend.storage.size, 2);
  assert.equal(row(ids.a).image_url, row(ids.b).image_url);
  assert.match(row(ids.a).image_url, new RegExp(`^${STORED}/\\d+-[a-z0-9]+\\.png$`));
  assert.equal(stored(row(ids.a).image_url).contentType, "image/png");
  assert.match(row(ids.c).image_url, new RegExp(`^${STORED}/\\d+-[a-z0-9]+\\.jpg$`));
  assert.equal(stored(row(ids.c).image_url).contentType, "image/jpeg");
  assert.deepEqual(await posters.listExternalPosters(supabase), []);
});

test("échec de copie : affiche gardée, erreur dans le rapport, reprise au passage suivant", async () => {
  const { backend, supabase, row } = setup({
    events: [event(ids.a, `${IMG}/absente.jpg`), event(ids.b, `${IMG}/page.html`)],
    hosts: {
      [`${IMG}/absente.jpg`]: status(404),
      [`${IMG}/page.html`]: image(Buffer.from("<!doctype html><p>Billetterie</p>"), "text/html"),
    },
  });

  const report = await posters.copyExternalPosters(supabase);
  assert.deepEqual(
    report.results.map(({ imageUrl, status: s, error }) => ({ imageUrl, status: s, error })),
    [
      { imageUrl: `${IMG}/absente.jpg`, status: "failed", error: "Image inaccessible (HTTP 404)" },
      { imageUrl: `${IMG}/page.html`, status: "failed", error: "Ce lien n'est pas une image lisible" },
    ],
  );
  assert.equal(backend.storage.size, 0);
  assert.equal(row(ids.a).image_url, `${IMG}/absente.jpg`);
  assert.equal((await posters.listExternalPosters(supabase)).length, 2);
});

test("copie : plus rien n'est commencé après l'échéance", async () => {
  const { backend, supabase } = setup({ events: [event(ids.a, `${IMG}/affiche.jpg`)] });
  const report = await posters.copyExternalPosters(supabase, { deadline: Date.now() - 1 });
  assert.deepEqual([report.posters, report.copied, report.notProcessed], [1, 0, 1]);
  assert.equal(backend.calls.filter((call) => call.startsWith(`GET ${IMG}`)).length, 0);
});

test("cron : vignettes, puis affiches distantes recopiées", async () => {
  const { row } = setup({
    events: [event(ids.a, `${IMG}/affiche.jpg`)],
    hosts: { [`${IMG}/affiche.jpg`]: image() },
  });
  process.env.CRON_SECRET = "cron";
  const response = await cron.GET(
    new NextRequest("https://www.outlive.fr/api/cron/image-cards", { headers: { authorization: "Bearer cron" } }),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual([body.result.created, body.externalPosters.copied], [1, 1]);
  assert.match(row(ids.a).image_url, new RegExp(`^${STORED}/`));
});

test("préparation : JPEG pour les formats que l'app n'affiche pas et au-delà de 2 Mo ; SVG refusé", async () => {
  const avif = await images.prepareImage(await sharp(POSTER).avif().toBuffer());
  assert.equal(avif.contentType, "image/jpeg");
  assert.equal((await sharp(avif.buffer).metadata()).format, "jpeg");

  const webp = await sharp(POSTER).webp().toBuffer();
  assert.deepEqual(await images.prepareImage(webp), { buffer: webp, contentType: "image/webp" });

  // Bruit : un PNG qui ne se compresse pas, entre 2 et 15 Mo.
  const noisy = await sharp({
    create: { width: 1400, height: 1400, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 40 } },
  })
    .png()
    .toBuffer();
  assert.ok(noisy.byteLength > 2 * 1024 * 1024);
  const reduced = await images.prepareImage(noisy);
  assert.equal(reduced.contentType, "image/jpeg");
  assert.ok(reduced.buffer.byteLength <= 2 * 1024 * 1024);

  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
  await assert.rejects(images.prepareImage(svg), /SVG non prise en charge/);
});

test("collecte : copie à l'import, CDN à liens expirants oubliés en cas d'échec, simulation sans copie", async () => {
  const instagram = "https://scontent-cdg4-1.cdninstagram.com/v/affiche.jpg";
  const { backend, supabase } = setup({
    hosts: {
      [`${IMG}/affiche`]: image(POSTER, "binary/octet-stream"),
      [`${IMG}/absente.jpg`]: status(404),
      [instagram]: status(403),
    },
  });
  const ctx = { supabase, dryRun: false };
  const target = { bucket: "event-images" };

  const copied = await images.copyImageToStorage(ctx, `${IMG}/affiche`, target);
  assert.equal(copied.copied, true);
  assert.match(copied.url, new RegExp(`^${STORED}/\\d+-[a-z0-9]+\\.jpg$`));

  assert.deepEqual(await images.copyImageToStorage(ctx, `${IMG}/absente.jpg`, target), {
    url: `${IMG}/absente.jpg`,
    copied: false,
    error: "Image inaccessible (HTTP 404)",
  });
  assert.deepEqual(await images.copyImageToStorage(ctx, instagram, target), {
    url: "",
    copied: false,
    error: "Image inaccessible (HTTP 403)",
  });
  assert.deepEqual(await images.copyImageToStorage(ctx, copied.url, target), { url: copied.url, copied: false });
  assert.deepEqual(await images.copyImageToStorage({ supabase, dryRun: true }, `${IMG}/affiche`, target), {
    url: `${IMG}/affiche`,
    copied: false,
  });
  assert.deepEqual(await images.copyImageToStorage(ctx, "http://localhost:3000/a.jpg", target), {
    url: "http://localhost:3000/a.jpg",
    copied: false,
    error: "Adresse d'image refusée (hôte local ou adresse IP)",
  });
  assert.equal(backend.storage.size, 1);
});
