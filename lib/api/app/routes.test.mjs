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
import {
  appBodies,
  completeEventData,
  ids,
  newFeedbackTestPageBody,
  newRequestTestPageBody,
  oldBuildBodies,
} from "./fixtures.mjs";

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
const newFeedback = await route("notifications/admin/new-feedback");
const userRequests = await route("user-requests");
const extractFromImage = await route("mobile/events/extract-from-image");
const adminEvent = await route("admin/mobile/events/[id]");
const notionResync = await route("notion/resync");

// Les routes appellent l'envoi aux admins à chaque requête : l'espion garde le contenu poussé
// (titre, texte) et laisse la vraie fonction s'exécuter.
const adminNotifications = await jiti.import(path.join(root, "lib/notifications/admin.ts"));
const sentToAdmins = mock.method(adminNotifications, "sendNotificationToAdmins");
const lastPush = () => sentToAdmins.mock.calls.at(-1)?.arguments[0];
const lastPushBody = () => lastPush()?.body;

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
  // Compte qui n'a pas encore accepté les conditions (demandées à sa première contribution).
  "jwt-new": user("new-1", { email: "nouveau@example.test", user_metadata: {} }),
  "jwt-suspended": user("suspended-1", {
    email: "suspendu@example.test",
    user_metadata: { ugc_suspended: true, ugc_terms_accepted_version: TERMS },
  }),
};

