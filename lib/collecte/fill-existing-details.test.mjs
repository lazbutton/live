/*
 * La reprise des fiches à venir (scripts/fill-event-details.mjs) : le plan (ne remplir que le vide, les tags que la
 * lecture ne confirme pas, l'effet sur « En famille »), l'écriture du plan relu et son retour arrière sur une base
 * factice, la page de relecture. Aucun accès réseau.
 *   node --test lib/collecte/fill-existing-details.test.mjs
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
const reprise = await jiti.import(path.join(root, "lib/collecte/fill-existing-details.ts"));
const { formatDetailsReview } = await jiti.import(path.join(root, "lib/collecte/fill-details-review.ts"));

const GENRES = [
  { id: "g-humour", category_id: "spectacle", name: "Humour", phrase: "l'humour", display_order: 2, is_active: true },
  { id: "g-impro", category_id: "spectacle", name: "Impro", phrase: "l'impro", display_order: 3, is_active: true },
  { id: "g-cirque", category_id: "spectacle", name: "Cirque", phrase: "le cirque", display_order: 4, is_active: true },
  { id: "g-jazz", category_id: "concert", name: "Jazz", phrase: "le jazz", display_order: 2, is_active: true },
];
const TAGS = [
  { id: "t-cirque", name: "Cirque" },
  { id: "t-danse", name: "Danse" },
  { id: "t-humour", name: "Humour" },
  { id: "t-jeune", name: "Jeune Public" },
];

const row = (overrides) => ({
  id: "e1",
  title: "Zigo Comedy Club",
  description: "Scène ouverte d'humour et d'impro.",
  date: "2026-11-07T20:45:00+00:00",
  status: "approved",
  categoryId: "spectacle",
  categoryName: "Spectacle",
  locationName: "L'Improviste Bar",
  sourceUrl: "https://exemple.fr/zigo",
  tagIds: [],
  genreIds: [],
  audience: null,
  minAge: null,
  booking: null,
  isYoungAudience: false,
  updatedAt: "2026-10-23T10:00:00+00:00",
  ...overrides,
});

const reading = (overrides) => ({
  method: "page",
  url: "https://exemple.fr/zigo",
  genres: [],
  audience: null,
  minAge: null,
  booking: null,
  evidence: [],
  ...overrides,
});

test("ce qui reste à remplir, et les séances lues ensemble", () => {
  assert.equal(reprise.needsDetails(row({}), GENRES), true);
  assert.equal(
    reprise.needsDetails(row({ genreIds: ["g-humour"], audience: "all", minAge: 6, booking: "none" }), GENRES),
    false,
  );
  // Une catégorie sans genres n'attend pas de genre ; l'âge reste à lire tant qu'il n'est pas connu.
  assert.equal(
    reprise.needsDetails(row({ categoryId: "expo", audience: "all", booking: "none", minAge: 3 }), GENRES),
    false,
  );
  const groups = reprise.readingGroups([
    row({ id: "a1" }),
    row({ id: "a2", title: "ZIGO comedy club" }),
    row({ id: "b1", title: "Autre spectacle" }),
    row({ id: "c1", sourceUrl: "https://exemple.fr/autre" }),
  ]);
  assert.deepEqual(
    groups.map((group) => group.rows.map((entry) => entry.id)),
    [["a1", "a2"], ["b1"], ["c1"]],
  );
});

test("le plan : seulement le vide, genres de la liste, tags que la lecture ne confirme pas, « En famille »", () => {
  const rows = [
    // Zigo : la page dit humour et impro ; ses tags Cirque et Danse ne tiennent pas.
    row({ id: "zigo", tagIds: ["t-cirque", "t-danse", "t-humour"] }),
    // Déjà saisi dans le back-office : rien n'est remplacé.
    row({ id: "saisi", title: "Saisi", audience: "adults", booking: "online", genreIds: ["g-impro"] }),
    // Un spectacle « tout public dès 6 ans », coché jeune public par l'ancienne règle.
    row({ id: "cirque", title: "La Passerelle fait son cirque", isYoungAudience: true, tagIds: ["t-cirque", "t-jeune"] }),
    // Rien de lu : pas de proposition.
    row({ id: "muet", title: "Muet" }),
  ];
  const readings = new Map([
    ["zigo", reading({ genres: ["Humour", "Impro", "Stand-up"], audience: "adults", booking: "none", evidence: ["Entrée libre, sans réservation."] })],
    ["saisi", reading({ genres: ["Humour"], audience: "all", minAge: 12, booking: "none" })],
    ["cirque", reading({ genres: ["Cirque"], audience: "all", minAge: 6, booking: "none" })],
    ["muet", reading({})],
  ]);
  const plan = reprise.planDetails(rows, readings, { genres: GENRES, tags: TAGS });
  assert.deepEqual(
    plan.map((proposal) => proposal.id),
    ["zigo", "saisi", "cirque"],
  );
  const [zigo, saisi, cirque] = plan;
  assert.deepEqual(zigo.fill, { genres: ["Humour", "Impro"], audience: "adults", booking: "none" });
  assert.deepEqual(zigo.genresUnmatched, ["Stand-up"]);
  assert.deepEqual(zigo.tagsToRemove.map((tag) => tag.name), ["Cirque", "Danse"]);
  assert.equal(zigo.youngAudience, undefined);
  assert.deepEqual(saisi.fill, { min_age: 12 });
  assert.deepEqual(cirque.fill, { genres: ["Cirque"], audience: "all", min_age: 6, booking: "none" });
  assert.deepEqual(cirque.tagsToRemove, []);
  assert.deepEqual(cirque.youngAudience, { before: true, after: false });
  assert.deepEqual(cirque.before, {
    genre_ids: [],
    audience: null,
    min_age: null,
    booking: null,
    tag_ids: ["t-cirque", "t-jeune"],
    is_young_audience: true,
  });
});

/** Base factice : `events` et `event_genres`, les mises à jour appliquées, le journal d'audit gardé. */
function fakeBase(events) {
  const tables = { events: structuredClone(events), event_genres: GENRES, admin_audit_log: [] };
  const supabase = {
    from(table) {
      const filters = [];
      let patch = null;
      const query = {
        select: () => query,
        eq: (column, value) => {
          filters.push((entry) => entry[column] === value);
          return query;
        },
        update: (values) => {
          patch = values;
          return query;
        },
        insert: async (values) => {
          tables[table].push(values);
          return { error: null };
        },
        maybeSingle: async () => ({ data: tables[table].find((entry) => filters.every((keep) => keep(entry))) ?? null, error: null }),
        then: (resolve, reject) => {
          const rows = tables[table].filter((entry) => filters.every((keep) => keep(entry)));
          if (patch) for (const entry of rows) Object.assign(entry, patch, { updated_at: "2026-10-25T08:00:00+00:00" });
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { supabase, tables };
}

test("écriture du plan relu : tel quel, sans écraser ce qui a changé depuis ; retour arrière", async () => {
  const base = (overrides) => ({
    id: "zigo",
    category: "spectacle",
    tag_ids: ["t-cirque", "t-danse", "t-humour"],
    genre_ids: [],
    audience: null,
    min_age: null,
    booking: null,
    is_young_audience: false,
    updated_at: "2026-10-23T10:00:00+00:00",
    ...overrides,
  });
  const rows = [row({ id: "zigo", tagIds: ["t-cirque", "t-danse", "t-humour"] }), row({ id: "modifie", title: "Modifié" }), row({ id: "rempli", title: "Rempli" })];
  const readings = new Map(rows.map((entry) => [entry.id, reading({ genres: ["Humour"], audience: "adults", booking: "none" })]));
  const plan = reprise.planDetails(rows, readings, { genres: GENRES, tags: TAGS });
  const { supabase, tables } = fakeBase([
    base({}),
    // Modifié dans le back-office depuis la lecture : sauté.
    base({ id: "modifie", tag_ids: [], updated_at: "2026-10-24T18:00:00+00:00" }),
    // Rempli entre-temps (même updated_at, par exemple une écriture SQL) : jamais remplacé.
    base({ id: "rempli", tag_ids: [], booking: "online" }),
  ]);

  const result = await reprise.applyDetailsPlan(supabase, plan, "script:test");
  assert.equal(result.updated, 2);
  assert.deepEqual(result.skipped.map((entry) => [entry.id, entry.reason]), [["modifie", "modifié depuis la lecture"]]);
  const [zigo, modifie, rempli] = tables.events;
  assert.deepEqual(
    [zigo.genre_ids, zigo.audience, zigo.booking, zigo.tag_ids],
    [["g-humour"], "adults", "none", ["t-humour"]],
  );
  assert.equal(modifie.audience, null);
  assert.equal(rempli.booking, "online");
  assert.equal(rempli.audience, "adults");
  assert.deepEqual(
    tables.admin_audit_log.map((entry) => [entry.action, entry.entity_id]),
    [
      ["event.details_fill", "zigo"],
      ["event.details_fill", "rempli"],
    ],
  );

  // Retour arrière : ce que la reprise a écrit revient à l'avant ; ce qu'un autre a posé reste.
  rempli.booking = "online";
  const undo = await reprise.rollbackDetailsPlan(supabase, plan, "script:test");
  assert.equal(undo.restored, 2);
  assert.deepEqual(
    [zigo.genre_ids, zigo.audience, zigo.booking, zigo.tag_ids, zigo.is_young_audience],
    [[], null, null, ["t-cirque", "t-danse", "t-humour"], false],
  );
  assert.deepEqual([rempli.audience, rempli.booking], [null, "online"]);
});

test("les phrases d'une source qui parlent d'âge, de public ou de réservation", () => {
  assert.deepEqual(
    reprise.evidenceOf(
      "Bienvenue à cette soirée anniversaire ! Tout public dès 6 ans • 60 min. Gratuit, pas de réservation. Le public est accueilli dehors.",
    ),
    ["Tout public dès 6 ans", "Gratuit, pas de réservation."],
  );
});

test("la page de relecture : ce qui change « En famille », les tags, les genres hors liste, tout par catégorie", () => {
  const rows = [
    row({ id: "zigo", tagIds: ["t-cirque", "t-danse"] }),
    row({ id: "cirque", title: "La <Passerelle> fait son cirque", isYoungAudience: true }),
  ];
  const readings = new Map([
    ["zigo", reading({ genres: ["Humour", "Stand-up"], audience: "adults" })],
    ["cirque", reading({ genres: ["Cirque"], audience: "all", minAge: 6, booking: "none", evidence: ["Tout public dès 6 ans"] })],
  ]);
  const html = formatDetailsReview(reprise.planDetails(rows, readings, { genres: GENRES, tags: TAGS }), {
    readOn: "24 octobre 2026",
    eventsRead: 356,
    eventsToFill: 2,
    sourcesRead: 2,
  });
  assert.match(html, /^<title>Reprise des fiches<\/title>/);
  assert.match(html, /quitte « En famille »/);
  assert.match(html, /#Cirque<\/span><span class="chip chip-drop">#Danse/);
  assert.match(html, /Spectacle · Stand-up/);
  assert.match(html, /La &lt;Passerelle&gt; fait son cirque/);
  assert.match(html, /Dès 6 ans/);
  assert.doesNotMatch(html, /<Passerelle>/);
});
