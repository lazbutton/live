/*
 * Corps envoyés par l'app Flutter (`../live`, branche main, 2026-10-19), tels que `jsonEncode`
 * les produit : clé omise pour `'clé': ?valeur` quand la valeur est nulle, `null` explicite sinon.
 * Les versions 1.0.5 et 1.0.6 envoient les mêmes formes.
 */

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const URL_REQUEST_ID = "22222222-2222-4222-8222-222222222222";

/** `EventService.createEvent` (lib/services/event_service.dart), formulaire complet. */
export const completeEventData = {
  request_type: "complete",
  title: "Jazz au Bouillon",
  description: "Quartet de jazz.",
  date: "2026-11-14T20:30:00.000",
  location_id: null,
  location_name: "Le Bouillon",
  image_url: "https://xyz.supabase.co/storage/v1/object/public/events/affiche.jpg",
  category: "CONCERT",
  price: 12.5,
  address: "2 rue de Tours, Orléans",
  capacity: 120,
  door_opening_time: "20:00",
  end_time: "23:00",
  end_date: "2026-11-14T23:00:00.000",
  tag_ids: ["5b0c7a1e-6f1d-4b8e-9a43-2f0d1c3e4b5a"],
  tags: ["jazz", "quartet"],
  external_url: "https://billetterie.example.test/jazz",
  organizer_names: ["Association Jazz Orléans"],
};

/** `sendEventWizardPoster` : affiche seule, champs vides à `null`. */
export const posterOnlyEventData = {
  request_type: "poster_only",
  title: "Affiche à traiter",
  description:
    "Suggestion envoyée via photo d'affiche. L'équipe admin complète les informations avant publication.",
  date: "2026-10-19T14:02:11.123",
  location_id: null,
  location_name: null,
  image_url: "https://xyz.supabase.co/storage/v1/object/public/events/poster.jpg",
  category: "AUTRE",
  price: null,
  address: null,
  capacity: null,
  door_opening_time: null,
  end_time: null,
  end_date: null,
  tag_ids: null,
  tags: null,
  external_url: null,
  organizer_names: null,
};

export const appBodies = {
  /** `NotificationApiService.registerPushToken`. */
  registerPushToken: {
    ios: { token: "fcm-token-ios", platform: "ios", deviceId: "6F1A2B3C-4D5E-6F70-8192-A3B4C5D6E7F8", appVersion: "1.0.7" },
    android: { token: "fcm-token-android", platform: "android", deviceId: "TP1A.220624.014", appVersion: "1.0.7" },
    web: { token: "fcm-token-web", platform: "web", appVersion: "1.0.7" },
  },
  /** `NotificationApiService.unregisterPushToken`. */
  unregisterPushToken: { token: "fcm-token-ios" },
  /** `NotificationApiService.notifyAdminsNewRequest`, depuis les replis de `EventService`. */
  adminNewRequest: {
    eventCreation: { requestId: REQUEST_ID, requestType: "event_creation", eventTitle: "Concert au Bouillon" },
    eventFromUrl: { requestId: URL_REQUEST_ID, requestType: "event_from_url", sourceUrl: "https://example.test/agenda" },
  },
  /** `NotificationApiService.notifyAdminsNewContentReport` (`ContentReportService.reportEvent`). */
  adminNewReport: {
    complete: {
      reportId: "rep-1",
      eventId: "evt-1",
      eventTitle: "Concert au 108",
      reasonCode: "spam",
      reasonLabel: "Spam ou arnaque",
      message: "Lien frauduleux",
      userId: "user-1",
      reportedUserId: "user-2",
      blockRequested: true,
    },
    /** Détails blancs (`"".trim()`), événement sans créateur. */
    minimal: {
      reportId: "rep-1",
      eventId: "evt-1",
      eventTitle: "Concert au 108",
      reasonCode: "other",
      reasonLabel: "Autre",
      message: "",
      userId: "user-1",
      blockRequested: false,
    },
  },
  /** `UserRequestApiService.createEventCreationRequest` et `createEventFromUrlRequest`. */
  createUserRequest: {
    complete: {
      requestType: "event_creation",
      eventData: completeEventData,
      contributorDisplayName: "Camille Martin",
      communityAttributionOptIn: true,
    },
    posterOnly: {
      requestType: "event_creation",
      eventData: posterOnlyEventData,
      contributorDisplayName: null,
      communityAttributionOptIn: false,
    },
    /** Lieu saisi à la main : `_selectedLocationId ?? ''`. */
    fromUrlTypedLocation: {
      requestType: "event_from_url",
      locationId: "",
      locationName: "Chez Paul",
      sourceUrl: "https://www.instagram.com/p/abc/",
      contributorDisplayName: "membre@example.test",
      communityAttributionOptIn: false,
    },
    fromUrlKnownLocation: {
      requestType: "event_from_url",
      locationId: "loc-1",
      locationName: "Le 108",
      sourceUrl: "https://le108.example.test/agenda",
      contributorDisplayName: null,
      communityAttributionOptIn: true,
    },
  },
  /** `AdminMobileApiService` : actions rapides (`admin_event_quick_actions_sheet.dart`). */
  adminEventAction: {
    approve: { action: "approve" },
    toggleFull: { action: "toggleFull" },
    toggleFeatured: { action: "toggleFeatured" },
    /** Date choisie dans le sélecteur : `DateTime` local, sans fuseau (heure de Paris). */
    quickEdit: {
      action: "quickEdit",
      title: "Concert au 108 (complet)",
      date: "2026-10-24T20:30:00.000",
      locationId: "loc-2",
      price: 12.5,
      externalUrl: "https://billetterie.example.test",
      externalUrlLabel: "Billetterie",
    },
    /** Date inchangée (lue en UTC), prix et liens effacés. */
    quickEditCleared: {
      action: "quickEdit",
      title: "Concert au 108",
      date: "2026-10-24T18:30:00.000Z",
      locationId: "loc-1",
      price: null,
      externalUrl: null,
      externalUrlLabel: null,
    },
  },
};

/** Ligne envoyée par le trigger SQL `notify_admins_new_request_trigger` à new-request. */
export const newRequestTriggerRow = {
  id: "33333333-3333-4333-8333-333333333333",
  request_type: "event_creation",
  event_data: { title: "Expo photo" },
  source_url: null,
  requested_at: "2026-10-19T11:00:00+00:00",
};

/** Corps de la page de test du back-office (app/(admin)/admin/notifications/test). */
export const newRequestTestPageBody = {
  requestId: "test-request-1760870400000",
  requestType: "event_creation",
  eventTitle: "Événement de test",
  sourceUrl: "https://example.com/event",
};

export const ids = { REQUEST_ID, URL_REQUEST_ID };