const tables = {
  // Tokens factices : l'envoi aux admins échoue sans appel réseau.
  user_push_tokens: [
    { id: "tok-admin", user_id: "admin-1", token: "ios_user_admin-1", platform: "ios" },
    { id: "tok-admin-web", user_id: "admin-1", token: "web-token-admin-1", platform: "web" },
  ],
  user_requests: [
    { id: ids.REQUEST_ID, request_type: "event_creation", event_data: { title: "Concert au Bouillon" }, source_url: null },
    { id: ids.URL_REQUEST_ID, request_type: "event_from_url", event_data: null, source_url: "https://example.test/agenda" },
  ],
  // Lignes insérées par `ContentReportService.reportEvent` avant l'envoi de appBodies.adminNewReport
  // (complete, minimal).
  content_reports: [
    {
      id: "rep-1",
      reporter_user_id: "user-1",
      target_type: "event",
      target_event_id: "evt-1",
      reported_user_id: "user-2",
      reason_code: "spam",
      details: "Lien frauduleux",
      block_requested: true,
      status: "pending",
    },
    {
      id: "rep-2",
      reporter_user_id: "user-1",
      target_type: "event",
      target_event_id: "evt-1",
      reported_user_id: null,
      reason_code: "other",
      details: null,
      block_requested: false,
      status: "pending",
    },
  ],
  // Lignes lues ou insérées par `FeedbackService.createFeedback` (anciens builds) avant l'envoi de
  // oldBuildBodies.adminNewFeedback (withType, withoutType).
  feedback_objects: [
    { id: "fbo-1", name: "Bug", is_active: true },
    // Désactivé après l'ouverture du formulaire : l'utilisateur ne peut plus lire son nom.
    { id: "fbo-2", name: "Suggestion", is_active: false },
  ],
  feedbacks: [
    {
      id: "fb-1",
      user_id: "user-1",
      feedback_object_id: "fbo-1",
      description:
        "La carte reste grise quand j'ouvre un événement depuis les favoris, même après avoir relancé l'application deux fois.",
      status: "pending",
      created_at: "2026-10-19T11:00:00+00:00",
    },
    {
      id: "fb-2",
      user_id: "user-1",
      feedback_object_id: "fbo-2",
      description: "Pouvoir filtrer par quartier.",
      status: "pending",
      created_at: "2026-10-19T11:05:00+00:00",
    },
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

/** Réponses publiques ou de tout compte : rien sur les admins (id, e-mail, token). */
function assertNoAdminData(body) {
  assert.ok(!("diagnostics" in body), "diagnostics");
  const text = JSON.stringify(body);
  for (const secret of ["admin-1", "admin@example.test", "ios_user_", "web-token"]) {
    assert.ok(!text.includes(secret), `${secret} dans ${text}`);
  }
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
  const expectedPush = {
    eventCreation: "Nouvelle demande complète: Concert au Bouillon",
    eventFromUrl: "Nouvelle demande depuis URL d'événement",
  };
  for (const [name, body] of Object.entries(appBodies.adminNewRequest)) {
    freshBackend();
    const { status, body: response } = await call(newRequest.POST, { json: body });
    assert.equal(status, 200);
    conforms(s.adminAlertResponseSchema, response);
    assertNoAdminData(response);
    assert.equal(response.failed, 2);
    assert.equal(lastPushBody(), expectedPush[name]);
  }

  // Le texte poussé vient de la demande en base, jamais du corps.
  freshBackend();
  await call(newRequest.POST, { json: { requestId: ids.URL_REQUEST_ID, requestType: "event_creation", eventTitle: "Texte imposé" } });
  assert.equal(lastPushBody(), "Nouvelle demande depuis URL d'événement");

  // Id inconnu : 404, personne n'est notifié. La page de test envoie un id qui n'existe pas en base.
  sentToAdmins.mock.resetCalls();
  const testPage = await call(newRequest.POST, { json: newRequestTestPageBody });
  assert.equal(testPage.status, 404);
  conforms(s.appErrorSchema, testPage.body);
  assert.equal(sentToAdmins.mock.callCount(), 0);

  const fromQuery = await call(newRequest.POST, { query: { requestId: ids.REQUEST_ID } });
  assert.equal(fromQuery.status, 200);

  // Comportement actuel, documenté dans docs/API_APP.md : un id valide rejoué notifie à nouveau.
  sentToAdmins.mock.resetCalls();
  await call(newRequest.POST, { json: appBodies.adminNewRequest.eventCreation });
  await call(newRequest.POST, { json: appBodies.adminNewRequest.eventCreation });
  assert.equal(sentToAdmins.mock.callCount(), 2);

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

/** Notification poussée pour appBodies.adminNewReport, la même qu'avant que la route ignore le corps. */
const reportPush = {
  complete: {
    title: "🚨 Nouveau signalement",
    body: "Spam ou arnaque • sur Concert au 108 • blocage demandé",
    data: {
      type: "new_content_report",
      report_id: "rep-1",
      event_id: "evt-1",
      event_title: "Concert au 108",
      reason_code: "spam",
      reason_label: "Spam ou arnaque",
      message: "Lien frauduleux",
      reporter_user_id: "user-1",
      reported_user_id: "user-2",
      block_requested: true,
    },
  },
  minimal: {
    title: "🚨 Nouveau signalement",
    body: "Autre • sur Concert au 108",
    data: {
      type: "new_content_report",
      report_id: "rep-2",
      event_id: "evt-1",
      event_title: "Concert au 108",
      reason_code: "other",
      reason_label: "Autre",
      message: null,
      reporter_user_id: "user-1",
      reported_user_id: null,
      block_requested: false,
    },
  },
};

test("new-report : signalement complet ou minimal", async () => {
  for (const [name, body] of Object.entries(appBodies.adminNewReport)) {
    freshBackend();
    const { status, body: response } = await call(newReport.POST, { json: body });
    assert.equal(status, 200);
    conforms(s.adminAlertResponseSchema, response);
    assertNoAdminData(response);
    assert.deepEqual(lastPush(), reportPush[name], name);
  }

  // Id absent : 400 ; id inconnu : 404. Personne n'est notifié.
  freshBackend();
  sentToAdmins.mock.resetCalls();
  await expectInvalidBody(call(newReport.POST, { json: { eventId: "evt-1" } }));
  const unknown = await call(newReport.POST, { json: { reportId: "rep-404" } });
  assert.equal(unknown.status, 404);
  conforms(s.appErrorSchema, unknown.body);
  assert.equal(sentToAdmins.mock.callCount(), 0);
});

test("new-report : le texte poussé vient du signalement en base, jamais du corps", async () => {
  // Id de signalement valide, tout le reste au choix de l'appelant.
  const forged = {
    reportId: "rep-1",
    eventId: "evt-404",
    eventTitle: "Texte imposé",
    reasonCode: "hate",
    reasonLabel: "Ouvrez ce lien",
    message: "https://example.test/hameçon",
    userId: "user-404",
    reportedUserId: "user-404",
    blockRequested: false,
  };
  // Corps JSON, puis paramètres de requête (corps absent).
  for (const request of [{ json: forged }, { query: { ...forged, blockRequested: "false" } }]) {
    freshBackend();
    sentToAdmins.mock.resetCalls();
    const { status } = await call(newReport.POST, request);
    assert.equal(status, 200);
    assert.equal(sentToAdmins.mock.callCount(), 1);
    assert.deepEqual(lastPush(), reportPush.complete);
  }
});

/**
 * Notification poussée pour oldBuildBodies.adminNewFeedback. Avec `feedbackType`, la même qu'avant que
 * la route ignore le corps (test lancé sur l'ancienne route).
 */
const feedbackPush = {
  withType: {
    title: "💬 Nouveau feedback",
    body: "Bug: La carte reste grise quand j'ouvre un événement depuis les favoris, même après avoir relancé l'ap...",
    data: {
      type: "new_feedback",
      feedback_id: "fb-1",
      feedback_type: "Bug",
      message: "La carte reste grise quand j'ouvre un événement depuis les favoris, même après avoir relancé l'ap...",
      user_id: "user-1",
      feedback_object_id: "fbo-1",
    },
  },
  // Avant : « feedback: … » et `feedback_type: null`, faute de nom envoyé par l'app ; maintenant le
  // nom de l'objet en base, même désactivé.
  withoutType: {
    title: "💬 Nouveau feedback",
    body: "Suggestion: Pouvoir filtrer par quartier.",
    data: {
      type: "new_feedback",
      feedback_id: "fb-2",
      feedback_type: "Suggestion",
      message: "Pouvoir filtrer par quartier.",
      user_id: "user-1",
      feedback_object_id: "fbo-2",
    },
  },
};

const feedbackFlow = {
  route: "/api/notifications/admin/new-feedback",
  path: "admin_public_feedback_notification",
  sender: "sendNotificationToAdmins",
  honorsPreferences: false,
  honorsCategories: false,
  targetsAllAdminTokens: true,
};

test("new-feedback : corps des anciens builds, même réponse qu'avant", async () => {
  for (const [name, body] of Object.entries(oldBuildBodies.adminNewFeedback)) {
    freshBackend();
    const { status, body: response } = await call(newFeedback.POST, { json: body });
    assert.equal(status, 200);
    conforms(s.adminAlertResponseSchema, response);
    assertNoAdminData(response);
    assert.deepEqual(Object.keys(response), ["success", "sent", "failed", "errors", "flow"]);
    assert.deepEqual(response.flow, feedbackFlow);
    assert.equal(response.failed, 2);
    assert.deepEqual(lastPush(), feedbackPush[name], name);
  }
});

test("new-feedback : le texte poussé vient du feedback en base, jamais du corps", async () => {
  // Id de feedback valide, tout le reste au choix de l'appelant.
  const forged = {
    feedbackId: "fb-1",
    message: "Ouvrez ce lien : https://example.test/hameçon",
    userId: "user-404",
    feedbackType: "Texte imposé",
    feedbackObjectId: "fbo-404",
  };
  // Corps JSON, paramètres de requête (corps absent), champs du format webhook à côté de `feedbackId`.
  for (const request of [
    { json: forged },
    { query: forged },
    { json: { ...forged, id: "fb-2", description: "Texte imposé", user_id: "user-404" } },
  ]) {
    freshBackend();
    sentToAdmins.mock.resetCalls();
    const { status } = await call(newFeedback.POST, request);
    assert.equal(status, 200);
    assert.equal(sentToAdmins.mock.callCount(), 1);
    assert.deepEqual(lastPush(), feedbackPush.withType);
  }
});

test("new-feedback : ligne feedbacks sans feedbackId (format webhook, sans appelant), 400", async () => {
  const rows = [
    { id: "n-importe-quoi", description: "Texte imposé" },
    {
      id: "fb-1",
      description: "Texte imposé",
      user_id: "user-1",
      status: "pending",
      feedback_object_id: "fbo-1",
      created_at: "2026-10-19T11:00:00+00:00",
    },
  ];
  for (const row of rows) {
    const backend = freshBackend();
    const { status, body } = await call(newFeedback.POST, { json: row });
    assert.equal(status, 400);
    conforms(s.invalidBodyErrorSchema, body);
    assert.equal(body.error, "Corps de la requête invalide : feedbackId : requis");
    // Ni lecture du feedback, ni envoi aux admins.
    assert.deepEqual(backend.calls, []);
  }
});

test("new-feedback : id inconnu, 404 ; id absent ou non interpolé, 400 ; personne n'est notifié", async () => {
  freshBackend();
  sentToAdmins.mock.resetCalls();
  // La page de test du back-office envoie un id qui n'existe pas en base.
  for (const request of [
    { json: { ...oldBuildBodies.adminNewFeedback.withType, feedbackId: "fb-404" } },
    { query: { feedbackId: "fb-404" } },
    { json: newFeedbackTestPageBody },
  ]) {
    const unknown = await call(newFeedback.POST, request);
    assert.equal(unknown.status, 404);
    conforms(s.appErrorSchema, unknown.body);
  }
  await expectInvalidBody(call(newFeedback.POST, { json: { message: "Texte imposé", feedbackType: "Bug" } }));
  await expectInvalidBody(call(newFeedback.POST, { json: { feedbackId: "{{ $1.id }}" } }));
  assert.equal(sentToAdmins.mock.callCount(), 0);
});

test("user-requests : formulaire, affiche seule, lien", async () => {
  for (const body of Object.values(appBodies.createUserRequest)) {
    const { db } = freshBackend();
    const { status, body: response } = await call(userRequests.POST, { token: "jwt-user", json: body });
    assert.equal(status, 200);
    conforms(s.createUserRequestResponseSchema, response);
    assertNoAdminData(response);
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

// Le compteur du plafond (take_poster_analysis, migration 20261021200000) : une réponse par appel,
// puis « ok » ; chaque appel gardé.
const posterQuota = (...answers) => {
  const calls = [];
  return {
    calls,
    take_poster_analysis: (args) => {
      calls.push(args);
      return answers.shift() ?? "ok";
    },
  };
};

test("extract-from-image : affiche lue, illisible, absente", async () => {
  freshBackend({
    rpc: posterQuota(),
    openai: () =>
      JSON.stringify({ title: " Festival  de jazz ", date: "2026-11-14T20:30:00", price: 15, location: "Le 108", tags: ["Jazz"] }),
  });
  const read = await call(extractFromImage.POST, { token: "jwt-user", form: { image: jpeg() } });
  assert.equal(read.status, 200);
  conforms(s.extractFromImageResponseSchema, read.body);
  assert.equal(read.body.data.title, "Festival de jazz");

  freshBackend({ rpc: posterQuota(), openai: () => JSON.stringify({ tags: ["jazz"] }) });
  const unreadable = await call(extractFromImage.POST, { token: "jwt-user", form: { image: jpeg() } });
  assert.equal(unreadable.status, 422);
  conforms(s.extractFromImageErrorSchema, unreadable.body);
  assert.ok(unreadable.body.warnings.length > 0);

  await expectInvalidBody(call(extractFromImage.POST, { token: "jwt-user", form: { imageUrl: " " } }));
  await expectInvalidBody(call(extractFromImage.POST, { token: "jwt-user", json: { image: "x" } }));
  const noToken = await call(extractFromImage.POST, { form: { image: jpeg() } });
  assert.equal(noToken.status, 401);
  conforms(s.appErrorSchema, noToken.body);
});

test("extract-from-image : ouverte aux invités et aux comptes sans conditions, avec un plafond par jour", async () => {
  const openai = () => JSON.stringify({ title: "Concert", date: "2026-11-14T20:30:00", location: "Le 108" });

  // Une session invitée, puis un compte qui n'a pas encore accepté les conditions : lus, chacun compté.
  let quota = posterQuota();
  freshBackend({ rpc: quota, openai });
  for (const token of ["jwt-anon", "jwt-new"]) {
    const { status, body } = await call(extractFromImage.POST, { token, form: { image: jpeg() } });
    assert.equal(status, 200, token);
    conforms(s.extractFromImageResponseSchema, body);
  }
  assert.deepEqual(quota.calls, [
    { user_id: "anon-1", is_guest: true, per_user_limit: 10, guest_total_limit: 200 },
    { user_id: "new-1", is_guest: false, per_user_limit: 10, guest_total_limit: 200 },
  ]);

  // Plafond atteint (la session, puis l'ensemble des invités) : 429, sans appel à l'IA.
  for (const answer of ["user_limit", "guest_limit"]) {
    const backend = freshBackend({ rpc: posterQuota(answer), openai });
    const { status, body } = await call(extractFromImage.POST, { token: "jwt-anon", form: { image: jpeg() } });
    assert.equal(status, 429, answer);
    conforms(s.appErrorSchema, body);
    assert.match(body.error, /à la main/);
    assert.ok(!backend.calls.some((c) => c.url.startsWith("https://api.openai.com")), answer);
  }

  // Un formulaire refusé ne compte pas.
  quota = posterQuota();
  freshBackend({ rpc: quota, openai });
  await expectInvalidBody(call(extractFromImage.POST, { token: "jwt-anon", form: { imageUrl: " " } }));
  assert.equal(quota.calls.length, 0);

  // Compteur absent (migration pas encore appliquée) : les invités refusés, comme avant ; les comptes lus.
  freshBackend({ openai });
  const guest = await call(extractFromImage.POST, { token: "jwt-anon", form: { image: jpeg() } });
  assert.equal(guest.status, 403);
  conforms(s.appErrorSchema, guest.body);
  const account = await call(extractFromImage.POST, { token: "jwt-new", form: { image: jpeg() } });
  assert.equal(account.status, 200);

  // Un compte suspendu reste refusé, sans rien compter.
  quota = posterQuota();
  freshBackend({ rpc: quota, openai });
  const suspended = await call(extractFromImage.POST, { token: "jwt-suspended", form: { image: jpeg() } });
  assert.equal(suspended.status, 403);
  conforms(s.appErrorSchema, suspended.body);
  assert.equal(quota.calls.length, 0);
});

test("extract-from-image : l'heure de l'affiche rendue en heure de Paris sans fuseau, été comme hiver", async () => {
  // Ce que l'IA lit → `date`, `end_date` et `time_known` rendus. L'app préremplit ces dates telles
  // quelles et les renvoie sans fuseau (`…T20:30:00.000`) : l'événement est enregistré à 20:30.
  const cases = [
    // Heure d'été (UTC+2) : avant, « 20h30 » sortait `…T18:30:00.000Z`.
    [{ date: "samedi 24 octobre 2026 à 20h30", end_date: "2026-10-24T23:00:00Z" }, { date: "2026-10-24T20:30:00", end_date: "2026-10-24T23:00:00" }],
    [{ date: "2026-07-14T20:30:00+02:00" }, { date: "2026-07-14T20:30:00" }],
    [{ date: "2026-07-14T20:30:00+01:00" }, { date: "2026-07-14T20:30:00" }], // décalage d'hiver mis à tort par l'IA
    // Heure d'hiver (UTC+1) : avant, `…T19:30:00.000Z`.
    [{ date: "samedi 12 décembre 2026 20h30", end_date: "samedi 12 décembre 2026 23h" }, { date: "2026-12-12T20:30:00", end_date: "2026-12-12T23:00:00" }],
    [{ date: "2026-12-12T20:30:00.000Z" }, { date: "2026-12-12T20:30:00" }],
    [{ date: "2026-12-12T20:30" }, { date: "2026-12-12T20:30:00" }],
    // Date seule : le bon jour à 00:00, heure à vérifier (avant : la veille à 22:00Z).
    [{ date: "samedi 24 octobre 2026" }, { date: "2026-10-24T00:00:00", time_known: false }],
    // Illisible : renvoyée telle quelle, comme avant.
    [{ date: "tous les samedis" }, { date: "tous les samedis" }],
  ];
  const dates = ({ date, end_date, time_known }) =>
    Object.fromEntries(Object.entries({ date, end_date, time_known }).filter(([, value]) => value !== undefined));
  const analyze = async (read, label) => {
    freshBackend({ rpc: posterQuota(), openai: () => JSON.stringify({ title: "Concert", location: "Le 108", ...read }) });
    const { status, body } = await call(extractFromImage.POST, { token: "jwt-user", form: { image: jpeg() } });
    assert.equal(status, 200, label);
    conforms(s.extractFromImageResponseSchema, body);
    return dates(body.data);
  };

  const initialTimeZone = process.env.TZ;
  try {
    for (const timeZone of ["UTC", "Europe/Paris"]) {
      process.env.TZ = timeZone;
      for (const [read, expected] of cases) {
        const label = `${JSON.stringify(read)} (TZ=${timeZone})`;
        assert.deepEqual(await analyze(read, label), expected, label);
      }
      // Sans année, comme sur l'affiche : celle où le 24 octobre est un samedi, vu le 21 octobre 2026.
      mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-21T10:00:00Z") });
      try {
        assert.deepEqual(await analyze({ date: "samedi 24 octobre 20h30" }, timeZone), { date: "2026-10-24T20:30:00" });
      } finally {
        mock.timers.reset();
      }
    }
  } finally {
    if (initialTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = initialTimeZone;
  }
});

test("actions rapides admin : approuver, complet, à la une, édition rapide", async () => {
  const patch = (json) => call(adminEvent.PATCH, { method: "PATCH", token: "jwt-admin", params: { id: "evt-1" }, json });
  const expectations = {
    approve: (item) => assert.equal(item.status, "approved"),
    toggleFull: (item) => assert.equal(item.isFull, true),
    toggleFeatured: (item) => assert.equal(item.isFeatured, true),
    quickEdit: (item) => {
      assert.equal(item.title, "Concert au 108 (complet)");
      assert.equal(item.date, "2026-10-24T20:30:00.000Z");
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

test("édition rapide : date sans fuseau = heure de Paris, quel que soit le fuseau du serveur", async () => {
  const cases = {
    "2026-07-14T20:30:00.000": "2026-07-14T20:30:00.000Z", // heure d'été
    "2026-12-31T20:30:00.000": "2026-12-31T20:30:00.000Z", // heure d'hiver
    "2026-10-24T18:30:00.000Z": "2026-10-24T18:30:00.000Z", // date inchangée, renvoyée en UTC
  };
  const initialTimeZone = process.env.TZ;
  try {
    for (const timeZone of ["UTC", "Europe/Paris"]) {
      process.env.TZ = timeZone;
      for (const [date, expected] of Object.entries(cases)) {
        const { db } = freshBackend();
        const { status, body } = await call(adminEvent.PATCH, {
          method: "PATCH",
          token: "jwt-admin",
          params: { id: "evt-1" },
          json: { ...appBodies.adminEventAction.quickEdit, date },
        });
        assert.equal(status, 200, `${date} (TZ=${timeZone})`);
        assert.equal(db.events[0].date, expected, `${date} (TZ=${timeZone})`);
        assert.equal(body.item.date, expected, `${date} (TZ=${timeZone})`);
      }
    }
  } finally {
    if (initialTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = initialTimeZone;
  }
});

test("notion/resync (anciens builds) : 200 sans effet pour un admin, 403 pour un autre compte", async () => {
  const backend = freshBackend();
  const admin = await call(notionResync.POST, { token: "jwt-admin", json: oldBuildBodies.notionResync });
  assert.equal(admin.status, 200);
  assert.deepEqual(admin.body, { ok: true, result: { mode: "notion_removed" }, drainResult: null });
  // Seule la vérification du JWT : rien n'est lu ni écrit.
  assert.deepEqual(
    backend.calls.map(({ method, url }) => `${method} ${new URL(url).pathname}`),
    ["GET /auth/v1/user"],
  );
  const member = await call(notionResync.POST, { token: "jwt-user", json: oldBuildBodies.notionResync });
  assert.equal(member.status, 403);
  conforms(s.appErrorSchema, member.body);
  const expired = await call(notionResync.POST, { token: "jwt-inconnu", json: oldBuildBodies.notionResync });
  assert.equal(expired.status, 401);
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
