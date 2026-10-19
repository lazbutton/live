/*
 * Routes appelées par l'app, exécutées pour de vrai contre un faux Supabase et un faux OpenAI
 * (fake-backend.mjs) : chaque corps envoyé par l'app reçoit le statut attendu et une réponse
 * conforme à son schéma (lib/api/app/schemas.ts) ; un corps invalide reçoit un 400 lisible.
 *   node --test lib/api/app/routes.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { after, mock, test } from "node:test";
import { fileURLToPath } from "node:url";

import { SUPABASE_URL, createFakeBackend } from "./fake-backend.mjs";
import { appBodies, completeEventData, ids, newRequestTestPageBody } from "./fixtures.mjs";

// Lues au chargement des routes.
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
process.env.OPENAI_API_KEY = "sk-test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const { NextRequest } = require("next/server");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const route = (file) => jiti.import(path.join(root, "app/api", file, "route.ts"));

const s = await jiti.import(path.join(root, "lib/api/app/schemas.ts"));
const registerToken = await route("notifications/register-token");
const newRequest = await route("notifications/admin/new-request");
const newReport = await route("notifications/admin/new-report");
const userRequests = await route("user-requests");
const extractFromImage = await route("mobile/events/extract-from-image");
const adminEvent = await route("admin/mobile/events/[id]");

// Les routes journalisent chaque appel.
for (const method of ["log", "info", "warn", "error"]) mock.method(console, method, () => {});
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});

const TERMS = "2026-03-24-ugc-v1";
const user = (id, extra) => ({
  id,
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email" },
  created_at: "2026-01-01T00:00:00Z",
  ...extra,
});
const users = {
  "jwt-user": user("user-1", {
    email: "membre@example.test",
    user_metadata: { full_name: "Camille Martin", ugc_terms_accepted_version: TERMS },
  }),
  "jwt-admin": user("admin-1", {
    email: "admin@example.test",
    user_metadata: { role: "admin", ugc_terms_accepted_version: TERMS },
  }),
  "jwt-anon": user("anon-1", { is_anonymous: true, app_metadata: { provider: "anonymous" }, user_metadata: {} }),
};

const tables = {
  // Token iOS factice : l'envoi aux admins échoue sans appel réseau.
  user_push_tokens: [{ id: "tok-admin", user_id: "admin-1", token: "ios_user_admin-1", platform: "ios" }],
  user_requests: [
    { id: ids.REQUEST_ID, request_type: "event_creation", event_data: { title: "Concert au Bouillon" }, source_url: null },
    { id: ids.URL_REQUEST_ID, request_type: "event_from_url", event_data: null, source_url: "https://example.test/agenda" },
  ],
  content_reports: [
    { id: "rep-1", target_event_id: "evt-1", reported_user_id: "user-2", reason_code: "spam", details: null, block_requested: false },
  ],
  events: [
    {
      id: "evt-1",
      title: "Concert au 108",
      date: "2026-10-24T18:30:00+00:00",
      status: "pending",
      category: "CONCERT",
      price: 10,
      price_min: null,
      price_max: null,
      is_pay_what_you_want: false,
      location_id: "loc-1",
      address: null,
      image_url: null,
      external_url: null,
      external_url_label: null,
      is_full: false,
      is_featured: false,
      archived: false,
      locations: { id: "loc-1", name: "Le 108", address: "108 rue de Bourgogne", city: { label: "Orléans" } },
    },
  ],
  locations: [{ id: "loc-1" }, { id: "loc-2" }],
  event_organizers: [],
};

function freshBackend(options = {}) {
  const backend = createFakeBackend({ users, tables, ...options });
  globalThis.fetch = backend.fetch;
  return backend;
}

async function call(handler, { method = "POST", token, json, form, query, params } = {}) {
  const url = new URL("http://localhost/api");
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  let body;
  if (json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = new FormData();
    for (const [key, value] of Object.entries(form)) body.append(key, value);
  }
  const response = await handler(new NextRequest(url, { method, headers, body }), {
    params: Promise.resolve(params ?? {}),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

function conforms(schema, body) {
  const result = schema.safeParse(body);
  assert.ok(result.success, `${JSON.stringify(body)}\n${JSON.stringify(result.error?.issues)}`);
}

async function expectInvalidBody(response) {
  const { status, body } = await response;
  assert.equal(status, 400);
  conforms(s.invalidBodyErrorSchema, body);
  assert.match(body.error, /^Corps de la requête invalide : /);
}

test("register-token : enregistre, met à jour et supprime un token", async () => {
  for (const [platform, body] of Object.entries(appBodies.registerPushToken)) {
    const { db } = freshBackend();
    const { status, body: response } = await call(registerToken.POST, { token: "jwt-user", json: body });
    assert.equal(status, 200);
    conforms(s.pushTokenResponseSchema, response);
    assert.equal(response.message, "Token enregistré");
    const row = db.user_push_tokens.find((token) => token.token === body.token);
    assert.equal(row.platform, platform);
    assert.equal(row.device_id, body.deviceId ?? null);
  }

  const { db } = freshBackend({
    tables: { ...tables, user_push_tokens: [{ id: "tok-1", user_id: "user-1", token: "fcm-token-ios", platform: "ios" }] },
  });
  const updated = await call(registerToken.POST, { token: "jwt-user", json: appBodies.registerPushToken.ios });
  assert.equal(updated.body.message, "Token mis à jour");
  const deleted = await call(registerToken.DELETE, { method: "DELETE", token: "jwt-user", json: appBodies.unregisterPushToken });
  assert.equal(deleted.status, 200);
  conforms(s.pushTokenResponseSchema, deleted.body);
  assert.equal(db.user_push_tokens.length, 0);
});

test("register-token : corps invalide, JWT refusé", async () => {
  freshBackend();
  await expectInvalidBody(call(registerToken.POST, { token: "jwt-user", json: { token: "fcm-token" } }));
  await expectInvalidBody(call(registerToken.DELETE, { method: "DELETE", token: "jwt-user", json: {} }));
  const refused = await call(registerToken.POST, { token: "inconnu", json: appBodies.registerPushToken.ios });
  assert.equal(refused.status, 401);
  conforms(s.appErrorSchema, refused.body);
});

test("new-request : app, paramètres de requête, page de test", async () => {
  for (const body of Object.values(appBodies.adminNewRequest)) {
    freshBackend();
    const { status, body: response } = await call(newRequest.POST, { json: body });
    assert.equal(status, 200);
    conforms(s.adminAlertResponseSchema, response);
  }

  freshBackend();
  const fromQuery = await call(newRequest.POST, { query: { requestId: ids.REQUEST_ID } });
  assert.equal(fromQuery.status, 200);

  // La page de test envoie un id qui n'existe pas en base.
  const testPage = await call(newRequest.POST, { json: newRequestTestPageBody });
  assert.equal(testPage.status, 404);
  conforms(s.appErrorSchema, testPage.body);

  await expectInvalidBody(call(newRequest.POST, { json: { requestType: "event_creation" } }));
  await expectInvalidBody(call(newRequest.POST, { json: { requestId: "{{id}}" } }));
});

test("new-request : ligne user_requests sans requestId (format du trigger SQL retiré), 400", async () => {
  const backend = freshBackend();
  const row = {
    id: ids.REQUEST_ID,
    request_type: "event_creation",
    event_data: { title: "Texte au choix de l'appelant" },
    source_url: null,
    requested_at: "2026-10-19T11:00:00+00:00",
  };
  const { status, body } = await call(newRequest.POST, { json: row });
  assert.equal(status, 400);
  conforms(s.invalidBodyErrorSchema, body);
  assert.equal(body.error, "Corps de la requête invalide : requestId : requis");
  // Ni lecture de la demande, ni envoi aux admins.
  assert.deepEqual(backend.calls, []);
});

test("new-report : signalement complet ou minimal", async () => {
  for (const body of Object.values(appBodies.adminNewReport)) {
    freshBackend();
    const { status, body: response } = await call(newReport.POST, { json: body });
    assert.equal(status, 200);
    conforms(s.adminAlertResponseSchema, response);
  }
  freshBackend();
  await expectInvalidBody(call(newReport.POST, { json: { eventId: "evt-1" } }));
  const unknown = await call(newReport.POST, { json: { reportId: "rep-404" } });
  assert.equal(unknown.status, 404);
  conforms(s.appErrorSchema, unknown.body);
});

test("user-requests : formulaire, affiche seule, lien", async () => {
  for (const body of Object.values(appBodies.createUserRequest)) {
    const { db } = freshBackend();
    const { status, body: response } = await call(userRequests.POST, { token: "jwt-user", json: body });
    assert.equal(status, 200);
    conforms(s.createUserRequestResponseSchema, response);
    const row = db.user_requests.at(-1);
    assert.equal(row.id, response.request_id);
    assert.equal(row.request_type, body.requestType);
    if (body.requestType === "event_creation") assert.deepEqual(row.event_data, body.eventData);
  }

  const { db } = freshBackend();
  const fromUrl = await call(userRequests.POST, { token: "jwt-user", json: appBodies.createUserRequest.fromUrlTypedLocation });
  assert.match(fromUrl.body.message, /depuis URL/);
  assert.equal(db.user_requests.at(-1).location_id, null);
  const complete = await call(userRequests.POST, { token: "jwt-user", json: appBodies.createUserRequest.complete });
  assert.deepEqual(db.user_requests.find((row) => row.id === complete.body.request_id).event_data, completeEventData);
});

test("user-requests : corps invalide, sans JWT", async () => {
  freshBackend();
  await expectInvalidBody(call(userRequests.POST, { token: "jwt-user", json: { requestType: "event_update" } }));
  await expectInvalidBody(call(userRequests.POST, { token: "jwt-user", json: { requestType: "event_from_url" } }));
  const anonymous = await call(userRequests.POST, { json: appBodies.createUserRequest.fromUrlKnownLocation });
  assert.equal(anonymous.status, 401);
  conforms(s.appErrorSchema, anonymous.body);
});

const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], "image_picker_42.jpg", { type: "image/jpeg" });

test("extract-from-image : affiche lue, illisible, absente", async () => {
  freshBackend({
    openai: () =>
      JSON.stringify({ title: " Festival  de jazz ", date: "2026-11-14T20:30:00", price: 15, location: "Le 108", tags: ["Jazz"] }),
  });
  const read = await call(extractFromImage.POST, { token: "jwt-user", form: { image: jpeg() } });
  assert.equal(read.status, 200);
  conforms(s.extractFromImageResponseSchema, read.body);
  assert.equal(read.body.data.title, "Festival de jazz");

  freshBackend({ openai: () => JSON.stringify({ tags: ["jazz"] }) });
  const unreadable = await call(extractFromImage.POST, { token: "jwt-user", form: { image: jpeg() } });
  assert.equal(unreadable.status, 422);
  conforms(s.extractFromImageErrorSchema, unreadable.body);
  assert.ok(unreadable.body.warnings.length > 0);

  await expectInvalidBody(call(extractFromImage.POST, { token: "jwt-user", form: { imageUrl: " " } }));
  await expectInvalidBody(call(extractFromImage.POST, { token: "jwt-user", json: { image: "x" } }));
  const anonymous = await call(extractFromImage.POST, { token: "jwt-anon", form: { image: jpeg() } });
  assert.equal(anonymous.status, 403);
  conforms(s.appErrorSchema, anonymous.body);
});

test("actions rapides admin : approuver, complet, à la une, édition rapide", async () => {
  const patch = (json) => call(adminEvent.PATCH, { method: "PATCH", token: "jwt-admin", params: { id: "evt-1" }, json });
  const expectations = {
    approve: (item) => assert.equal(item.status, "approved"),
    toggleFull: (item) => assert.equal(item.isFull, true),
    toggleFeatured: (item) => assert.equal(item.isFeatured, true),
    quickEdit: (item) => {
      assert.equal(item.title, "Concert au 108 (complet)");
      assert.equal(item.price, 12.5);
      assert.equal(item.locationId, "loc-2");
      assert.equal(item.externalUrlLabel, "Billetterie");
    },
    quickEditCleared: (item) => {
      assert.equal(item.price, null);
      assert.equal(item.externalUrl, null);
      assert.equal(item.date, "2026-10-24T18:30:00.000Z");
    },
  };
  for (const [name, check] of Object.entries(expectations)) {
    freshBackend();
    const { status, body } = await patch(appBodies.adminEventAction[name]);
    assert.equal(status, 200, name);
    conforms(s.adminEventActionResponseSchema, body);
    check(body.item);
  }
});

test("actions rapides admin : erreurs", async () => {
  freshBackend();
  const patch = (token, id, json) => call(adminEvent.PATCH, { method: "PATCH", token, params: { id }, json });
  await expectInvalidBody(patch("jwt-admin", "evt-1", { action: "archive" }));
  await expectInvalidBody(patch("jwt-admin", "evt-1", { action: "quickEdit", price: "12" }));
  const forbidden = await patch("jwt-user", "evt-1", appBodies.adminEventAction.approve);
  assert.equal(forbidden.status, 403);
  conforms(s.appErrorSchema, forbidden.body);
  // Comportement actuel, documenté dans docs/API_APP.md : un événement introuvable donne un 500.
  const missing = await patch("jwt-admin", "evt-404", appBodies.adminEventAction.approve);
  assert.equal(missing.status, 500);
  assert.equal(missing.body.error, "Événement introuvable");
});
