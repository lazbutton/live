/*
 * Rendu des vignettes (lib/image-cards/render.ts) sur des images fabriquées par sharp : taille,
 * format, poids, ratio, orientation EXIF, couleur dominante, images refusées.
 *   node --test lib/image-cards/render.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const sharp = require("sharp");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const { CARD_MAX_BYTES, ImageCardError, renderImageCard } = await jiti.import(path.join(root, "lib/image-cards/render.ts"));

/** Bruit pseudo-aléatoire reproductible, adouci par `blur` : une « photo » difficile à compresser. */
function noisyImage(width, height, blur) {
  const raw = Buffer.alloc(width * height * 3);
  let seed = 42;
  for (let index = 0; index < raw.length; index += 1) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    raw[index] = seed >>> 24;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).blur(blur);
}

const solid = (width, height, background, channels = 3) => sharp({ create: { width, height, channels, background } });

async function rejection(input) {
  await assert.rejects(renderImageCard(input), (error) => {
    assert.ok(error instanceof ImageCardError, String(error));
    assert.equal(error.retry, false);
    return true;
  });
}

test("affiche portrait 1080×1350 : WebP 800×1000 sous 70 Ko, dimensions de l'original", async () => {
  const input = await noisyImage(1080, 1350, 3).jpeg({ quality: 85 }).toBuffer();
  const card = await renderImageCard(input);

  assert.deepEqual([card.width, card.height], [1080, 1350]);
  assert.deepEqual([card.card.width, card.card.height], [800, 1000]);
  assert.ok(card.webp.byteLength <= CARD_MAX_BYTES, `${card.webp.byteLength} octets`);
  const output = await sharp(card.webp).metadata();
  assert.deepEqual([output.format, output.width, output.height], ["webp", 800, 1000]);
  assert.match(card.color, /^#[0-9a-f]{6}$/);
});

test("image chargée : la qualité baisse jusqu'à tenir sous 70 Ko", async () => {
  const input = await noisyImage(1080, 1350, 2.2).jpeg({ quality: 90 }).toBuffer();
  const card = await renderImageCard(input);
  assert.ok(card.card.quality < 80, `qualité ${card.card.quality}`);
  assert.ok(card.webp.byteLength <= CARD_MAX_BYTES, `${card.webp.byteLength} octets`);
});

test("orientation EXIF : dimensions et vignette dans le sens d'affichage", async () => {
  // Photo stockée en paysage, à tourner de 90° (orientation 6) : portrait à l'écran.
  const input = await noisyImage(1350, 1080, 3).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const card = await renderImageCard(input);
  assert.deepEqual([card.width, card.height], [1080, 1350]);
  assert.deepEqual([card.card.width, card.card.height], [800, 1000]);
});

test("petite image : pas agrandie ; image très haute : hauteur bornée à 1600 px", async () => {
  const small = await renderImageCard(await solid(300, 200, "#336699").png().toBuffer());
  assert.deepEqual([small.width, small.height, small.card.width, small.card.height], [300, 200, 300, 200]);

  const tall = await renderImageCard(await solid(600, 3000, "#336699").jpeg().toBuffer());
  assert.deepEqual([tall.width, tall.height, tall.card.width, tall.card.height], [600, 3000, 320, 1600]);
});

test("couleur dominante proche de celle de l'image", async () => {
  const card = await renderImageCard(await solid(1080, 1350, "#c0392b").jpeg().toBuffer());
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(card.color.slice(start, start + 2), 16));
  for (const [actual, expected] of [
    [r, 0xc0],
    [g, 0x39],
    [b, 0x2b],
  ]) {
    assert.ok(Math.abs(actual - expected) <= 16, `${card.color} loin de #c0392b`);
  }
});

test("GIF animé : vignette fixe de la première image, dimensions d'une image", async () => {
  const frames = await Promise.all(["#ff0000", "#0000ff"].map((color) => solid(600, 900, color).png().toBuffer()));
  const card = await renderImageCard(await sharp(frames, { join: { animated: true } }).gif().toBuffer());
  assert.deepEqual([card.width, card.height, card.card.width, card.card.height], [600, 900, 600, 900]);
  assert.equal((await sharp(card.webp).metadata()).pages, undefined);
  assert.ok(parseInt(card.color.slice(1, 3), 16) > 0xc0, `${card.color} : rouge attendu`);
});

test("PNG transparent : la transparence est gardée", async () => {
  const card = await renderImageCard(await solid(400, 400, { r: 0, g: 0, b: 0, alpha: 0 }, 4).png().toBuffer());
  const output = await sharp(card.webp).metadata();
  assert.equal(output.hasAlpha, true);
});

test("SVG, fichier qui n'est pas une image, image géante : refusés, échec définitif", async () => {
  await rejection(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'));
  await rejection(Buffer.from("<!doctype html><title>Pas une image</title>"));
  // 8000 × 6000 = 48 Mpx, au-delà de la limite de décodage.
  await rejection(await solid(8000, 6000, "#000000").jpeg().toBuffer());
});
