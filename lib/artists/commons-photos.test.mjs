/*
 * Photos libres des artistes (lib/artists/commons-photos.ts) : Wikidata, MusicBrainz et Commons sont
 * remplacés par des réponses écrites ici (relevées sur les vraies API le 2026-10-21), sans réseau.
 *   node --test lib/artists/commons-photos.test.mjs
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
const { comparableName, downloadCommonsPhoto, findArtistPhoto, freeLicense, htmlToText } = await jiti.import(
  path.join(root, "lib/artists/commons-photos.ts"),
);

/** Fiche Wikidata : description, image (P18), identifiants. */
const entity = ({ description = null, image = null, musicbrainz = null, extra = {} } = {}) => ({
  descriptions: description ? { fr: { value: description } } : {},
  claims: {
    ...(image ? { P18: [{ mainsnak: { datavalue: { value: image } } }] } : {}),
    ...(musicbrainz ? { P434: [{ mainsnak: { datavalue: { value: musicbrainz } } }] } : {}),
    ...extra,
  },
});
const commonsFile = ({ license = "CC BY-SA 4.0", code = "cc-by-sa-4.0", artist = '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane&nbsp;Doe</a>', mime = "image/jpeg", width = 3000, height = 2000 } = {}) => ({
  query: {
    pages: {
      1: {
        imageinfo: [
          {
            url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Photo.jpg?utm_source=commons.wikimedia.org&utm_content=original",
            thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Photo.jpg/1280px-Photo.jpg",
            descriptionurl: "https://commons.wikimedia.org/wiki/File:Photo.jpg",
            width,
            height,
            mime,
            extmetadata: { LicenseShortName: { value: license }, License: { value: code }, Artist: { value: artist } },
          },
        ],
      },
    },
  },
});

/**
 * Faux services : `search` (résultats de wbsearchentities par nom), `entities` (fiches par id),
 * `files` (réponse Commons par fichier), `musicbrainz` (recherche par nom) et `links` (fiche Wikidata par MBID).
 */
function services({ search = {}, entities = {}, files = {}, musicbrainz = {}, links = {} }) {
  const calls = [];
  const get = async (raw) => {
    const url = new URL(raw);
    calls.push(`${url.hostname} ${url.searchParams.get("action") ?? url.pathname}`);
    const params = url.searchParams;
    if (url.hostname === "www.wikidata.org" && params.get("action") === "wbsearchentities") {
      return { search: search[params.get("search")] ?? [] };
    }
    if (url.hostname === "www.wikidata.org" && params.get("action") === "wbgetentities") {
      return { entities: Object.fromEntries(params.get("ids").split("|").map((id) => [id, entities[id] ?? {}])) };
    }
    if (url.hostname === "commons.wikimedia.org") return files[params.get("titles").replace(/^File:/, "")] ?? { query: { pages: { "-1": {} } } };
    if (url.hostname === "musicbrainz.org" && url.pathname === "/ws/2/artist") {
      const name = params.get("query").match(/^artist:"(.*)"$/)[1];
      return { artists: musicbrainz[name] ?? [] };
    }
    if (url.hostname === "musicbrainz.org") {
      const id = url.pathname.split("/").pop();
      const qid = links[id];
      return { relations: qid ? [{ type: "wikidata", url: { resource: `https://www.wikidata.org/wiki/${qid}` } }] : [] };
    }
    throw new Error(`Appel inattendu : ${raw}`);
  };
  return { get, calls };
}

test("nom comparable, licences acceptées, crédit en texte", () => {
  assert.equal(comparableName("Leïla  Ka"), "leila ka");
  assert.equal(comparableName("Les 7 Doigts de la Main"), "les 7 doigts de la main");
  assert.deepEqual(
    [
      freeLicense("CC BY-SA 4.0", "cc-by-sa-4.0"),
      freeLicense("CC BY 2.0"),
      freeLicense("CC BY-SA 3.0 DE"),
      freeLicense(null, "cc-by-sa-3.0-de"),
      freeLicense("CC0", "cc0"),
      freeLicense("Public domain", "pd"),
      freeLicense("CC BY-NC-SA 2.0"),
      freeLicense("GFDL"),
      freeLicense("FAL"),
      freeLicense("Attribution"),
      freeLicense(null, null),
    ],
    ["CC BY-SA 4.0", "CC BY 2.0", "CC BY-SA 3.0 de", "CC BY-SA 3.0 de", "CC0", "Domaine public", null, null, null, null, null],
  );
  assert.equal(htmlToText('<a href="x">Jane&nbsp;Doe</a> &amp; <span>John&#39;s</span>'), "Jane Doe & John's");
});

test("trouvée par Wikidata : photo à 1 280 px, auteur, licence et page Commons", async () => {
  const { get } = services({
    search: { "Leïla Ka": [{ id: "Q1", label: "Leïla Ka", match: { text: "Leïla Ka" } }, { id: "Q2", label: "Leïla Kaddour" }] },
    entities: { Q1: entity({ description: "danseuse et chorégraphe française", image: "Leila Ka 2021.jpg" }) },
    files: { "Leila Ka 2021.jpg": commonsFile() },
  });
  assert.deepEqual(await findArtistPhoto("Leïla Ka", { get }), {
    status: "found",
    photo: {
      wikidataId: "Q1",
      musicbrainzId: null,
      description: "danseuse et chorégraphe française",
      file: "Leila Ka 2021.jpg",
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Photo.jpg/1280px-Photo.jpg",
      width: 3000,
      height: 2000,
      credit: "Jane Doe",
      license: "CC BY-SA 4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Photo.jpg",
    },
  });
});

