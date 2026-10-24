/*
 * Faux Supabase (Auth + PostgREST en mémoire) et faux OpenAI, branchés sur `globalThis.fetch`,
 * pour exécuter les vrais handlers des routes dans les tests, sans réseau.
 * PostgREST : filtres `eq` / `neq` / `in` / `gte`, `select` de premier niveau, `.single()` (406 sinon),
 * insertions avec un id `<table>-<n>` ; fonctions (`rpc/<nom>`) données par l'option `rpc`, absentes
 * sinon (404 PGRST202, comme une migration pas encore appliquée).
 */

export const SUPABASE_URL = "http://supabase.test";

function json(body, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Colonnes de premier niveau d'un `select` (`a,b,alias:table(x,y)`). */
function selectedColumns(select) {
  if (!select || select === "*") return null;
  const columns = [];
  let depth = 0;
  let current = "";
  for (const char of select) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      columns.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) columns.push(current);
  return columns.map((column) => column.split("(")[0].split(":")[0]);
}

function project(row, columns) {
  if (!columns) return { ...row };
  return Object.fromEntries(columns.filter((column) => column in row).map((column) => [column, row[column]]));
}

const RESERVED_PARAMS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function matches(row, searchParams) {
  for (const [column, filter] of searchParams) {
    if (RESERVED_PARAMS.has(column)) continue;
    const dot = filter.indexOf(".");
    const operator = filter.slice(0, dot);
    const value = filter.slice(dot + 1);
    const actual = String(row[column]);
    if (operator === "eq" && actual !== value) return false;
    if (operator === "neq" && actual === value) return false;
    if (operator === "in" && !value.replace(/^\(|\)$/g, "").split(",").includes(actual)) return false;
    if (operator === "gte" && !(actual >= value)) return false;
  }
  return true;
}

/**
 * @param {object} options
 * @param {Record<string, object>} [options.users] JWT → utilisateur renvoyé par `/auth/v1/user`
 * @param {Record<string, object[]>} [options.tables] lignes de départ, copiées
 * @param {(request: object) => string} [options.openai] contenu du message renvoyé par le modèle
 * @param {Record<string, (args: object) => unknown>} [options.rpc] nom → réponse de la fonction
 */
export function createFakeBackend({ users = {}, tables = {}, openai, rpc = {} } = {}) {
  const db = structuredClone(tables);
  const calls = [];
  const counters = {};

  async function rest(request, url, payload) {
    const table = url.pathname.replace("/rest/v1/", "");
    const rows = (db[table] ??= []);
    const single = (request.headers.get("accept") ?? "").includes("application/vnd.pgrst.object+json");
    const representation = (request.headers.get("prefer") ?? "").includes("return=representation");
    const columns = selectedColumns(url.searchParams.get("select"));
    const respond = (result) => {
      if (!single) return json(result.map((row) => project(row, columns)));
      if (result.length !== 1) {
        return json(
          {
            code: "PGRST116",
            details: `The result contains ${result.length} rows`,
            hint: null,
            message: "Cannot coerce the result to a single JSON object",
          },
          406,
        );
      }
      return json(project(result[0], columns));
    };

    switch (request.method) {
      case "GET":
        return respond(rows.filter((row) => matches(row, url.searchParams)));
      case "POST": {
        const inserted = (Array.isArray(payload) ? payload : [payload]).map((row) => {
          counters[table] = (counters[table] ?? 0) + 1;
          return { id: `${table}-${counters[table]}`, ...row };
        });
        rows.push(...inserted);
        return representation ? respond(inserted) : json(undefined, 201);
      }
      case "PATCH": {
        const updated = rows.filter((row) => matches(row, url.searchParams));
        for (const row of updated) Object.assign(row, payload);
        return representation ? respond(updated) : json(undefined, 204);
      }
      case "DELETE":
        db[table] = rows.filter((row) => !matches(row, url.searchParams));
        return json(undefined, 204);
      default:
        return json({ message: `Méthode non gérée : ${request.method}` }, 405);
    }
  }

  async function fakeFetch(input, init) {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const text = ["GET", "HEAD"].includes(request.method) ? "" : await request.text();
    const payload = text ? JSON.parse(text) : undefined;
    calls.push({ method: request.method, url: `${url.origin}${url.pathname}${url.search}`, body: payload });

    if (url.origin === SUPABASE_URL) {
      if (url.pathname === "/auth/v1/user") {
        const user = users[(request.headers.get("authorization") ?? "").replace("Bearer ", "")];
        return user ? json(user) : json({ code: 403, error_code: "bad_jwt", msg: "invalid JWT" }, 403);
      }
      if (url.pathname === "/auth/v1/admin/users") {
        return json({ users: Object.values(users), aud: "authenticated" });
      }
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const name = url.pathname.replace("/rest/v1/rpc/", "");
        const fn = rpc[name];
        if (!fn) {
          return json(
            {
              code: "PGRST202",
              details: null,
              hint: null,
              message: `Could not find the function public.${name} in the schema cache`,
            },
            404,
          );
        }
        return json(fn(payload ?? {}));
      }
      if (url.pathname.startsWith("/rest/v1/")) return rest(request, url, payload);
    }

    if (url.origin === "https://api.openai.com" && openai) {
      return json({
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 0,
        model: payload.model,
        choices: [{ index: 0, message: { role: "assistant", content: openai(payload) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }

    throw new Error(`Appel réseau inattendu : ${request.method} ${request.url}`);
  }

  return { db, calls, fetch: fakeFetch };
}
