/*
 * Contrat des routes appelées par l'app Flutter (`../live`). Référence lisible : docs/API_APP.md.
 *
 * Requêtes : des builds de l'app sont publiés, ces schémas acceptent ce qu'ils envoient. Un champ
 * facultatif peut arriver absent ou à `null` (`.nullish()`), une clé inconnue est ignorée.
 * Réponses : pas de validation à l'exécution ; les routes les typent avec `z.infer`, le build casse
 * si leur forme change. Ajouter un champ ne casse pas l'app ; en retirer ou en renommer un, si.
 */
import { z } from "zod";

/** « requis » quand la clé manque ou vaut `null` ; sinon le message par défaut. */
const requiredError = (issue: { input?: unknown }) =>
  issue.input === undefined || issue.input === null ? "requis" : undefined;

function isObjectWith(value: unknown, key: string) {
  return typeof value === "object" && value !== null && key in value;
}

const requiredString = z.string({ error: requiredError });
const nonEmptyString = requiredString.min(1, "ne doit pas être vide");
const optionalString = z.string().nullish();

// --- Erreurs ---------------------------------------------------------------------------------

/**
 * Corps de toute réponse en erreur. `ApiClient` (lib/core/network/api_client.dart) affiche
 * `error` tel quel, sauf en 401 (« Session expirée »). Champs annexes selon la route :
 * `details`, `warnings`, `issues`.
 */
export const appErrorSchema = z.looseObject({
  error: z.string(),
});

export const bodyIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});

/** 400 renvoyé quand le corps ne respecte pas son schéma. */
export const invalidBodyErrorSchema = appErrorSchema.extend({
  issues: z.array(bodyIssueSchema),
});

// --- Tokens push : POST et DELETE /api/notifications/register-token ---------------------------

export const pushPlatformSchema = z.enum(["ios", "android", "web"], {
  error: (issue) =>
    issue.input === undefined ? "requis" : "doit valoir ios, android ou web",
});

/** `NotificationApiService.registerPushToken`. */
export const registerPushTokenBodySchema = z.object({
  token: nonEmptyString,
  platform: pushPlatformSchema,
  /** Absent sur le web, et si l'appareil n'en donne pas. */
  deviceId: optionalString,
  appVersion: optionalString,
});

/** `NotificationApiService.unregisterPushToken`. */
export const unregisterPushTokenBodySchema = z.object({
  token: nonEmptyString,
});

export const pushTokenResponseSchema = z.object({
  success: z.literal(true),
  /** « Token enregistré », « Token mis à jour » ou « Token supprimé ». */
  message: z.string(),
});

// --- Alertes admin : POST /api/notifications/admin/new-request et new-report ------------------

/** Identifiant venant d'un webhook : refusé s'il contient une variable non interpolée. */
const interpolatedId = nonEmptyString.refine(
  (value) => !value.includes("{{") && !value.includes("$1"),
  "contient une variable non interpolée",
);

/** Replis de new-request (corps ou paramètres de requête), quand la demande ne les donne pas. */
const newRequestFallbackFields = {
  /** `event_creation` ou `event_from_url`. */
  requestType: optionalString,
  eventTitle: optionalString,
  sourceUrl: optionalString,
};

/**
 * new-request, envoyé par l'app (`NotificationApiService.notifyAdminsNewRequest`, quand la
 * demande a été créée sans passer par /api/user-requests) et par la page de test du back-office.
 * La demande est relue en base par `requestId`.
 */
export const adminNewRequestBodySchema = z.object({
  requestId: interpolatedId,
  ...newRequestFallbackFields,
});

/**
 * new-request, format du trigger SQL `notify_admins_new_request_trigger` (pg_net) : la ligne
 * `user_requests` insérée, utilisée sans relecture. Ce trigger n'a jamais rien envoyé et
 * 20261019200000_drop_notify_admins_triggers.sql le retire : plus aucun appelant.
 */
export const adminNewRequestRowSchema = z.object({
  id: interpolatedId,
  request_type: optionalString,
  event_data: z.record(z.string(), z.unknown()).nullish(),
  source_url: optionalString,
  requested_at: optionalString,
  ...newRequestFallbackFields,
});

/**
 * new-report : `NotificationApiService.notifyAdminsNewContentReport`, après l'insertion du
 * signalement dans `content_reports`. Le signalement est relu en base ; les autres champs
 * remplacent ses valeurs quand ils sont fournis.
 */
export const adminNewReportBodySchema = z.object({
  reportId: nonEmptyString,
  eventId: optionalString,
  eventTitle: optionalString,
  /** abuse, harassment, hate, sexual, violence, spam, illegal, impersonation, other. */
  reasonCode: optionalString,
  reasonLabel: optionalString,
  /** Détails saisis ; peut être vide. */
  message: optionalString,
  userId: optionalString,
  reportedUserId: optionalString,
  blockRequested: z.boolean().nullish(),
});

