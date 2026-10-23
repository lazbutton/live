/*
 * Radio : les visuels gardés des émissions (lib/radio/show-images.ts). Le carré (au centre, sur le noir,
 * ou choisi), jamais agrandi ; le choix par défaut d'un envoi (détouré : sur le noir) ; le dépôt dans
 * organizers-images/radio-shows/ et le retrait, avec un faux client.
 *   node --test lib/radio/show-images.test.mjs
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
const images = await jiti.import(path.join(root, "lib/radio/show-images.ts"));
const sharp = require("sharp");

/** Une image unie de [width] × [height]. */
const plain = (width, height, color = "#c03030") =>
  sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer();

/** Un logo détouré : une barre blanche au milieu d'un fond transparent. */
const cutOutLogo = async () => {
  const bar = await sharp({ create: { width: 200, height: 40, channels: 4, background: "#ffffff" } }).png().toBuffer();
  return sharp({ create: { width: 300, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: bar, gravity: "centre" }])
    .png()
    .toBuffer();
};

const pixel = async (buffer, x, y) => {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const index = (y * info.width + x) * info.channels;
  return [data[index], data[index + 1], data[index + 2]];
};

test("au centre : un bandeau devient le carré de son petit côté, en WebP", async () => {
  const square = await images.squareShowImage(await plain(400, 200), { kind: "cover" });
  const meta = await sharp(square).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ["webp", 200, 200]);
});

test("jamais agrandi, 1 200 px au plus", async () => {
  const small = await sharp(await images.squareShowImage(await plain(120, 120), { kind: "cover" })).metadata();
  assert.deepEqual([small.width, small.height], [120, 120]);
  const big = await sharp(await images.squareShowImage(await plain(3000, 2000), { kind: "cover" })).metadata();
  assert.deepEqual([big.width, big.height], [1200, 1200]);
});

test("sur le noir : un logo détouré, entier, au milieu d'un carré noir", async () => {
  const square = await images.squareShowImage(await cutOutLogo(), { kind: "contain", padding: 0.08 });
  const meta = await sharp(square).metadata();
  assert.deepEqual([meta.width, meta.height], [300, 300]);
  const [r, g, b] = await pixel(square, 5, 5);
  assert.ok(r < 10 && g < 10 && b < 10, `coin noir, obtenu ${[r, g, b]}`);
  const [cr, cg, cb] = await pixel(square, 150, 150);
  assert.ok(cr > 240 && cg > 240 && cb > 240, `centre blanc, obtenu ${[cr, cg, cb]}`);
});

test("un carré choisi : en fractions de l'image", async () => {
  const square = await images.squareShowImage(await plain(400, 300), { kind: "crop", left: 0, top: 0.25, size: 0.75 });
  const meta = await sharp(square).metadata();
  assert.deepEqual([meta.width, meta.height], [225, 225]);
});

test("par défaut : détouré → sur le noir ; opaque → au centre", async () => {
  assert.deepEqual(await images.defaultShowImageFit(await cutOutLogo()), { kind: "contain", padding: 0.08 });
  assert.deepEqual(await images.defaultShowImageFit(await plain(300, 200)), { kind: "cover" });
});

/** Un faux client : ce qui est déposé, écrit et retiré. */
const fakeClient = ({ references = 0 } = {}) => {
  const calls = { uploads: [], updates: [], removed: [] };
  const client = {
    calls,
    storage: {
      from: (bucket) => ({
        upload: async (objectPath, body, options) => {
          calls.uploads.push({ bucket, objectPath, size: body.length, options });
          return { error: null };
        },
        getPublicUrl: (objectPath) => ({ data: { publicUrl: `https://stockage.test/storage/v1/object/public/${bucket}/${objectPath}` } }),
        remove: async (paths) => {
          calls.removed.push({ bucket, paths });
          return { error: null };
        },
      }),
    },
    from: (table) => ({
      update: (values) => ({
        eq: async (column, value) => {
          calls.updates.push({ table, values, column, value });
          return { error: null };
        },
      }),
      select: () => ({ eq: async () => ({ count: references, error: null }) }),
    }),
  };
  return client;
};

test("dépôt : radio-shows/<slug>-<empreinte>.webp, l'adresse dans image_url, l'ancien fichier retiré", async () => {
  const client = fakeClient();
  const previous = "https://stockage.test/storage/v1/object/public/organizers-images/radio-shows/nation-groove-ancien.webp";
  const square = await images.squareShowImage(await plain(300, 300), { kind: "cover" });
  const url = await images.setShowImage(client, { id: "s1", slug: "nation-groove", image_url: previous }, square);
  assert.match(url, /\/organizers-images\/radio-shows\/nation-groove-[0-9a-f]{12}\.webp$/);
  assert.equal(client.calls.uploads[0].options.contentType, "image/webp");
  assert.deepEqual(client.calls.updates, [{ table: "radio_shows", values: { image_url: url }, column: "id", value: "s1" }]);
  assert.deepEqual(client.calls.removed, [{ bucket: "organizers-images", paths: ["radio-shows/nation-groove-ancien.webp"] }]);
});

test("retrait : image_url à null ; un fichier encore référencé reste", async () => {
  const client = fakeClient({ references: 1 });
  const url = "https://stockage.test/storage/v1/object/public/organizers-images/radio-shows/ride-on-abc.webp";
  await images.clearShowImage(client, { id: "s2", image_url: url });
  assert.deepEqual(client.calls.updates, [{ table: "radio_shows", values: { image_url: null }, column: "id", value: "s2" }]);
  assert.deepEqual(client.calls.removed, []);
});
