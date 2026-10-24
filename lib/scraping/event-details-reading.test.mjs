/*
 * Lecture d'une page par IA : genre, pour qui, âge et réservation (étape 2 de « Pour toi »). L'IA est simulée :
 * on vérifie ce qu'on lui demande (les genres de chaque catégorie) et ce qu'on garde de sa réponse (seulement des
 * valeurs des listes). Aucun accès réseau.
 *   node --test lib/scraping/event-details-reading.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const { scrapeEventPage } = await jiti.import(path.join(root, "lib/scraping/scrape-event-page.ts"));

process.env.OPENAI_API_KEY = "sk-test";

const TABLES = {
  categories: [
    { id: "spectacle", name: "Spectacle" },
    { id: "concert", name: "Concert" },
  ],
  event_genres: [
    { category_id: "spectacle", name: "Théâtre", display_order: 1 },
    { category_id: "spectacle", name: "Cirque", display_order: 4 },
    { category_id: "concert", name: "Jazz", display_order: 2 },
  ],
};

/** Client Supabase factice : chaque table renvoie ses lignes, sans filtre. */
const supabase = {
  from(table) {
    const query = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "then") {
            return (resolve, reject) => Promise.resolve({ data: TABLES[table] ?? [], error: null }).then(resolve, reject);
          }
          return () => query;
        },
      },
    );
    return query;
  },
};

const PAGE = `<!doctype html><html><head><title>20 ans ! La Passerelle fait son cirque !</title></head><body><main>
<h1>20 ans ! La Passerelle fait son cirque !</h1>
<p>Samedi 21 novembre 2026 à 19h30, La Passerelle, Fleury-les-Aubrais.</p>
<p>Tout public dès 6 ans • 60 min. Gratuit, pas de réservation.</p>
<p>Bienvenue à cette soirée anniversaire autour du cirque et de la fête !</p>
</main></body></html>`;

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** L'IA simulée : rend `answer` et garde les demandes reçues. */
function fakeOpenAI(answer) {
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://api.openai.com")) throw new Error(`Appel réseau inattendu : ${url}`);
    const body = JSON.parse(init?.body ? String(init.body) : await input.text());
    requests.push(body);
    return new Response(
      JSON.stringify({
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 0,
        model: body.model,
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(answer) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return requests;
}

const read = () =>
  scrapeEventPage({
    url: "https://exemple.fr/passerelle-cirque",
    supabase,
    prefetched: { html: PAGE, finalUrl: "https://exemple.fr/passerelle-cirque" },
  });

test("l'IA reçoit les genres de chaque catégorie ; genre, pour qui, âge et réservation sont gardés", async () => {
  const requests = fakeOpenAI({
    title: "20 ans ! La Passerelle fait son cirque !",
    date: "2026-11-21T19:30",
    category: "Spectacle",
    genres: ["Cirque"],
    audience: "all",
    min_age: 6,
    booking: "none",
  });
  const result = await read();
  assert.equal(result.ok, true);
  const prompt = requests[0].messages.at(-1).content;
  assert.match(prompt, /Spectacle \(Théâtre, Cirque\) ; Concert \(Jazz\)/);
  const schema = requests[0].response_format.json_schema.schema;
  for (const field of ["genres", "audience", "min_age", "booking"]) assert.ok(schema.required.includes(field), field);
  assert.deepEqual(
    [result.data.genres, result.data.audience, result.data.min_age, result.data.booking],
    [["Cirque"], "all", 6, "none"],
  );
});

test("une valeur hors des listes n'est pas gardée ; rien de dit, rien de rempli", async () => {
  fakeOpenAI({
    title: "20 ans ! La Passerelle fait son cirque !",
    date: "2026-11-21T19:30",
    category: "Spectacle",
    genres: [],
    audience: "enfants",
    min_age: 40,
    booking: "sur place",
  });
  const result = await read();
  for (const field of ["genres", "audience", "min_age", "booking"]) assert.equal(result.data[field], undefined, field);
});