/** Résultat de `sendNotificationToAdmins` (lib/notifications/admin.ts). */
export const adminNotificationResultSchema = z.object({
  /** `false` dès qu'un envoi échoue ou que personne n'est notifié ; la réponse reste en 200. */
  success: z.boolean(),
  sent: z.number(),
  failed: z.number(),
  errors: z.array(z.string()),
  /** Détail par admin (e-mail, début des tokens) : voir docs/API_APP.md. */
  diagnostics: z.record(z.string(), z.unknown()).optional(),
});

/** Réponse de new-request et new-report. L'app ne la lit pas. */
export const adminAlertResponseSchema = adminNotificationResultSchema.extend({
  flow: z.object({
    route: z.string(),
    path: z.string(),
    sender: z.literal("sendNotificationToAdmins"),
    honorsPreferences: z.literal(false),
    honorsCategories: z.literal(false),
    targetsAllAdminTokens: z.literal(true),
  }),
});

// --- Demandes : POST /api/user-requests -------------------------------------------------------

/**
 * `eventData` d'une demande `event_creation`, construit par `EventService.createEvent`
 * (lib/services/event_service.dart) et stocké tel quel dans `user_requests.event_data`.
 * Les champs vides arrivent à `null` ; une clé inconnue est conservée.
 */
export const eventRequestDataSchema = z.looseObject({
  /** `complete` (formulaire) ou `poster_only` (affiche seule, l'équipe complète). */
  request_type: requiredString,
  title: requiredString,
  description: requiredString,
  /** `DateTime.toIso8601String()` : heure locale de l'appareil, sans fuseau. */
  date: requiredString,
  end_date: optionalString,
  /** HH:mm. */
  end_time: optionalString,
  door_opening_time: optionalString,
  /** Nom de la catégorie en majuscules. */
  category: requiredString,
  price: z.number().nullish(),
  capacity: z.number().nullish(),
  location_id: optionalString,
  /** Nom du lieu, choisi ou saisi. */
  location_name: optionalString,
  address: optionalString,
  image_url: optionalString,
  external_url: optionalString,
  tag_ids: z.array(z.string()).nullish(),
  /** Noms des tags, existants ou nouveaux. */
  tags: z.array(z.string()).nullish(),
  organizer_names: z.array(z.string()).nullish(),
}, { error: requiredError });

const contributorFields = {
  /** Nom du compte (métadonnées, sinon e-mail) ; `null` si inconnu. */
  contributorDisplayName: optionalString,
  /** Absent = `false`. */
  communityAttributionOptIn: z.boolean().nullish(),
};

/** `UserRequestApiService.createEventCreationRequest`. */
export const eventCreationRequestBodySchema = z.object({
  requestType: z.literal("event_creation"),
  eventData: eventRequestDataSchema,
  ...contributorFields,
});

/** `UserRequestApiService.createEventFromUrlRequest`. */
export const eventFromUrlRequestBodySchema = z.object({
  requestType: z.literal("event_from_url"),
  /** `""` quand le lieu a été saisi à la main. */
  locationId: optionalString,
  /** Vide après `trim()` : refusé par la route (400). */
  locationName: requiredString,
  sourceUrl: requiredString,
  ...contributorFields,
});

export const createUserRequestBodySchema = z.discriminatedUnion(
  "requestType",
  [eventCreationRequestBodySchema, eventFromUrlRequestBodySchema],
  {
    error: (issue) =>
      isObjectWith(issue.input, "requestType")
        ? "doit valoir event_creation ou event_from_url"
        : "requis",
  },
);

export const createUserRequestResponseSchema = z.object({
  success: z.literal(true),
  request_id: z.string(),
  status: z.literal("pending"),
  /** Affiché par l'app après une demande « depuis une URL ». */
  message: z.string(),
  notification: adminNotificationResultSchema,
  flow: z.object({
    route: z.literal("/api/user-requests"),
    path: z.literal("create_user_request_and_notify_admins"),
    authMode: z.literal("jwt"),
    sender: z.literal("sendNotificationToAdmins"),
  }),
});

// --- Analyse d'affiche : POST /api/mobile/events/extract-from-image ---------------------------

/**
 * Formulaire multipart. L'app (`UserRequestApiService.extractEventFromImage`) envoie le champ
 * `image` (`image/jpeg`) ; `imageUrl` sert aux autres appelants. Taille et type du fichier sont
 * vérifiés par la route (413 au-delà de 12 Mo).
 */
export const extractFromImageFormSchema = z
  .object({
    image: z.instanceof(File).nullable(),
    imageUrl: z.string().trim().nullable(),
  })
  .refine((form) => form.image !== null || Boolean(form.imageUrl), {
    message: "Image requise pour l'analyse.",
  });

export const importedEventWarningSchema = z.object({
  field: z.string(),
  message: z.string(),
  value: z.string().optional(),
});

/**
 * Champs lus par une IA sur l'affiche (`ImportedEventPayload`, lib/events/imported-event-payload.ts).
 * Tous facultatifs, éventuellement `null` ; d'autres clés peuvent suivre (`is_full`,
 * `presale_price`…). L'app (`ImportedEventPayload.fromJson`) convertit chaque valeur en texte.
 */