test("homonymes : un seul artiste de scène retenu ; deux, rien", async () => {
  const both = {
    search: {
      Marine: [
        { id: "Q10", label: "Marine" },
        { id: "Q11", label: "Marine" },
        { id: "Q12", label: "Marine" },
      ],
    },
    files: { "Marine.jpg": commonsFile() },
  };
  // Une ville et une chanteuse : la chanteuse.
  const one = services({
    ...both,
    entities: { Q10: entity({ description: "commune française", image: "Ville.jpg" }), Q11: entity({ description: "chanteuse française", image: "Marine.jpg" }), Q12: entity({ description: "prénom" }) },
  });
  const found = await findArtistPhoto("Marine", { get: one.get });
  assert.equal(found.status, "found");
  assert.equal(found.photo.wikidataId, "Q11");

  // Deux artistes de scène : on ne choisit pas.
  const two = services({
    ...both,
    entities: { Q10: entity({ description: "rappeuse belge", image: "A.jpg" }), Q11: entity({ description: "chanteuse française", image: "Marine.jpg" }) },
  });
  assert.deepEqual(await findArtistPhoto("Marine", { get: two.get }), {
    status: "ambiguous",
    detail: "Q10 (rappeuse belge), Q11 (chanteuse française)",
  });
});

test("musicien connu de Wikidata sous un autre nom : retrouvé par MusicBrainz", async () => {
  const { get, calls } = services({
    musicbrainz: { YN: [{ id: "mb-1", name: "YN", score: 100 }, { id: "mb-2", name: "YNOT", score: 80 }] },
    links: { "mb-1": "Q20" },
    entities: { Q20: entity({ description: null, image: "Yn live.jpg", musicbrainz: "mb-1" }) },
    files: { "Yn live.jpg": commonsFile({ license: "CC0", code: "cc0", artist: "" }) },
  });
  const result = await findArtistPhoto("YN", { get });
  assert.equal(result.status, "found");
  assert.deepEqual(
    [result.photo.wikidataId, result.photo.musicbrainzId, result.photo.license, result.photo.credit],
    ["Q20", "mb-1", "CC0", "Auteur inconnu"],
  );
  assert.ok(calls.includes("musicbrainz.org /ws/2/artist"));
});

test("rien de sûr : fiche hors de la scène, sans image, licence non libre, logo, trop petite, auteur inconnu", async () => {
  const cases = {
    "Cirque le Roux": [entity({ description: "compagnie de cirque française" }), "no_image"],
    "Jean Dupont": [entity({ description: "homme politique français", image: "Dupont.jpg" }), "not_found"],
    "Plan K": [entity({ description: "salle de danse et ancienne raffinerie de sucre à Molenbeek", image: "Raffinerie.jpg" }), "not_found"],
    "Collectif Ès": [entity({ description: "collectif de danse", image: "Es.jpg" }), "refused", commonsFile({ license: "CC BY-NC 2.0", code: "cc-by-nc-2.0" })],
    "Les 7 Doigts de la Main": [entity({ description: "compagnie de cirque", image: "Logo.svg" }), "refused", commonsFile({ mime: "image/svg+xml" })],
    "Agathe & Adrien": [entity({ description: "duo de musique", image: "Petite.jpg" }), "refused", commonsFile({ width: 300, height: 200 })],
    "Sofiane Chalal": [entity({ description: "danseur", image: "Sans auteur.jpg" }), "refused", commonsFile({ artist: "" })],
  };
  for (const [name, [fiche, status, file]] of Object.entries(cases)) {
    const image = fiche.claims.P18?.[0].mainsnak.datavalue.value;
    const { get } = services({
      search: { [name]: [{ id: "Q30", label: name }] },
      entities: { Q30: fiche },
      files: image && file ? { [image]: file } : {},
      musicbrainz: {},
    });
    const result = await findArtistPhoto(name, { get });
    assert.equal(result.status, status, `${name} : ${JSON.stringify(result)}`);
  }
});

test("service en panne : erreur rendue, pas d'exception", async () => {
  const result = await findArtistPhoto("Aldo", {
    get: async () => {
      throw new Error("www.wikidata.org : HTTP 503");
    },
  });
  assert.deepEqual(result, { status: "error", detail: "www.wikidata.org : HTTP 503" });
});

test("téléchargement : Commons seulement", async () => {
  await assert.rejects(downloadCommonsPhoto("https://example.com/photo.jpg"), /hors de Wikimedia Commons/);
});

test("photo de 1 280 px de large au plus : l'original, sans paramètres de suivi", async () => {
  const { get } = services({
    search: { "Omar Sosa": [{ id: "Q40", label: "Omar Sosa" }] },
    entities: { Q40: entity({ description: "musicien cubain", image: "Omar Sosa.jpg" }) },
    files: { "Omar Sosa.jpg": commonsFile({ width: 800, height: 600 }) },
  });
  const result = await findArtistPhoto("Omar Sosa", { get });
  assert.equal(result.photo.imageUrl, "https://upload.wikimedia.org/wikipedia/commons/a/ab/Photo.jpg");
});
