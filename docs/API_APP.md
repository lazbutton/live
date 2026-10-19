# API appelée par l'app Flutter

Contrat entre l'app (`../live`) et live-admin, route par route. Source : les schémas zod de
`lib/api/app/schemas.ts`. Tests : `lib/api/app/schemas.test.mjs` (schémas) et
`lib/api/app/routes.test.mjs` (vrais handlers contre un faux Supabase et un faux OpenAI).
Fichiers Dart cités : branche `main` de l'app au 2026-10-19. Référence de l'étape Dart de la
phase 6 (`../live/docs/PLAN_REFACTO.md`) : un seul fichier de DTO aligné sur ces schémas.

Des builds de l'app sont publiés : une réponse peut gagner un champ, jamais en perdre ni en
renommer, et un corps que l'app envoie aujourd'hui doit rester accepté. Changer un schéma de
réponse casse le build (`NextResponse.json<…>` typé avec `z.infer`) ; dans ce cas, modifier
les deux repos ensemble.

## Conventions

- Appels faits par `ApiClient` (`lib/core/network/api_client.dart`) : base `ApiConfig.apiUrl`,
  JSON, `Authorization: Bearer <JWT Supabase>` sauf pour les routes publiques, timeout 30 s.
- Succès : un objet JSON (ou un corps vide). Tout autre corps donne « Réponse invalide du serveur ».
- Erreur : `{ "error": "<message>" }` (`appErrorSchema`). L'app lit `error` (à défaut `message`)
  et l'affiche tel quel, sauf en 401, toujours « Session expirée. Veuillez vous reconnecter. ».
  Certaines erreurs ajoutent `details`, `warnings` ou `issues`.
- Corps invalide : 400 `{ error, issues }` (`invalidBodyErrorSchema`), par exemple
  `Corps de la requête invalide : token : requis ; platform : doit valoir ios, android ou web`,
  avec `issues: [{ path: "token", message: "requis" }, …]`. Un corps qui n'est pas du JSON
  donne `Corps de la requête invalide : JSON attendu`.
- Champs facultatifs : absents ou `null` (l'app omet une clé avec `'clé': ?valeur`, envoie
  `null` sinon). Une clé inconnue est ignorée, sauf dans `eventData`, stocké tel quel.

## Vue d'ensemble

| Route | Appel Dart | Auth | Corps | Réponse |
| --- | --- | --- | --- | --- |
| `POST /api/notifications/register-token` | `NotificationApiService.registerPushToken` | JWT | `registerPushTokenBodySchema` | `pushTokenResponseSchema` |
| `DELETE /api/notifications/register-token` | `NotificationApiService.unregisterPushToken` | JWT | `unregisterPushTokenBodySchema` | `pushTokenResponseSchema` |
| `POST /api/notifications/admin/new-request` | `NotificationApiService.notifyAdminsNewRequest` | aucune | `adminNewRequestBodySchema` | `adminAlertResponseSchema` |
| `POST /api/notifications/admin/new-report` | `NotificationApiService.notifyAdminsNewContentReport` | aucune | `adminNewReportBodySchema` | `adminAlertResponseSchema` |
| `POST /api/user-requests` | `UserRequestApiService.createEventCreationRequest`, `createEventFromUrlRequest` | JWT | `createUserRequestBodySchema` | `createUserRequestResponseSchema` |
| `POST /api/mobile/events/extract-from-image` | `UserRequestApiService.extractEventFromImage` | JWT, compte réel | `extractFromImageFormSchema` (multipart) | `extractFromImageResponseSchema` |
| `PATCH /api/admin/mobile/events/[id]` | `AdminMobileApiService.approveEvent`, `toggleEventFull`, `toggleEventFeatured`, `quickEditEvent` | JWT admin | `adminEventActionBodySchema` | `adminEventActionResponseSchema` |

Services Dart : `lib/services/notification_api_service.dart`, `lib/services/user_request_api_service.dart`,
`lib/services/admin_mobile_api_service.dart`.

## Tokens push : `POST` et `DELETE /api/notifications/register-token`

Appelés par `PushNotificationService` (`lib/services/push_notification_service.dart`) : POST à
l'obtention du token, à son rafraîchissement et à la connexion ; DELETE seulement pour remplacer un
ancien identifiant iOS `ios_user_…` par un vrai token APNs. JWT, ou cookie de session pour le navigateur.

