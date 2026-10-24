/*
 * « Fiches à compléter » : ce qui manque à une fiche à venir, et ses séances regroupées.
 *   node --test lib/events/fiches-to-complete.test.mjs
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
const { ficheGaps, groupFichesToComplete } = await jiti.import(path.join(root, "lib/events/fiches-to-complete.ts"));

const GENRES = [
  { id: "hum", category_id: "spectacle", name: "Humour", phrase: "l'humour", display_order: 1, is_active: true },
  { id: "old", category_id: "spectacle", name: "Vieux", phrase: "le vieux", display_order: 2, is_active: false },
];
const CATEGORIES = [
  { id: "spectacle", name: "Spectacle" },
  { id: "expo", name: "Expo" },
];

const row = (overrides) => ({
  id: "e1",
  title: "Plateau",
  date: "2026-11-07T20:30:00+00:00",
  status: "approved",
  category: "spectacle",
  genre_ids: [],
  audience: null,
  min_age: null,
  booking: null,
  details_to_confirm: false,
  scraping_url: "https://exemple.fr/plateau",
  location: { name: "Le 108" },
  ...overrides,
});

test("ce qui manque : le genre seulement si la catégorie en a ; ce qui a été lu, à confirmer", () => {
  assert.deepEqual(ficheGaps(row({}), GENRES), ["genre", "audience", "booking"]);
  assert.deepEqual(ficheGaps(row({ category: "expo" }), GENRES), ["audience", "booking"]);
  assert.deepEqual(ficheGaps(row({ genre_ids: ["hum"], audience: "all", booking: "none" }), GENRES), []);
  // Un genre retiré des listes ne compte plus : à redire.
  assert.deepEqual(ficheGaps(row({ genre_ids: ["old"], audience: "all", booking: "none" }), GENRES), ["genre"]);
  assert.deepEqual(
    ficheGaps(row({ genre_ids: ["hum"], audience: "adults", booking: "online", details_to_confirm: true }), GENRES),
    ["confirm"],
  );
});

test("une ligne par spectacle, dans l'ordre des dates ; complètes et ignorées absentes", () => {
  const groups = groupFichesToComplete(
    [
      row({ id: "a1", title: "Plateau", date: "2026-11-07T20:30:00+00:00", status: "pending" }),
      row({ id: "b1", title: "Expo photo", category: "expo", date: "2026-11-08T10:00:00+00:00", audience: "all" }),
      row({ id: "a2", title: "PLATEAU ", date: "2026-11-14T20:30:00+00:00", details_to_confirm: true }),
      row({ id: "c1", title: "Complet", genre_ids: ["hum"], audience: "all", booking: "none" }),
      row({ id: "d1", title: "Ignoré" }),
    ],
    CATEGORIES,
    GENRES,
    new Set(["Ignoré"]),
  );
  assert.deepEqual(
    groups.map((group) => [group.title, group.eventIds, group.gaps, group.pendingCount, group.categoryName]),
    [
      ["Plateau", ["a1", "a2"], ["confirm", "genre", "audience", "booking"], 1, "Spectacle"],
      ["Expo photo", ["b1"], ["booking"], 0, "Expo"],
    ],
  );
  assert.deepEqual(groups[1].value, { genreIds: [], audience: "all", minAge: "", booking: "" });
  assert.equal(groups[0].sourceUrl, "https://exemple.fr/plateau");
});
