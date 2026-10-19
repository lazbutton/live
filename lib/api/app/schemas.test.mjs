/*
 * Contrat app ↔ admin (lib/api/app/schemas.ts) : les corps envoyés par l'app Flutter passent,
 * un corps invalide est refusé avec un message lisible, les réponses types respectent leurs schémas.
 *   node --test lib/api/app/schemas.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { appBodies, completeEventData, newRequestTestPageBody } from "./fixtures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });

const s = await jiti.import(path.join(root, "lib/api/app/schemas.ts"));
const { parseAppBody, readAppJsonBody } = await jiti.import(path.join(root, "lib/api/app/http.ts"));

/** Message `error` du 400 renvoyé pour ce corps. */
async function rejection(schema, body) {
  const result = parseAppBody(schema, body);
  assert.equal(result.ok, false, `corps accepté à tort : ${JSON.stringify(body)}`);
  assert.equal(result.response.status, 400);
  const json = await result.response.json();
  assert.ok(s.invalidBodyErrorSchema.safeParse(json).success, JSON.stringify(json));
  return json.error;
}

function accepts(schema, body) {
  const result = schema.safeParse(body);
  assert.ok(result.success, `${JSON.stringify(body)}\n${JSON.stringify(result.error?.issues)}`);
  return result.data;
}

test("corps envoyés par l'app : acceptés", () => {
  for (const body of Object.values(appBodies.registerPushToken)) accepts(s.registerPushTokenBodySchema, body);
  accepts(s.unregisterPushTokenBodySchema, appBodies.unregisterPushToken);
  for (const body of Object.values(appBodies.adminNewRequest)) accepts(s.adminNewRequestBodySchema, body);
  for (const body of Object.values(appBodies.adminNewReport)) accepts(s.adminNewReportBodySchema, body);
  for (const body of Object.values(appBodies.createUserRequest)) accepts(s.createUserRequestBodySchema, body);
  for (const body of Object.values(appBodies.adminEventAction)) accepts(s.adminEventActionBodySchema, body);
  accepts(s.extractFromImageFormSchema, {
    image: new File([new Uint8Array([0xff, 0xd8, 0xff])], "image_picker_42.jpg", { type: "image/jpeg" }),
    imageUrl: null,
  });
});

test("autre appelant de new-request : page de test", () => {
  accepts(s.adminNewRequestBodySchema, newRequestTestPageBody);
});

test("eventData est conservé tel quel, clés inconnues comprises", () => {
  const eventData = { ...completeEventData, is_free: true };
  const parsed = accepts(s.createUserRequestBodySchema, { ...appBodies.createUserRequest.complete, eventData });
  assert.deepEqual(parsed.eventData, eventData);
});

test("champs facultatifs : absents ou null", () => {
  accepts(s.registerPushTokenBodySchema, { token: "t", platform: "ios", deviceId: null, appVersion: null });
  accepts(s.adminNewReportBodySchema, { reportId: "rep-1", eventId: null, blockRequested: null });
  accepts(s.createUserRequestBodySchema, {
    requestType: "event_from_url",
    locationName: "Le 108",
    sourceUrl: "https://example.test",
  });
  accepts(s.adminEventActionBodySchema, { action: "quickEdit", title: null, date: null, isPayWhatYouWant: null });
  // Une clé inconnue est ignorée.
  assert.deepEqual(accepts(s.registerPushTokenBodySchema, { token: "t", platform: "web", locale: "fr" }), {
    token: "t",
    platform: "web",
  });
});

test("corps invalides : 400 avec un message lisible", async () => {
  const cases = [
    [s.registerPushTokenBodySchema, {}, "token : requis ; platform : requis"],
    [s.registerPushTokenBodySchema, { token: "t", platform: "windows" }, "platform : doit valoir ios, android ou web"],
    [s.unregisterPushTokenBodySchema, { token: "" }, "token : ne doit pas être vide"],
    [s.adminNewRequestBodySchema, { requestId: "{{id}}" }, "requestId : contient une variable non interpolée"],
    // Ligne `user_requests` (format du trigger SQL retiré) : `id` ne remplace pas `requestId`.
    [s.adminNewRequestBodySchema, { id: "33333333-3333-4333-8333-333333333333", event_data: { title: "x" } }, "requestId : requis"],
    [s.adminNewReportBodySchema, { eventId: "evt-1" }, "reportId : requis"],
    [s.createUserRequestBodySchema, { eventData: completeEventData }, "requestType : requis"],
    [s.createUserRequestBodySchema, { requestType: "event_update" }, "requestType : doit valoir event_creation ou event_from_url"],
    [s.createUserRequestBodySchema, { requestType: "event_creation" }, "eventData : requis"],
    [
      s.createUserRequestBodySchema,
      { requestType: "event_creation", eventData: { ...completeEventData, title: 42 } },
      "eventData.title : Entrée invalide : chaîne de caractères attendu, nombre reçu",
    ],
    [s.createUserRequestBodySchema, { requestType: "event_from_url", sourceUrl: "https://x.test" }, "locationName : requis"],
    [s.adminEventActionBodySchema, {}, "action : requis"],
    [s.adminEventActionBodySchema, { action: "archive" }, "action : doit valoir approve, toggleFull, toggleFeatured ou quickEdit"],
    [s.adminEventActionBodySchema, { action: "quickEdit", price: "12" }, "price : Entrée invalide : nombre attendu, chaîne de caractères reçu"],
    [s.extractFromImageFormSchema, { image: null, imageUrl: "  " }, "Image requise pour l'analyse."],
  ];
  for (const [schema, body, message] of cases) {
    assert.equal(await rejection(schema, body), `Corps de la requête invalide : ${message}`);
  }
});