| Champ | Type | |
| --- | --- | --- |
| `token` | texte non vide | token FCM / APNs |
| `platform` | `ios`, `android` ou `web` | POST seulement |
| `deviceId` | texte, facultatif | absent sur le web ; vide = `null` en base |
| `appVersion` | texte, facultatif | |

DELETE n'envoie que `token`.

- 200 : `{ success: true, message }`, message « Token enregistré », « Token mis à jour » ou
  « Token supprimé ». L'app ne lit pas la réponse.
- 400 corps invalide ; 401 « Non autorisé » ; 500 erreur de base.

## Alertes admin : `POST /api/notifications/admin/new-request` et `new-report`

Routes publiques (sans JWT). L'app ne lit pas la réponse : un échec est seulement journalisé. Corps JSON ; s'il n'est pas du JSON, les mêmes champs sont lus dans les paramètres
de requête.

**new-request** : appelée par `EventService` (`lib/services/event_service.dart`) quand
`/api/user-requests` a échoué et que l'app a inséré la demande elle-même.

| Champ | Type | |
| --- | --- | --- |
| `requestId` | texte non vide, sans `{{` ni `$1` | demande relue en base |
| `requestType` | texte, facultatif | `event_creation` ou `event_from_url` ; repli si la demande n'en a pas |
| `eventTitle` | texte, facultatif | repli si `event_data.title` est vide |
| `sourceUrl` | texte, facultatif | |

Deux autres appelants : le trigger SQL `notify_admins_new_request_trigger` (pg_net), qui envoie
la ligne insérée (`id`, `request_type`, `event_data`, `source_url`, `requested_at` :
`adminNewRequestRowSchema`, utilisée sans relecture), et la page de test du back-office.

**new-report** : appelée par `ContentReportService.reportEvent`
(`lib/services/content_report_service.dart`) après l'insertion dans `content_reports`.

| Champ | Type | |
| --- | --- | --- |
| `reportId` | texte non vide | signalement relu en base |
| `eventId`, `eventTitle` | texte, facultatif | sinon lus en base |
| `reasonCode` | texte, facultatif | `abuse`, `harassment`, `hate`, `sexual`, `violence`, `spam`, `illegal`, `impersonation`, `other` |
| `reasonLabel` | texte, facultatif | sinon libellé déduit du code |
| `message` | texte, facultatif | peut être vide |
| `userId`, `reportedUserId` | texte, facultatif | |
| `blockRequested` | booléen, facultatif | sinon lu en base |

Réponse des deux routes :

- 200 : `{ success, sent, failed, errors, diagnostics, flow }`, **même si aucun admin n'a été
  notifié** (`success: false`, par exemple `errors: ["Aucun token trouvé"]`).
