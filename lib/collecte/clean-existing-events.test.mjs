/*
 * Correction des événements déjà en base (scripts/clean-event-texts.mjs) : simulation et écriture,
 * sur un client Supabase factice.
 *   node --test lib/collecte/clean-existing-events.test.mjs
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

const { applyEventTextChanges, formatCleanupReport, loadEventTextRows, planEventTextCleanup } = await jiti.import(
  path.join(root, "lib/collecte/clean-existing-events.ts"),
);

const EVENTS = [
  {
    id: "e1",
    title: "Plonger | SARAH DEVAUX, COMPAGNIE MENTEUSES",
    description: "Une plongée\ndans la mémoire.",
    date: "2026-10-20T20:00:00+00:00",
    status: "approved",
    category: "c-spectacle",
    location: { name: "Théâtre d'Orléans" },
    event_artists: [],
  },
  {
    id: "e2",
    title: "Concert de Peter Doherty à l'Astrolabe",
    description: "Déjà propre.",
    date: "2026-10-22T20:30:00+00:00",
    status: "pending",
    category: "c-concert",
    location: { name: "L'Astrolabe" },
    event_artists: [{ artist: { name: "Peter Doherty" } }],
  },
  {
    id: "e3",
    title: "Jam session",
    description: null,
    date: "2026-10-23T20:30:00+00:00",
    status: "approved",
    category: "c-concert",
    location: null,
    event_artists: [],
  },
];

/** Client factice : lectures servies depuis des tableaux (pagination comprise), écritures notées. */
function fakeSupabase(tables, writes = []) {
  return {
    from(table) {
      const query = {
        select: () => query,
        eq: (column, value) => {
          query.filter = { column, value };
          return query;
        },
        in: () => query,
        order: () => query,
        range: (from, to) => Promise.resolve({ data: (tables[table] || []).slice(from, to + 1), error: null }),
        update: (patch) => {
          query.patch = patch;
          return query;
        },
        insert: (row) => {
          writes.push({ table, insert: row });
          return Promise.resolve({ error: null });
        },
        then: (resolve, reject) => {
          writes.push({ table, update: query.patch, id: query.filter?.value });
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

const TABLES = {
  events: EVENTS,
  categories: [
    { id: "c-spectacle", name: "Spectacle" },
    { id: "c-concert", name: "Concert" },
  ],
  artists: [{ name: "Peter Doherty" }],
  locations: [{ name: "Théâtre d'Orléans" }, { name: "L'Astrolabe" }],
  organizers: [],
  tags: [{ name: "Jazz" }],
};

test("simulation : seuls les champs qui changent, rien n'est écrit", async () => {
  const writes = [];
  const { rows, knownNames } = await loadEventTextRows(fakeSupabase(TABLES, writes));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1].artistNames, ["Peter Doherty"]);
  assert.ok(knownNames.includes("L'Astrolabe"));
  const changes = planEventTextCleanup(rows, { knownNames });
  assert.deepEqual(
    changes.map((change) => [change.id, change.title?.after ?? null, change.description?.after ?? null]),
    [
      ["e1", "Plonger | Sarah Devaux, Compagnie Menteuses", "Une plongée dans la mémoire."],
      ["e2", "Concert de Peter Doherty", null],
    ],
  );
  assert.deepEqual(writes, []);
  // Titres seulement.
  assert.deepEqual(
    planEventTextCleanup(rows, { knownNames, fields: ["title"] }).map((change) => [change.id, Boolean(change.description)]),
    [
      ["e1", false],
      ["e2", false],
    ],
  );
  const report = formatCleanupReport(changes);
  assert.match(report, /Plonger \| SARAH DEVAUX, COMPAGNIE MENTEUSES {2}→ {2}\*\*Plonger \| Sarah Devaux, Compagnie Menteuses\*\*/);
  assert.match(report, /## Descriptions \(1 événements, 1 textes distincts\)/);
});

test("écriture : un événement à la fois, tracé dans le journal d'audit", async () => {
  const writes = [];
  const supabase = fakeSupabase(TABLES, writes);
  const { rows, knownNames } = await loadEventTextRows(supabase);
  const result = await applyEventTextChanges(supabase, planEventTextCleanup(rows, { knownNames }), "script:test");
  assert.deepEqual(result, { updated: 2, errors: [] });
  assert.deepEqual(
    writes.filter((write) => write.update).map((write) => [write.id, write.update]),
    [
      ["e1", { title: "Plonger | Sarah Devaux, Compagnie Menteuses", description: "Une plongée dans la mémoire." }],
      ["e2", { title: "Concert de Peter Doherty" }],
    ],
  );
  const audit = writes.filter((write) => write.insert).map((write) => write.insert);
  assert.equal(audit.length, 2);
  assert.deepEqual(
    { ...audit[1], metadata: undefined },
    {
      actor_user_id: null,
      actor_email: "script:test",
      action: "event.text_cleanup",
      entity_type: "event",
      entity_id: "e2",
      entity_label: "Concert de Peter Doherty",
      metadata: undefined,
    },
  );
  assert.deepEqual(audit[1].metadata, {
    title_before: "Concert de Peter Doherty à l'Astrolabe",
    title_after: "Concert de Peter Doherty",
    description_changed: false,
    via: "script",
  });
});
