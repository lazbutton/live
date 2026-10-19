/*
 * Faux Supabase pour les tests des vignettes, branché sur `globalThis.fetch` : table `events` en
 * mémoire (filtres eq, neq, in, is, not.is ; order ; offset / limit ; count exact ; PATCH avec
 * retour des lignes), dépôt Storage, et un faux hébergeur d'images (`hosts`).
 */

export const SUPABASE_URL = "http://supabase.test";

const RESERVED = new Set(["select", "order", "limit", "offset", "columns"]);

function json(body, status = 200, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Valeurs de `in.(a,b,"c,d")`. */
function listValues(raw) {
  return [...raw.replace(/^\(|\)$/g, "").matchAll(/"((?:[^"\\]|\\.)*)"|([^,]+)/g)].map(([, quoted, plain]) =>
    quoted !== undefined ? quoted.replace(/\\(.)/g, "$1") : plain,
  );
}

function matchesFilter(row, column, filter) {
  const negate = filter.startsWith("not.");
  const expression = negate ? filter.slice(4) : filter;
  const dot = expression.indexOf(".");
  const operator = expression.slice(0, dot);
  const value = expression.slice(dot + 1);
  const actual = row[column];
  let result;
  if (operator === "is") result = value === "null" ? actual == null : String(actual) === value;
  else if (actual == null) return false; // SQL : comparer à NULL ne retient pas la ligne
  else if (operator === "eq") result = String(actual) === value;
  else if (operator === "neq") result = String(actual) !== value;
  else if (operator === "in") result = listValues(value).includes(String(actual));
  else throw new Error(`Filtre non géré par le faux Supabase : ${column}=${filter}`);
  return negate ? !result : result;
}

const matches = (row, params) =>
  [...params].every(([column, filter]) => RESERVED.has(column) || matchesFilter(row, column, filter));

function project(row, select) {
  if (!select || select === "*") return { ...row };
  return Object.fromEntries(select.split(",").map((column) => [column, row[column] ?? null]));
}

function sortRows(rows, order) {
  if (!order) return rows;
  const keys = order.split(",").map((part) => {
    const [column, direction = "asc"] = part.split(".");
    return { column, sign: direction === "desc" ? -1 : 1 };
  });
  return [...rows].sort((a, b) => {
    for (const { column, sign } of keys) {
      if (a[column] < b[column]) return -sign;
      if (a[column] > b[column]) return sign;
    }
    return 0;
  });
}

/**
 * @param {object} options
 * @param {object[]} [options.events] lignes de départ, copiées
 * @param {Record<string, (request: Request, db: object) => Response | Promise<Response>>} [options.hosts]
 *   réponses du faux hébergeur d'images, par adresse complète
 * @param {string} [options.storageError] message d'erreur renvoyé à chaque dépôt
 */
export function createFakeSupabase({ events = [], hosts = {}, storageError } = {}) {
  const db = { events: structuredClone(events) };
  const storage = new Map();
  const calls = [];

  async function rest(request, url) {
    const rows = db.events;
    const params = url.searchParams;
    const prefer = request.headers.get("prefer") ?? "";
    const select = params.get("select");

    if (request.method === "PATCH") {
      const payload = JSON.parse(await request.text());
      const updated = rows.filter((row) => matches(row, params));
      for (const row of updated) Object.assign(row, payload);
      return prefer.includes("return=representation")
        ? json(updated.map((row) => project(row, select)))
        : new Response(null, { status: 204 });
    }

    const found = sortRows(
      rows.filter((row) => matches(row, params)),
      params.get("order"),
    );
    const offset = Number(params.get("offset") ?? 0);
    const limit = params.has("limit") ? Number(params.get("limit")) : found.length;
    const page = found.slice(offset, offset + limit);
    const range = { "content-range": `${page.length ? `${offset}-${offset + page.length - 1}` : "*"}/${found.length}` };
    if (request.method === "HEAD") return new Response(null, { status: 200, headers: range });
    return json(
      page.map((row) => project(row, select)),
      200,
      range,
    );
  }

  async function upload(request, url) {
    const [bucket, ...rest] = url.pathname.replace("/storage/v1/object/", "").split("/");
    const objectPath = rest.join("/");
    if (storageError) return json({ statusCode: "500", error: "Internal", message: storageError }, 500);
    storage.set(`${bucket}/${objectPath}`, {
      body: Buffer.from(await request.arrayBuffer()),
      contentType: request.headers.get("content-type"),
      cacheControl: request.headers.get("cache-control"),
      upsert: request.headers.get("x-upsert"),
    });
    return json({ Key: `${bucket}/${objectPath}`, Id: `obj-${storage.size}` });
  }

  async function fakeFetch(input, init) {
    const request = new Request(input, init);
    const url = new URL(request.url);
    calls.push(`${request.method} ${url.origin}${url.pathname}`);

    if (url.origin === SUPABASE_URL) {
      if (url.pathname === "/rest/v1/events") return rest(request, url);
      if (url.pathname.startsWith("/storage/v1/object/") && request.method === "POST") return upload(request, url);
    }
    const host = hosts[url.href];
    if (host) return host(request, db);
    throw new Error(`Appel réseau inattendu : ${request.method} ${request.url}`);
  }

  return { db, storage, calls, fetch: fakeFetch };
}