- 400 corps invalide ; 404 demande ou signalement introuvable (new-request ajoute `details`,
  l'erreur PostgREST) ; 500.

## Demandes : `POST /api/user-requests`

Appelée par `EventService.createEvent` et `createEventFromUrl`, via `UserRequestApiService`
(`lib/services/user_request_api_service.dart`). JWT. Si l'appel échoue, quelle qu'en soit la raison,
l'app insère la demande directement dans `user_requests` puis appelle new-request.
Il n'y a pas de route de mise à jour : l'app modifie ses demandes directement dans `user_requests`
(`EventService.updateEventFromUrlRequest`, `updateEvent`).

| Champ | Type | |
| --- | --- | --- |
| `requestType` | `event_creation` ou `event_from_url` | |
| `contributorDisplayName` | texte, facultatif | nom du compte, sinon e-mail ; `null` si inconnu |
| `communityAttributionOptIn` | booléen, facultatif | absent = `false` |

`event_creation` ajoute `eventData`, stocké tel quel dans `user_requests.event_data` (clés en
snake_case, clés inconnues conservées) :

| Champ | Type | |
| --- | --- | --- |
| `request_type` | texte | `complete` (formulaire) ou `poster_only` (affiche seule) |
| `title`, `description` | texte | |
| `date` | texte | `DateTime.toIso8601String()` : heure locale, sans fuseau |
| `category` | texte | nom en majuscules |
| `end_date` | texte, facultatif | comme `date` |
| `end_time`, `door_opening_time` | texte, facultatif | `HH:mm` |
| `price`, `capacity` | nombre, facultatif | |
| `location_id`, `location_name`, `address` | texte, facultatif | |
| `image_url`, `external_url` | texte, facultatif | |
| `tag_ids`, `tags`, `organizer_names` | liste de textes, facultatif | `tags` : noms, existants ou nouveaux |

`event_from_url` ajoute :

| Champ | Type | |
| --- | --- | --- |
| `locationId` | texte, facultatif | `""` quand le lieu a été saisi à la main (stocké `null`) |
| `locationName` | texte | vide après `trim()` : 400 |
| `sourceUrl` | texte | vide après `trim()` : 400 |

- 200 : `{ success: true, request_id, status: "pending", message, notification, flow }`.
  L'app affiche `message` après une demande « depuis une URL ».
- 400 corps invalide, lieu ou URL vides, ou insertion refusée par la base (message PostgREST brut) ;
  401 « Token d'authentification manquant » ou « Token invalide ou expiré » (avec `details`) ; 500.

## Analyse d'affiche : `POST /api/mobile/events/extract-from-image`

Appelée par le wizard de création (`EventWizardController`, via
`UserRequestApiService.extractEventFromImage`). JWT d'un compte réel ayant accepté les conditions.
Formulaire multipart : champ `image`, fichier JPEG pour l'app (`imageUrl`, URL d'une image, sert
aux autres appelants).

- 200 : `{ data, metadata, warnings }`.
  - `data` : champs lus par l'IA, tous facultatifs et éventuellement `null` : `title`,
    `description`, `date`, `end_date`, `category`, `price` et `capacity` (texte ou nombre),
    `door_opening_time`, `external_url`, `external_url_label`, `image_url`, `location`, `address`,
    `organizer`, `tags` ; d'autres clés peuvent suivre (`is_full`, `presale_price`…).
    L'app (`ImportedEventPayload.fromJson`) convertit chaque valeur en texte.
  - `metadata` : `ai_processed`, `source` (`image`), `source_image_url`, `auth_mode` (`jwt`),
    `requester_id`.
  - `warnings` : `[{ field, message, value? }]`, champs que l'IA n'a pas su lire.
- 400 formulaire invalide, image absente, fichier vide ou qui n'est pas une image ;
  401 token absent ou invalide ; 403 compte anonyme, suspendu ou conditions non acceptées ;
  413 au-delà de 12 Mo ; 422 affiche trop peu lisible (avec `warnings`) ; 500 (clé OpenAI absente,
  exception, avec `details`) ; 502 réponse de l'IA inexploitable.

## Actions rapides admin : `PATCH /api/admin/mobile/events/[id]`

Appelée par la feuille d'actions rapides (`lib/features/admin/presentation/widgets/admin_event_quick_actions_sheet.dart`),
via `AdminMobileApiService`. JWT d'un admin (`role: admin`).

| `action` | Autres champs |
| --- | --- |
| `approve` | aucun ; notifie les organisateurs |
| `toggleFull`, `toggleFeatured` | aucun |
| `quickEdit` | voir ci-dessous |

`quickEdit` : l'app envoie toujours `title`, `date` et `locationId`, et `price`, `externalUrl`,
`externalUrlLabel` (éventuellement `null`).

| Champ | Type | |
| --- | --- | --- |
| `title` | texte, facultatif | au moins 3 caractères ; `null` = inchangé |
| `date` | texte, facultatif | lu par `new Date()` ; `null` = inchangée |
| `locationId` | texte, facultatif | lieu existant ; `null` ou `""` refusés |
| `price` | nombre, facultatif | `null` efface le prix |
| `isPayWhatYouWant` | booléen, facultatif | jamais envoyé par l'app |
| `externalUrl`, `externalUrlLabel` | texte, facultatif | vide ou `null` efface |

