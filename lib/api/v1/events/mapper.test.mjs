/*
 * API publique v1 (lib/api/v1/events/mapper.ts) : les artistes d'un événement, et le crédit de leur photo
 * (docs/ARTIST_PHOTOS.md), sans réseau.
 *   node --test lib/api/v1/events/mapper.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const { mapPublicEvent } = await jiti.import(path.join(root, "lib/api/v1/events/mapper.ts"));
const { publicEventSchema } = await jiti.import(path.join(root, "lib/api/v1/events/schemas.ts"));

const row = (artist) => ({
  id: "0f1c2d3e-4b5a-4c6d-8e7f-901a2b3c4d5e",
  title: "Brad Mehldau",
  date: "2027-01-30T20:30:00+01:00",
  event_artists: [{ role_label: null, sort_index: 0, artist }],
});

test("artistes : la photo arrive avec son crédit", () => {
  const event = mapPublicEvent(
    row({
      id: "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d",
      name: "Brad Mehldau",
      slug: "brad-mehldau",
      image_url: "https://example.supabase.co/storage/v1/object/public/organizers-images/artists/brad.jpg",
      image_credit: "Björn Milcke",
      image_license: "Domaine public",
      image_source_url: "https://commons.wikimedia.org/wiki/File:Brad_Mehldau.jpg",
    }),
  );
  assert.deepEqual(
    [event.artists[0].imageCredit, event.artists[0].imageLicense, event.artists[0].imageSourceUrl],
    ["Björn Milcke", "Domaine public", "https://commons.wikimedia.org/wiki/File:Brad_Mehldau.jpg"],
  );
  assert.equal(publicEventSchema.safeParse(event).success, true);
});

test("artistes : sans crédit (photo envoyée par l'artiste), les trois champs à null", () => {
  const event = mapPublicEvent(
    row({ id: "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d", name: "YN", image_url: "https://example.com/yn.jpg" }),
  );
  assert.deepEqual(
    [event.artists[0].imageCredit, event.artists[0].imageLicense, event.artists[0].imageSourceUrl],
    [null, null, null],
  );
  assert.equal(publicEventSchema.safeParse(event).success, true);
});