export const importedEventDataSchema = z.looseObject({
  title: optionalString,
  description: optionalString,
  /** ISO 8601. */
  date: optionalString,
  end_date: optionalString,
  category: optionalString,
  price: z.union([z.string(), z.number()]).nullish(),
  capacity: z.union([z.string(), z.number()]).nullish(),
  door_opening_time: optionalString,
  external_url: optionalString,
  external_url_label: optionalString,
  image_url: optionalString,
  location: optionalString,
  address: optionalString,
  organizer: optionalString,
  tags: z.array(z.string()).nullish(),
});

export const extractFromImageResponseSchema = z.object({
  data: importedEventDataSchema,
  metadata: z.looseObject({
    ai_processed: z.boolean(),
    /** `image`. */
    source: z.string(),
    source_image_url: z.string().nullable(),
    auth_mode: z.literal("jwt"),
    requester_id: z.string(),
  }),
  warnings: z.array(importedEventWarningSchema),
});

/** Échec de l'analyse : 422 quand l'affiche est illisible, avec les avertissements. */
export const extractFromImageErrorSchema = appErrorSchema.extend({
  warnings: z.array(importedEventWarningSchema).optional(),
});

// --- Actions rapides admin : PATCH /api/admin/mobile/events/[id] ------------------------------

/** `AdminMobileApiService.quickEditEvent` : `title`, `date` et `locationId` toujours envoyés. */
export const quickEditEventBodySchema = z.object({
  action: z.literal("quickEdit"),
  /** Au moins 3 caractères (vérifié à l'enregistrement). `null` = inchangé. */
  title: optionalString,
  /** `DateTime.toIso8601String()`. `null` = inchangée. */
  date: optionalString,
  /** Lieu existant ; `null` ou `""` refusés à l'enregistrement. */
  locationId: optionalString,
  /** `null` efface le prix. */
  price: z.number().nullish(),
  /** Jamais envoyé par l'app. */
  isPayWhatYouWant: z.boolean().nullish(),
  externalUrl: optionalString,
  externalUrlLabel: optionalString,
});

/** `AdminMobileApiService.approveEvent`, `toggleEventFull`, `toggleEventFeatured`, `quickEditEvent`. */
export const adminEventActionBodySchema = z.discriminatedUnion(
  "action",
  [
    z.object({ action: z.literal("approve") }),
    z.object({ action: z.literal("toggleFull") }),
    z.object({ action: z.literal("toggleFeatured") }),
    quickEditEventBodySchema,
  ],
  {
    error: (issue) =>
      isObjectWith(issue.input, "action")
        ? "doit valoir approve, toggleFull, toggleFeatured ou quickEdit"
        : "requis",
  },
);

/** Événement vu par l'admin embarquée ; lu par `AdminMobileEventItem.fromJson`. */
export const adminMobileEventItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** ISO 8601, tel qu'en base. */
  date: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  category: z.string().nullable(),
  price: z.number().nullable(),
  isPayWhatYouWant: z.boolean(),
  locationId: z.string().nullable(),
  locationName: z.string().nullable(),
  locationSummary: z.string().nullable(),
  address: z.string().nullable(),
  imageUrl: z.string().nullable(),
  externalUrl: z.string().nullable(),
  externalUrlLabel: z.string().nullable(),
  isFull: z.boolean(),
  isFeatured: z.boolean(),
  /** Chemin du back-office web, ouvert par l'app. */
  webPath: z.string(),
});

export const adminEventActionResponseSchema = z.object({
  item: adminMobileEventItemSchema,
});

// --- Types du contrat ---------------------------------------------------------------------------

export type AppError = z.infer<typeof appErrorSchema>;
export type InvalidBodyError = z.infer<typeof invalidBodyErrorSchema>;
export type RegisterPushTokenBody = z.infer<typeof registerPushTokenBodySchema>;
export type UnregisterPushTokenBody = z.infer<typeof unregisterPushTokenBodySchema>;
export type PushTokenResponse = z.infer<typeof pushTokenResponseSchema>;
export type AdminNewRequestBody = z.infer<typeof adminNewRequestBodySchema>;
export type AdminNewRequestRow = z.infer<typeof adminNewRequestRowSchema>;
export type AdminNewReportBody = z.infer<typeof adminNewReportBodySchema>;
export type AdminAlertResponse = z.infer<typeof adminAlertResponseSchema>;
export type EventRequestData = z.infer<typeof eventRequestDataSchema>;
export type CreateUserRequestBody = z.infer<typeof createUserRequestBodySchema>;
export type CreateUserRequestResponse = z.infer<typeof createUserRequestResponseSchema>;
export type ExtractFromImageResponse = z.infer<typeof extractFromImageResponseSchema>;
export type ExtractFromImageError = z.infer<typeof extractFromImageErrorSchema>;
export type AdminEventActionBody = z.infer<typeof adminEventActionBodySchema>;
export type AdminMobileEventItem = z.infer<typeof adminMobileEventItemSchema>;
export type AdminEventActionResponse = z.infer<typeof adminEventActionResponseSchema>;