- 200 : `{ item }`, l'événement après modification : `id`, `title`, `date`, `status`
  (`pending`, `approved`, `rejected`), `category`, `price`, `isPayWhatYouWant`, `locationId`,
  `locationName`, `locationSummary`, `address`, `imageUrl`, `externalUrl`, `externalUrlLabel`,
  `isFull`, `isFeatured`, `webPath` (page du back-office ouverte par l'app). Lu par
  `AdminMobileEventItem.fromJson`.
- 400 corps invalide ; 401 ; 403 « Accès refusé. Admin uniquement. » ; 500 (voir plus bas).

## Incohérences relevées, non corrigées

1. **Données personnelles exposées.** new-request et new-report (publiques) et `/api/user-requests`
   (tout compte) renvoient `diagnostics` : identifiant et e-mail de chaque admin, 20 premiers
   caractères de ses tokens push. Les deux premières permettent aussi à n'importe qui d'envoyer une
   notification aux admins. L'app ne lit pas ces champs : les retirer est sans risque pour elle.
2. Les alertes admin répondent 200 même quand personne n'a été notifié (`success: false`).
3. PATCH des actions rapides : les erreurs métier sortent en 500 avec leur message, au lieu de 400 ou
   404 : « Événement introuvable », « Le titre doit contenir au moins 3 caractères », « Date
   invalide », « Le lieu est requis », « Lieu introuvable », « Prix invalide », « Impossible de
   modifier le prix tant que Prix libre est activé ».
4. Dates sans fuseau. Quand l'admin choisit une date dans les actions rapides, l'app envoie l'heure
   locale sans fuseau (`2026-10-24T20:30:00.000`) ; le serveur la lit dans son propre fuseau. Sur
   un serveur en UTC (cas probable de Vercel, non vérifié), 20:30 choisi à Orléans est enregistré
   20:30 UTC, soit 22:30 à Paris. Une date laissée telle quelle part en UTC (`…Z`) et ne bouge pas.
   `eventData.date` et `end_date` des demandes ont la même forme.
5. Analyse d'affiche avec `imageUrl` : si l'image ne se charge pas, la route renvoie le statut de
   l'hôte de l'image (404, 403…). L'app n'envoie jamais `imageUrl`.
6. Si le trigger `notify_admins_new_request_trigger` est actif en prod (non vérifié), une demande
   créée par `/api/user-requests` notifie les admins deux fois : par la route, puis par le trigger.

## Comportements changés par l'ajout des schémas

Seulement pour des corps invalides, que l'app n'envoie pas :

- les 400 ont un message uniforme (« Corps de la requête invalide : … ») et un champ `issues` ;
- un corps qui n'est pas du JSON (register-token, actions rapides) ou pas un formulaire multipart
  (analyse d'affiche) donne 400 au lieu de 500, de même qu'un `locationName` absent dans
  user-requests ;
- un champ du mauvais type donne 400 : avant, il était ignoré (`price: "12"` dans quickEdit
  renvoyait 200 sans rien changer) ou recopié tel quel (`eventData.title: 42`) ;
- un corps JSON `null` envoyé aux alertes admin donne 400 (ou utilise les paramètres de requête)
  au lieu de 500.

Vérifié le 2026-10-19 : 77 appels rejoués sur les handlers d'origine et sur les nouveaux (faux
Supabase, `TZ=UTC`). 50 donnent exactement le même statut, le même corps et les mêmes requêtes à la
base, dont tous les corps envoyés par l'app ; les 27 autres sont des corps invalides, dans les cas
ci-dessus.

## Routes gardées pour les anciennes versions de l'app

Plus appelées par l'app actuelle (admin embarquée retirée), gardées pour les builds publiés ; ni
décrites ici, ni à modifier :

- `GET /api/admin/mobile/summary`, `GET /api/admin/mobile/events`, `GET /api/admin/mobile/events/[id]`
- `GET /api/admin/mobile/requests`, `PATCH /api/admin/mobile/requests/[id]`,
  `POST /api/admin/mobile/requests/[id]/convert`
- `POST /api/notifications/send-test`, `POST /api/notifications/send` (repli de `send-test`)
- `POST /api/notifications/admin/new-feedback`
- `POST /api/notion/resync`

Docs plus anciennes sur ces routes, antérieures à ce contrat : `MOBILE_NOTIFICATIONS_API.md`,
`ADMIN_NOTIFICATIONS_NEW_REQUESTS.md`.