test("corps qui n'est pas du JSON : 400", async () => {
  const request = new Request("http://localhost/api/user-requests", { method: "POST", body: "{oops" });
  const result = await readAppJsonBody(request, s.createUserRequestBodySchema);
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 400);
  assert.deepEqual(await result.response.json(), {
    error: "Corps de la requête invalide : JSON attendu",
    issues: [{ path: "", message: "JSON attendu" }],
  });
});

const eventItem = {
  id: "evt-1",
  title: "Concert au 108",
  date: "2026-10-24T18:30:00+00:00",
  status: "approved",
  category: "CONCERT",
  price: 10,
  isPayWhatYouWant: false,
  locationId: "loc-1",
  locationName: "Le 108",
  locationSummary: "Le 108 - Orléans",
  address: "108 rue de Bourgogne",
  imageUrl: null,
  externalUrl: null,
  externalUrlLabel: null,
  isFull: false,
  isFeatured: true,
  webPath: "/admin/events?view=agenda&start=2026-10-24",
};

test("réponses types : conformes à leur schéma", () => {
  accepts(s.pushTokenResponseSchema, { success: true, message: "Token enregistré" });
  accepts(s.adminAlertResponseSchema, {
    success: true,
    sent: 1,
    failed: 0,
    errors: [],
    flow: {
      route: "/api/notifications/admin/new-report",
      path: "admin_public_report_notification",
      sender: "sendNotificationToAdmins",
      honorsPreferences: false,
      honorsCategories: false,
      targetsAllAdminTokens: true,
    },
  });
  accepts(s.createUserRequestResponseSchema, {
    success: true,
    request_id: "a0f4c1de-5b7e-4c2a-9d3f-1e2b3c4d5e6f",
    status: "pending",
    message: "Demande de création d'événement soumise avec succès. Elle sera examinée par un administrateur.",
    notification: { success: false, sent: 0, failed: 0, errors: ["Aucun token trouvé"] },
    flow: {
      route: "/api/user-requests",
      path: "create_user_request_and_notify_admins",
      authMode: "jwt",
      sender: "sendNotificationToAdmins",
    },
  });
  // Valeurs telles que l'IA les rend : prix en texte, champs à null, clés en plus.
  accepts(s.extractFromImageResponseSchema, {
    data: {
      title: "Festival de jazz",
      date: "2026-11-14T19:30:00.000Z",
      price: "15",
      capacity: null,
      location: null,
      tags: ["jazz"],
      is_full: false,
      presale_price: 12,
    },
    metadata: {
      ai_processed: true,
      source: "image",
      source_image_url: null,
      auth_mode: "jwt",
      requester_id: "user-1",
    },
    warnings: [{ field: "location", message: "Le lieu n'a pas pu etre determine avec certitude." }],
  });
  accepts(s.adminEventActionResponseSchema, { item: eventItem });
  accepts(s.appErrorSchema, { error: "Token invalide ou expiré", details: "invalid JWT" });
  accepts(s.extractFromImageErrorSchema, {
    error: "L'image ne contient pas assez d'informations lisibles pour pre-remplir automatiquement l'evenement.",
    warnings: [{ field: "title", message: "Le titre n'a pas pu etre determine avec certitude." }],
  });
});

test("une réponse qui change de forme est refusée", () => {
  const { webPath, ...withoutWebPath } = eventItem;
  assert.ok(webPath);
  assert.equal(s.adminEventActionResponseSchema.safeParse({ item: withoutWebPath }).success, false);
  assert.equal(s.adminEventActionResponseSchema.safeParse({ event: eventItem }).success, false);
  assert.equal(s.pushTokenResponseSchema.safeParse({ success: true }).success, false);
  assert.equal(s.appErrorSchema.safeParse({ error: { code: "validation_error", message: "x" } }).success, false);
});
