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
- Dates d'événement : `events.date` et `end_date` contiennent l'**heure de Paris étiquetée UTC**
  (un concert à 20:30 est stocké `…T20:30:00+00:00`). Le formulaire du back-office l'écrit ainsi
  (`fromDatetimeLocal`), le scraping aussi, et l'app l'affiche sans conversion (`event.date.hour`
  d'un `DateTime` UTC, sans `toLocal()`). Ce n'est donc pas un instant : convertir l'heure de Paris
  en vrai UTC (`toUtc()`, `zonedTimeToUtc`) décale l'affichage de 1 à 2 h. Une date que l'app envoie
  sans fuseau (`DateTime.toIso8601String()` d'une heure choisie, `2026-10-24T20:30:00.000`) est
  cette heure murale. L'analyse d'affiche rend ses dates de la même façon, sans fuseau
  (`2026-10-24T20:30:00`).

## Vue d'ensemble

| Route | Appel Dart | Auth | Corps | Réponse |
| --- | --- | --- | --- | --- |
| `POST /api/notifications/register-token` | `NotificationApiService.registerPushToken` | JWT | `registerPushTokenBodySchema` | `pushTokenResponseSchema` |
| `DELETE /api/notifications/register-token` | `NotificationApiService.unregisterPushToken` | JWT | `unregisterPushTokenBodySchema` | `pushTokenResponseSchema` |
| `POST /api/notifications/admin/new-request` | `NotificationApiService.notifyAdminsNewRequest` | aucune | `adminNewRequestBodySchema` | `adminAlertResponseSchema` |
| `POST /api/notifications/admin/new-report` | `NotificationApiService.notifyAdminsNewContentReport` | aucune | `adminNewReportBodySchema` | `adminAlertResponseSchema` |
| `POST /api/user-requests` | `UserRequestApiService.createEventCreationRequest`, `createEventFromUrlRequest` | JWT | `createUserRequestBodySchema` | `createUserRequestResponseSchema` |
| `POST /api/mobile/events/extract-from-image` | `UserRequestApiService.extractEventFromImage` | JWT, session invitée ou compte, plafond par jour | `extractFromImageFormSchema` (multipart) | `extractFromImageResponseSchema` |
| `PATCH /api/admin/mobile/events/[id]` | `AdminMobileApiService.approveEvent`, `toggleEventFull`, `toggleEventFeatured`, `quickEditEvent` | JWT admin | `adminEventActionBodySchema` | `adminEventActionResponseSchema` |
| `GET /api/v1/radio/[stationId]/live` | à venir (`lib/features/radio/`) | aucune, et sans `Authorization` (cache CDN) | aucun | `radioLiveResponseSchema` (`lib/api/v1/radio/schemas.ts`) |

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
de requête. Publiques : leurs réponses ne contiennent aucune donnée sur les admins (ni identifiant,
ni e-mail, ni token) ; le détail par admin ne va que dans les journaux du serveur.

**new-request** : appelée par `EventService` (`lib/services/event_service.dart`) quand
`/api/user-requests` a échoué et que l'app a inséré la demande elle-même.

| Champ | Type | |
| --- | --- | --- |
| `requestId` | texte non vide, sans `{{` ni `$1` | demande relue en base |
| `requestType` | texte, facultatif | `event_creation` ou `event_from_url` ; ignoré |
| `eventTitle` | texte, facultatif | ignoré |
| `sourceUrl` | texte, facultatif | ignoré |

Autre appelant : la page de test du back-office.

Seul `requestId` sert : la demande est relue dans `user_requests` et le texte de la notification
vient d'elle (`event_data.title`, `request_type`), jamais du corps. Pour l'app, c'est sans effet :
elle envoie le titre et le type déjà enregistrés.

**new-report** : appelée par `ContentReportService.reportEvent`
(`lib/services/content_report_service.dart`) après l'insertion dans `content_reports`.

| Champ | Type | |
| --- | --- | --- |
| `reportId` | texte non vide | signalement relu en base |
| `eventId`, `eventTitle` | texte, facultatif | ignorés |
| `reasonCode` | texte, facultatif | `abuse`, `harassment`, `hate`, `sexual`, `violence`, `spam`, `illegal`, `impersonation`, `other` ; ignoré |
| `reasonLabel` | texte, facultatif | ignoré |
| `message` | texte, facultatif | peut être vide ; ignoré |
| `userId`, `reportedUserId` | texte, facultatif | ignorés |
| `blockRequested` | booléen, facultatif | ignoré |

Seul `reportId` sert : le signalement est relu dans `content_reports`, le titre de son événement
dans `events`, et la notification vient d'eux (libellé du motif d'après `reason_code`, `details`,
`block_requested`, `reporter_user_id`, `reported_user_id`), jamais du corps. Pour l'app, c'est sans
effet : elle envoie les valeurs qu'elle vient d'enregistrer, avec les mêmes libellés de motif.

Réponse des deux routes :

- 200 : `{ success, sent, failed, errors, flow }`, **même si aucun admin n'a été
  notifié** (`success: false`, par exemple `errors: ["Aucun token trouvé"]`). `errors` : un message
  par échec, sans l'admin concerné (`Token iOS invalide: …`, `Plateforme non supportée: web`,
  `Envoi ios: Token invalide: BadDeviceToken`).
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
| `date` | texte | `DateTime.toIso8601String()` : heure choisie (heure de Paris), sans fuseau |
| `category` | texte | nom en majuscules |
| `end_date` | texte, facultatif | comme `date` |
| `end_time`, `door_opening_time` | texte, facultatif | `HH:mm` |
| `price`, `capacity` | nombre, facultatif | |
| `location_id`, `location_name`, `address` | texte, facultatif | |
| `image_url`, `external_url` | texte, facultatif | |
| `tag_ids`, `tags`, `organizer_names` | liste de textes, facultatif | `tags` : noms, existants ou nouveaux |

À la conversion en événement, `date` et `end_date` restent l'heure murale : la fonction SQL
`convert_event_request_to_event` (back-office, ancienne route de conversion) les lit en
`::timestamptz` dans la session PostgREST, en UTC (les dates en sortent en `+00:00`), et le
formulaire du back-office les reprend par `toDatetimeLocal` (heures et minutes gardées, fuseau
ignoré). Une date sans fuseau à 20:30 donne un événement à 20:30, y compris celle que l'analyse
d'affiche a préremplie (avant le 2026-10-21, elle pouvait arriver en vrai UTC : incohérence 4).

`event_from_url` ajoute :

| Champ | Type | |
| --- | --- | --- |
| `locationId` | texte, facultatif | `""` quand le lieu a été saisi à la main (stocké `null`) |
| `locationName` | texte | vide après `trim()` : 400 |
| `sourceUrl` | texte | vide après `trim()` : 400 |

- 200 : `{ success: true, request_id, status: "pending", message, notification, flow }`.
  L'app affiche `message` après une demande « depuis une URL ». `notification` :
  `{ success, sent, failed, errors }`, comme les alertes admin, sans donnée sur les admins.
- 400 corps invalide, lieu ou URL vides, ou insertion refusée par la base (message PostgREST brut) ;
  401 « Token d'authentification manquant » ou « Token invalide ou expiré » (avec `details`) ; 500.

## Analyse d'affiche : `POST /api/mobile/events/extract-from-image`

Appelée par le wizard de création (`EventWizardController`, via
`UserRequestApiService.extractEventFromImage`). JWT de toute session de l'app, invitée (anonyme)
comprise, sauf un compte suspendu : depuis le 2026-10-21, « Proposer un événement » s'ouvre sans
compte (`../live/docs/AMELIORATIONS.md`, § 5 et partie E, point 6) ; le compte et les conditions
ne sont demandés qu'à l'envoi (`/api/user-requests`). Avant, un compte réel ayant accepté les
conditions.
Formulaire multipart : champ `image`, fichier JPEG pour l'app (`imageUrl`, URL d'une image, sert
aux autres appelants).

**Plafond par jour** (heure de Paris), compté en base par `take_poster_analysis()` (table
`poster_analysis_usage` : l'id de la session et le nombre d'analyses du jour, rien au-delà de la veille ;
migration `20261021200000_create_poster_analysis_quota.sql`) : 10 analyses par session, invitée ou compte,
et 200 pour l'ensemble des sessions invitées (une session invitée ne coûte rien à créer : ce total borne
la dépense) ; `lib/events/poster-analysis-quota.ts`. L'analyse est réservée juste avant l'appel à l'IA :
un formulaire refusé ne compte pas, un échec de l'IA si. Au-delà : 429 « Tu as fait lire beaucoup
d'affiches aujourd'hui. Remplis les infos à la main, ou réessaie demain. ». Si le compteur ne répond pas
(migration pas encore appliquée, base injoignable) : une session invitée reçoit 403 (« Connecte-toi pour
faire lire l'affiche. », comme avant), un compte est lu sans plafond.

- 200 : `{ data, metadata, warnings }`.
  - `data` : champs lus par l'IA, tous facultatifs et éventuellement `null` : `title`,
    `description`, `date`, `end_date`, `category`, `price` et `capacity` (texte ou nombre),
    `door_opening_time`, `external_url`, `external_url_label`, `image_url`, `location`, `address`,
    `organizer`, `tags` ; d'autres clés peuvent suivre (`is_full`, `presale_price`, et depuis les festivals
    `festival_name`, le festival dont l'événement fait partie, et `festival_venues`, une liste : les lieux
    que nomme le texte d'un festival). L'app (`ImportedEventPayload.fromJson`) lit les clés qu'elle
    connaît et convertit chaque valeur en texte ; les autres sont ignorées.
    `date` et `end_date` : heure de Paris sans fuseau (`2026-10-24T20:30:00`), comme les dates que
    l'app envoie. L'assistant la lit telle quelle (`DateTime.tryParse`, 20:30) et la renvoie dans
    `eventData.date` (`…T20:30:00.000`) : l'événement est créé à 20:30. Une date écrite en toutes
    lettres (« samedi 24 octobre 20h30 ») est lue comme au scraping (`toParisWallClock`,
    `lib/scraping/dates.ts`) ; le fuseau qu'ajoute l'IA à une date ISO (`Z`, `+02:00`, `+01:00` à
    tort en été) est ignoré, l'heure écrite gardée : une affiche n'en porte pas. Date sans heure :
    `…T00:00:00`, avec `time_known: false` (heure à vérifier ; le back-office avertit). Texte qui
    ne se lit pas comme une date : renvoyé tel quel. Même règle pour le back-office
    (`/api/events/extract-from-image`) et l'API v1, qui partagent `extractEventFromImage`.
  - `metadata` : `ai_processed`, `source` (`image`), `source_image_url`, `auth_mode` (`jwt`),
    `requester_id`.
  - `warnings` : `[{ field, message, value? }]`, champs que l'IA n'a pas su lire.
- 400 formulaire invalide, image absente, fichier vide ou qui n'est pas une image ;
  401 token absent ou invalide ; 403 compte suspendu, ou session invitée sans compteur (voir
  plus haut) ; 413 au-delà de 12 Mo ; 422 affiche trop peu lisible (avec `warnings`) ; 429 plafond
  du jour atteint ; 500 (clé OpenAI absente, exception, avec `details`) ; 502 réponse de l'IA
  inexploitable.

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
| `date` | texte, facultatif | sans fuseau : heure de Paris, enregistrée telle quelle (`…T20:30:00.000` → `20:30:00+00`) ; avec `Z` ou un décalage : instant gardé tel quel ; `null` = inchangée |
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

## Événements lus dans Supabase : vignettes des affiches

L'app lit les événements directement dans Supabase (`rpc/app_events`, `events`), avec la liste de
colonnes `_eventColumns` (`lib/services/event_service.dart`). Depuis la migration
`20261019190000_add_event_image_cards.sql`, `events` (donc `app_events()`, qui rend `setof events`)
a quatre colonnes de plus pour l'app, plus `image_card_error` (diagnostic de l'admin) :

| Colonne | Type | |
| --- | --- | --- |
| `image_card_url` | texte ou `null` | vignette WebP de `image_url`, 1 200 px de large au plus (800 px avant le 2026-10-21) |
| `image_width`, `image_height` | entier ou `null` | dimensions de l'original (orientation EXIF appliquée), aussi le ratio de la vignette |
| `image_color` | texte ou `null` | couleur dominante, `#rrggbb` |

`null` tant que la vignette n'est pas faite (quelques secondes après l'enregistrement, au plus un
jour) : garder `image_url`. Quand `image_card_url` est remplie, les trois autres le sont aussi.
L'app actuelle ne sélectionne pas ces colonnes : ce qu'elle reçoit ne change pas. Elles seront lues
à l'étape C7b de `../live/docs/PLAN_REFONTE.md`. Fabrication et garanties : `EVENT_IMAGE_CARDS.md`.

## Genre de prix : `events.price_kind`

Colonne générée par la base (migration `20261020100000_add_price_kind_to_events.sql`), donc aussi dans
`rpc/app_events` et `rpc/app_events_in_range`, à ajouter à `_eventColumns` pour la lire. Seule source de
la règle « gratuit » / « non renseigné » : l'app et l'admin ne la recalculent pas.

| `price_kind` | Quand | À afficher |
| --- | --- | --- |
| `pay_what_you_want` | `is_pay_what_you_want` | « Prix libre » |
| `free` | tous les prix connus valent 0 | « Gratuit » |
| `paid` | un prix connu au-dessus de 0 (fourchette « 0 à 5 € » comprise) | le montant : `price_min`, ou « `price_min` à `price_max` » ; à défaut `price` |
| `unknown` | aucun prix connu (`price_min`, `price_max` et `price` nuls) | rien |

Prix connus : `price_min` et `price_max`, à défaut `price` ; une valeur négative ne compte pas. Jamais
`null` sur une ligne. Instantané du 2026-10-19 (393 événements publiés) : `paid` 184, `unknown` 154,
`free` 33, `pay_what_you_want` 22. La colonne ne s'écrit pas (PostgREST répond 400, code `428C9`) :
l'app continue d'envoyer `price` (et l'admin `price`, `price_min`, `price_max`, `is_pay_what_you_want`).

## Photos d'artistes : `artists.image_credit`, `image_license`, `image_source_url`

Depuis la migration `20261021160000_add_artist_image_credit.sql`, une photo d'artiste peut venir de
Wikimedia Commons, sous licence libre. Ses trois colonnes de crédit sont à ajouter au select de l'app :

| Colonne | Type | |
| --- | --- | --- |
| `image_credit` | texte ou `null` | auteur de `image_url` |
| `image_license` | texte ou `null` | « CC BY-SA 4.0 », « CC BY 2.0 », « CC0 », « Domaine public »… |
| `image_source_url` | texte ou `null` | page du fichier sur Commons |

Quand `image_credit` est rempli, l'afficher avec la photo, partout où elle paraît : « Photo : <auteur>,
<licence> », l'auteur ouvrant `image_source_url`. Les licences CC BY et CC BY-SA l'exigent. `null` : rien à
afficher. Le crédit suit toujours la photo de sa ligne (remis à `null` par la base quand `image_url` change).
L'app actuelle ne sélectionne pas ces colonnes : tant qu'elle ne les affiche pas, seules des photos CC0 ou du
domaine public sont posées. Règles et script : `ARTIST_PHOTOS.md`.

## La zone : `app_zone`, `app_events_in_zone`, `app_zone_counts`, `app_cities`

« Ville et rayon » de l'app (`../live/docs/VILLES.md`, décisions du 2026-10-21) : une ville et un rayon, une
seule règle en SQL pour la liste, les comptes, la recherche, la carte et « À voir aussi ». Migration
`20261021220000_create_app_zone.sql` (règle complète en tête), tests `supabase/tests/app_zone.test.sql`.

- **La règle** (`app_in_zone`) : un événement est dans la zone s'il est dans la ville choisie (sa ville, à
  défaut celle de son lieu, est une ville de son groupe : « 45000 Orléans » = « Orléans »), ou si son lieu, à
  défaut l'événement lui-même, est à `zone_km` km ou moins (vol d'oiseau, `app_distance_km`) du centre de cette
  ville (moyenne des centres du groupe). « Orléans · 5 km » montre donc tout Orléans, La Source comprise.
- **`zone_city`** : l'id ou le slug d'une ville active (`app_cities().slug` ; « orleans » sans rien avoir lu),
  casse et espaces ignorés. Nul ou inconnu : pas de zone, toutes les villes. **`zone_km`** : le rayon ; nul :
  la ville seule.
- Les fonctions du tableau plus haut la prennent en arguments nommés, à la fin ; l'accueil « Toutes les dates »
  et « À la une » lisent `app_events_in_zone` à la place d'`app_events()` :

| Objet | Appel Dart | Rend |
| --- | --- | --- |
| `app_events_in_zone(zone_city, zone_km)` | `rpc('app_events_in_zone', params: …, get: true)` + filtres, `select`, tri | lignes de `events` dans la zone, toutes dates (`setof events`, comme `app_events()`) |
| `app_major_events_in_zone(zone_city, zone_km)` | `rpc('app_major_events_in_zone', params: …, get: true)` + `eq('status', 'approved')`, `select`, tri | grands événements de la zone : leur ville ou leur centre sur la carte, l'un de leurs lieux ou de leurs événements |
| `app_zone_counts(zone_city, radii, at_time)` | `rpc('app_zone_counts', params: {'zone_city': …, 'radii': [5, 10, 25, 50]}, get: true)` | une ligne par rayon, dans l'ordre : `radius_km`, `events_count` (à venir comme l'accueil sur « Tout » : à partir d'aujourd'hui, sans `hide_from_home`, sans la fiche d'un festival qui a un programme, migration `20261023170000`) |
| `app_cities(at_time)` | `rpc('app_cities', get: true)` + `select(…)` | les villes qui ont un centre et des événements : `id`, `slug`, `label`, centre, alias, `source_ids`, `upcoming_events_count` (comme `app_zone_counts`), `recent_events_count` (commencés dans les 120 derniers jours), `next_event_date`, `last_event_date` |
| `app_zone(zone_city, zone_km)`, `app_in_zone(…)`, `app_city_groups()`, `app_distance_km(…)` | aucun | la règle, partagée par les fonctions ci-dessus |

`app_cities` ne rend plus les villes sans centre ni événement (le 2026-10-21 : Paris, Joué-lès-Tours, une
adresse prise pour une ville…) ; ses comptes à venir suivent `app_events_in_range` (heure de Paris, sans
`hide_from_home`) au lieu de leur ancienne fenêtre (minuit UTC, 365 jours). Les versions installées de l'app
la lisent comme avant (une colonne de plus).

## Festivals : `events.festival_id`, `festival_locations`, `app_festival_events`

Décision du 2026-10-23 (`../live/docs/FESTIVALS.md`, § 4 et 5) : un festival est un événement de la catégorie
Festival qui contient les autres ; sa page dans l'app est sa fiche en mode festival. Migration
`20261023120000_create_festivals.sql` (règle complète en tête), tests `supabase/tests/festivals.test.sql`. En prod
depuis le 2026-10-23 à 14:27, avec le premier festival : Fulgurances Électroniques #2 (Micro et Infra, ses trois
lieux).

- **`events.festival_id`** (uuid ou null) : le festival dont l'événement fait partie. `rpc/app_events`,
  `app_events_in_range` et `app_events_in_zone` le rendent avec les autres colonnes (`setof events`) : à ajouter
  à `_eventColumns`. Jamais l'événement lui-même ; un festival n'est pas dans un festival (un événement rattaché
  ne contient rien) ; le festival supprimé, ses événements restent, détachés.
- **`festival_locations`** : `id`, `festival_id`, `location_id`, `sort_index` (0 d'abord), un lieu une fois par
  festival. Lisible quand le festival l'est (la RLS d'`events` : le public, les festivals approuvés), écrite par
  l'admin. La fiche du festival garde le premier dans `location_id`, pour ce qui n'en lit qu'un (la zone
  comprise). Clé `id`, pas `(festival_id, location_id)` : PostgREST y verrait une relation plusieurs-à-plusieurs
  `events` ↔ `locations`, et tout `locations(…)` embarqué depuis `events` répondrait 400 (PGRST201).
- **Embarquer** (essayé sur PostgREST v13.0.5, la version de la prod, et v14.1) : le festival d'un événement,
  `festival:festival_id(id, title, …)` (un objet, ou null) ; son programme, `events!festival_id(…)` (une liste ;
  `events!events_festival_id_fkey` ne marche pas, PGRST200) ; ses lieux, `festival_locations(sort_index,
  locations(…))`.
- **`app_festival_events(at_time)`** → `(event_id, festival_id, date, events_count)` : une ligne par événement
  à venir rattaché à un festival visible, sur le modèle d'`app_event_series`. À venir comme
  `app_events_in_range` à partir d'aujourd'hui 0 h (heure de Paris), toutes villes, avec `hide_from_home`, sans
  les événements masqués par l'utilisateur ni ceux des auteurs qu'il a bloqués. Le festival doit être visible lui
  aussi (dans `app_events()`, ni masqué par l'utilisateur, ni d'un auteur bloqué ; ses dates ne comptent pas) :
  sinon l'événement n'a pas de ligne et reste seul. `events_count` : ses événements à venir (les lignes de son
  festival), l'événement compris ; le festival lui-même n'a pas de ligne. Rendues par festival (sa première date
  à venir), puis par date. L'accueil groupe ses cartes par `festival_id` et compte avec ; lue une fois, toutes
  villes, comme les séries.
- **La zone** ne change pas : un festival y entre par son `location_id` (son premier lieu), comme tout événement,
  et ses événements chacun par le leur. La liste de l'accueil (`app_events_in_zone`) et les comptes
  (`app_events_in_range`) disent ainsi la même chose ; un événement du festival situé dans la zone y entre de
  toute façon.

Étape 4 (§ 6), migration `20261023160000_add_festival_follows_and_see_also.sql`, tests
`supabase/tests/festival_follows_see_also.test.sql` ; en prod depuis le 2026-10-23 à 16:01. Mêmes signatures, rien
à changer dans l'app pour la lire :

- **`events.festival_added_at`** (instant ou null) : l'instant où l'événement est entré au programme de son
  festival (rattaché, ou passé à un autre festival) ; null hors festival. Tenue par la base seule (déclencheur,
  comme `published_at` : une valeur envoyée est ignorée). Sert au message des suivis ; l'app n'a pas à la lire
  (une colonne de plus pour `select=*`). Micro et Infra, rattachés avant la migration, l'ont nulle.
- **« À voir aussi »** (`app_see_also`) ne propose plus rien du même festival : sur la fiche d'un événement du
  festival, ni les autres événements du festival, ni le festival ; sur la fiche du festival, aucun de ses
  événements (« Au même festival » et le programme les montrent). Deux événements sont du même festival quand
  leur festival, à défaut eux-mêmes, est le même. `source_events_count` reste le nombre de la page du lieu ou de
  l'organisateur. Rien ne change pour un événement hors festival.
- **Un cœur sur un festival** (`event_likes`, sur sa fiche) vaut suivi de son programme : le message des suivis
  annonce ce qui y entre (« Suivis », plus bas).
- **Les nombres sur « Tout »** (migration `20261023170000_count_festival_programmes.sql`, tests
  `supabase/tests/festival_counts.test.sql`, en prod depuis le 2026-10-23 à 16:02) : comme l'accueil de l'app
  (`EventsListPageData.build` : un festival y est une carte, ses événements dedans), la fiche d'un festival qui a
  un programme, c'est-à-dire au moins une ligne dans `app_festival_events` pour l'utilisateur, ne compte pas ; ses
  événements comptent, chacun à sa date. Une fiche sans programme compte comme avant. `app_event_counts` sur
  « Tout » (category vide : calendrier « Quand ? », points de densité, raccourcis, suite d'une liste courte,
  « Élargir »), `app_zone_counts` et `upcoming_events_count` d'`app_cities` ; sur une page de catégorie (la page
  « Festival » comprise), rien n'est retiré. Les listes (`app_events_in_range`, `app_events_in_zone`) gardent la
  fiche. Pas encore touchés : les comptes d'un lieu, d'un organisateur, d'un tag, de la recherche
  (`app_organizer_counts`, `app_tag_counts`, `app_search_names`), où l'app ne regroupe pas encore les
  festivals. Mêmes signatures.
- **La collecte** (admin et agent) lit le nom du festival sur l'affiche ou la page : l'événement est rattaché
  au festival de ce nom (à défaut, à celui que nomme son titre) quand il est dans l'app et que ses dates couvrent
  celle de l'événement ; sinon l'équipe est prévenue (« Fait partie d'un festival qui n'est pas dans l'app : … »). Pour un festival, les lieux que nomme
  son texte deviennent ses lieux. La catégorie Festival (`onSortCategory`, On sort !) ne va qu'à ce qui dure
  plus d'un jour ; une séance d'un jour rangée en Festival n'est pas un festival pour l'import (rien ne s'y
  rattache, ses doublons sont repérés comme ceux de tout événement).

```dart
final rows = await supabase
    .rpc('app_festival_events', get: true)
    .select('event_id, festival_id, date, events_count') as List<dynamic>;
// [{"event_id":"84f9…","festival_id":"5ea7…","date":"2026-11-19T21:00:00+00:00","events_count":2}, …]

final festival = await supabase
    .from('events')
    .select('id, title, festival_locations(sort_index, locations(id, name, latitude, longitude))')
    .eq('id', festivalId)
    .single();
```

Sur PostgREST v13.0.5 (la version de la prod), la migration appliquée : les `select` de l'app (`EventSelects`
`detail`, `card`, `list`, les favoris, la page d'artiste, « Mes suggestions ») sur `events`, `rpc/app_events`,
`rpc/app_events_in_range` et `rpc/app_events_in_zone` répondent comme avant ; aucun embarquement depuis ou vers
`events` et `locations` ne devient ambigu. En prod, en anon par l'API publique, le 2026-10-23 :
`rpc/app_festival_events` rend Micro et Infra (`events_count` 2) en 3 à 23 ms ; les cartes de l'accueil et les
comptes sont les mêmes qu'avant la migration (la zone d'Orléans · 25 km : 391 événements).

## Fonctions SQL de la refonte : calendrier, vacances scolaires, recherche

Pour le calendrier « Quand ? » et la recherche des maquettes (`../live/docs/MAQUETTES_REFONTE.md`),
l'app lit ces comptes dans Supabase au lieu de les calculer en Dart. Migrations :
`20261019210000_create_app_events_in_range_and_counts.sql` (règle complète en tête),
`20261019211000_create_school_holidays.sql`, `20261019212000_create_app_search_counts.sql`, pour la
fiche `20261020140000_create_app_organizer_counts.sql` et `20261021110000_create_app_see_also.sql`
(« À voir aussi »), et pour la recherche plein texte `20261020170000_create_app_search.sql` puis
`20261020210000_speed_up_app_search.sql` ; filtres « Gratuit » et « En famille » :
`20261021160000_add_free_family_filters.sql` ; séries (U14, et leur règle dans « À voir aussi ») :
`20261021170000_create_app_event_series.sql`. Tests :
`supabase/tests/*.test.sql` (`npm run db:test`) et `lib/school-holidays/official-calendar.test.mjs`. Toutes
sont en prod depuis le 2026-10-20 (`app_see_also` depuis le 2026-10-21, `app_event_series` depuis le
2026-10-21 à 18:04), et `school_holidays` est
chargée (64 périodes) ; détail : `supabase/migrations/MIGRATIONS_LOG.md`. Pour « Proposer » :
`20261021200000_create_poster_analysis_quota.sql` et `20261021201000_create_app_possible_duplicates.sql`, en
prod depuis le 2026-10-21 vers 18:32.

| Objet | Appel Dart | Rend |
| --- | --- | --- |
| `app_event_counts(ranges, city_ids, category, at_time, free, family, zone_city, zone_km)` | `rpc('app_event_counts', params: …)` | une ligne par plage : `events_count`, `starting_count` |
| `app_events_in_range(range_start, range_end, city_ids, category, at_time, free, family, zone_city, zone_km)` | `rpc('app_events_in_range', params: …)` + filtres, `select`, tri, pagination | lignes de `events` (`setof events`, comme `app_events()`) |
| table `school_holidays` | `from('school_holidays').select(…)` | périodes de vacances : `name`, `first_day`, `last_day` |
| `app_category_counts(city_ids, at_time, zone_city, zone_km)` | `rpc('app_category_counts', params: …)` | catégories actives et leur nombre d'événements à venir |
| `app_tag_counts(city_ids, max_tags, at_time, zone_city, zone_km)` | `rpc('app_tag_counts', params: …)` | tags populaires et leur nombre d'événements à venir |
| `app_organizer_counts(organizer_ids, city_ids, at_time, zone_city, zone_km)` | `rpc('app_organizer_counts', params: …)` | nombre d'événements à venir de chaque organisateur (fiche, « Organisé par ») |
| `app_see_also(event_id, city_ids, at_time, max_results, zone_city, zone_km)` | `rpc('app_see_also', params: …)` + `select('section, rank, …, event:events(…)')`, `order('rank')` | « À voir aussi » en bas de la fiche : les rangées « Aussi à <lieu> » et « Dans le même genre » |
| `app_event_series(at_time)` | `rpc('app_event_series', get: true)` + `select('event_id, series_id, date, dates_count')` | les séries à venir (dates d'un même spectacle) : une carte par série sur l'accueil, « Autres dates » sur la fiche |
| `app_festival_events(at_time)` | `rpc('app_festival_events', get: true)` + `select('event_id, festival_id, date, events_count')` | les événements à venir rattachés à un festival visible : une carte par festival sur l'accueil (« Festivals », plus haut) |
| `app_search(query, city_ids, at_time, max_results, zone_city, zone_km)` | `rpc('app_search', params: …)` + `select('rank, event:events(…)')`, `order('rank')` | événements à venir qui correspondent à la requête, par pertinence puis date |
| `app_possible_duplicates(title, starts_at, location_id, link, at_time, max_results)` | `rpc('app_possible_duplicates', params: …)` + `select('rank, reason, event:events(…)')`, `order('rank')` | « Cet événement existe peut-être déjà » avant l'envoi d'une proposition : les événements à venir qui lui ressemblent |
| `app_search_names(query, city_ids, at_time, max_results, zone_city, zone_km)` | `rpc('app_search_names', params: …)` + `order('rank')` | catégories, tags, lieux et organisateurs dont le nom correspond, avec leur nombre d'événements à venir |
| `app_event_in_range(…)` | aucun | la règle d'appartenance à une plage, partagée par les fonctions ci-dessus |

Appels en POST (`supabase.rpc` par défaut), arguments par leur nom ; un argument omis prend sa valeur
par défaut. Une valeur illisible donne un 400 de PostgREST (`{"code":"22007","message":"invalid input
syntax for type timestamp: …"}`). Vérifié le 2026-10-19 avec PostgREST v13.0.5 (la version de la
prod) sur une base locale chargée de l'instantané prod : ci-dessous, les comptes de cet instantané.

### Conventions communes

- **Dates** : heure de Paris, comme `events.date` (voir les conventions plus haut). Les bornes sont
  des `timestamp` sans fuseau : un décalage envoyé est ignoré. `DateTime(2026, 10, 23).toIso8601String()`
  (`2026-10-23T00:00:00.000`) et `DateTime.utc(2026, 10, 23).toIso8601String()` (`…Z`) donnent la
  même borne ; `toUtc()` la décalerait de 1 à 2 h. Les bornes rendues (`range_start`, `range_end`)
  sont sans fuseau (`2026-10-23T00:00:00`).
- **Maintenant** : l'heure de Paris du serveur. `at_time` (même format) le remplace, pour les tests
  et les scénarios ; l'app ne l'envoie pas.
- **Zone** (`zone_city`, `zone_km`, depuis la migration `20261021220000`) : la ville choisie et le rayon ; règle
  et appels dans « La zone » plus bas. Sans zone : toutes les villes.
- **Ancien périmètre** (`city_ids`), gardé pour les versions de l'app déjà installées : les ids qu'elles
  envoient (`CityPreferencesController.effectiveCityIds`), comparés à `events.city_id`, à défaut à la ville du
  lieu. `null` ou `[]` : toutes les villes. Avec une zone en plus, les deux s'appliquent.
- **Par utilisateur** : avec une session (anonyme comprise), sans les événements qu'il a masqués
  (`user_hidden_events`) ni ceux des auteurs qu'il a bloqués (`blocked_users`), comme les filtres
  Dart de l'accueil. Sans session : rien n'est retiré.
- **Catégorie** (`category`) : son id ou son nom, sans tenir compte de la casse (« Spectacle »,
  « SPECTACLE » ou l'uuid). `events.category` contient un id, ou pour quelques lignes anciennes un nom
  (2 « Concert » en prod) : les deux comptent, comme le filtre de catégorie de l'app. `null` ou vide : Tout.

### Règle d'appartenance à une plage

Une plage est `[début, fin)`. Un événement en fait partie :

1. s'il y commence (`début <= date < fin`) ;
2. ou s'il dure plus de 12 h (13 h ou plus : `Duration.inHours > 12` de l'app) et a commencé avant
   sans être fini au début de la plage. Un concert 20:30 → 02:30 n'appartient qu'à son jour de début ;
   une exposition de trois semaines, à chacun de ses jours ;
3. et s'il n'est pas terminé : `end_date` passée, ou sans `end_date` le lendemain 0 h de son début
   (« reste affiché toute la journée », décision 1 des maquettes). Ne joue que sur la plage du jour.

C'est la liste de l'accueil (requête de `EventService._getApprovedEventsFromNetwork` puis filtre de
période de `EventsListLogic`), à trois écarts près, assumés : l'app compare la fin à l'instant UTC
(1 à 2 h trop tôt) ; elle ne filtre que les événements chargés, au plus 200 par plage (limite
atteinte sur « Tout ») plus son cache ; ces fonctions portent sur toute la base.

### `app_event_counts` : comptes du calendrier

```sql
app_event_counts(ranges jsonb, city_ids uuid[] = null, category text = null, at_time timestamp = null,
                 free boolean = false, family boolean = false)
  returns table (range_index integer, range_key text, range_start timestamp, range_end timestamp,
                 events_count integer, starting_count integer)
```

`ranges` : un tableau de plages `{"start": …, "end": …, "key": …}` (`key` facultative, texte libre
rendu tel quel ; `start` ou `end` absents : sans borne). Au plus 500 plages par appel, les suivantes
sont ignorées. Une ligne par plage, dans l'ordre reçu, même vide (0) ; `range_index` part de 0.

- `events_count` : les événements de la plage selon la règle ci-dessus, chacun une fois (un
  week-end compte une fois l'exposition qui le couvre), sans `hide_from_home` sur Tout. C'est le
  nombre de lignes que rend `app_events_in_range` pour la même plage (avec `hide_from_home=is.false`
  sur Tout) : le « Voir les N événements » d'une liste qui montre aussi les expositions en cours. Sur
  Tout, la fiche d'un festival qui a un programme ne compte pas (migration `20261023170000`, « Festivals »).
- `starting_count` : ceux qui commencent dans la plage (règle 1 seule). Ce sont les comptes des
  maquettes ; la liste correspondante ajoute le filtre `date >= début`.

Points de densité (maquettes) : 1 point pour 1 ou 2 événements, 2 pour 3 à 5, 3 pour 6 et plus.

```dart
/// Heure murale sans fuseau (« 2026-10-23T00:00:00.000 »).
String wall(DateTime d) =>
    DateTime(d.year, d.month, d.day, d.hour, d.minute).toIso8601String();
/// Minuit du jour [offset] (DateTime(y, m, d + n), pas add(Duration) : 23 ou 25 h aux changements d'heure).
DateTime day(int offset) => DateTime(now.year, now.month, now.day + offset);

final ranges = [
  for (var i = 0; i < 42; i++)
    {'key': 'day:$i', 'start': wall(day(i)), 'end': wall(day(i + 1))},
  {'key': 'tonight', 'start': wall(now), 'end': wall(day(1))},
  {'key': 'weekend', 'start': wall(saturday), 'end': wall(monday)},
];
final rows = await supabase.rpc(
  'app_event_counts',
  params: {
    'ranges': ranges,
    'city_ids': cityPreferences.effectiveCityIds, // [] : toutes les villes
    'category': selectedCategory, // id ou nom ; null : Tout
  },
) as List<dynamic>;
// [{"range_index":0,"range_key":"day:0","range_start":"2026-10-19T00:00:00",
//   "range_end":"2026-10-20T00:00:00","events_count":4,"starting_count":1}, …]
```

Comparaison avec les maquettes (scénario du vendredi 23 octobre 2026 à 19:15, toutes villes,
instantané du 2026-10-19, `at_time` fixé) :

| | Maquettes | `starting_count` | `events_count` |
| --- | --- | --- | --- |
| Jours du 23 octobre au 29 novembre | — | = maquettes sauf le 23 (3 au lieu de 4 : l'atelier 16:00-19:00 est terminé) ; mêmes points les 38 jours | +1 à +3 par jour (CIRCUS jusqu'au 7 mars 2027, Salon des Artistes Orléanais jusqu'au 1er novembre, Salon des Anonymes, Confluence IV, Fulgurances Électroniques) ; points différents 22 jours sur 38 |
| Ce soir (19:15 → minuit) | 2 | 2 | 4 |
| Demain | 7 | 7 | 9 |
| Ce week-end (samedi et dimanche) | 9 | 9 | 11 |
| Semaine prochaine (26 octobre → 1er novembre) | 24 | 24 | 26 |
| Vacances de la Toussaint (23 octobre → 1er novembre) | 37 | 36 (l'atelier terminé) | 38 |

À trancher par le calendrier : `starting_count` reproduit les points validés (une exposition de cinq
mois mettrait sinon un point sur chaque jour jusqu'en mars) ; le nombre du bouton doit être celui de
la liste qu'il ouvre (`events_count` si elle montre les expositions en cours).

### `app_events_in_range` : les événements d'une plage

```sql
app_events_in_range(range_start timestamp, range_end timestamp = null, city_ids uuid[] = null,
                    category text = null, at_time timestamp = null,
                    free boolean = false, family boolean = false)
  returns setof public.events
```

Les lignes de `app_events()` qui appartiennent à `[range_start, range_end)` (fin nulle : sans fin),
dans le périmètre et la catégorie, sans les événements masqués par l'utilisateur ni les auteurs
bloqués. Avec `hide_from_home` : sur Tout, l'accueil les filtre lui-même. Comme sur `rpc/app_events` :
filtres avant `select`, tri et pagination après (PostgREST v13 ne filtre pas une jointure d'un RPC).
Trié par date, un événement commencé avant la plage (exposition en cours) vient en premier.

```dart
var query = supabase.rpc('app_events_in_range', params: {
  'range_start': wall(start),
  'range_end': wall(end),
  'city_ids': cityPreferences.effectiveCityIds,
  'category': selectedCategory,
});
if (selectedCategory == null) query = query.eq('hide_from_home', false);
// Ceux qui commencent dans la plage seulement (starting_count) :
// query = query.gte('date', DateTime.utc(start.year, start.month, start.day).toIso8601String());
final data = await query
    .select(_eventColumns) // jointures comprises : 'id, title, …, locations(name)'
    .order('date', ascending: true)
    .range(0, 49);
```

Pas de limite de 200 : paginer (`range`, `limit`/`offset`), `events_count` donnant le total.

### « Gratuit » et « En famille » : `free` et `family`

Deux paramètres d'`app_events_in_range` et d'`app_event_counts` (migration
`20261021160000_add_free_family_filters.sql`, U5 de l'app), faux par défaut ; vrais, ils ne gardent que :

- `free` : les événements gratuits, `price_kind = 'free'` (tous les prix connus à 0 ; pas « 0 à 5 € », ni
  le prix libre, ni un prix inconnu) ;
- `family` : les événements en famille, `is_young_audience`, ou le tag « Jeune Public » (reconnu par son
  nom, casse et espaces ignorés ; décision du 2026-10-21, le tag faisait doublon avec la case).

Les deux ensemble : les deux à la fois. Les règles sont ici, pas dans l'app : elle passe le paramètre, ne
lit ni la case ni le tag. Les appels sans ces paramètres ne changent pas. Prod, le 2026-10-21 (toutes
villes, à venir) : 29 gratuits ; 43 en famille (les 24 événements qui ont le tag ont aussi la case).

```dart
// Tuile « Gratuit · 29 à venir », et « 29 événements gratuits à venir. » sur l'accueil filtré : le même
// nombre (Tout, sans hide_from_home, comme l'accueil).
final rows = await supabase.rpc('app_event_counts', params: {
  'ranges': [{'start': wall(today)}],
  'city_ids': cityPreferences.effectiveCityIds,
  'free': true, // ou 'family': true
}) as List<dynamic>;

// La liste : celle de l'accueil filtré, dates choisies ou non.
final events = await supabase.rpc('app_events_in_range', params: {
  'range_start': wall(today),
  'city_ids': cityPreferences.effectiveCityIds,
  'free': true,
}).eq('hide_from_home', false).select(_eventColumns).order('date').range(0, 199);
```

### Vacances scolaires : table `school_holidays`

Vacances des élèves de l'académie d'Orléans-Tours (zone B), une ligne par période, lisible par tous,
écrite par la clé service role seulement. Rechargée chaque lundi à 5 h UTC depuis le calendrier
scolaire officiel (data.education.gouv.fr, jeu `fr-en-calendrier-scolaire`) par
`GET /api/cron/school-holidays` (`lib/school-holidays/official-calendar.ts`).

| Colonne | Type | |
| --- | --- | --- |
| `name` | texte | « Vacances de la Toussaint », « Pont de l'Ascension »… (nom du jeu officiel) |
| `first_day` | date | premier jour de vacances : jour de fin des cours, souvent un samedi |
| `last_day` | date | dernier jour de vacances, compris : la veille de la reprise |
| `school_year` | texte | « 2026-2027 » |
| `academy`, `zone` | texte | « Orléans-Tours », « Zone B » |
| `source_start_date`, `source_end_date` | date et heure | valeurs brutes du jeu (fin des cours, reprise) |

Toussaint 2026 : `first_day` 2026-10-17, `last_day` 2026-11-01 (fin des cours le samedi 17 octobre,
reprise le lundi 2 novembre : Onisep et le jeu officiel). Le jeu donne le jour de la reprise :
`last_day` en est la veille, sauf pour une période d'un jour, à la même date aux deux bornes (pont de
l'Ascension 2027 : vendredi 7 mai). Pas chargées : les lignes « Enseignants » et « Début des
Vacances d'Été » (2028, fin pas encore connue).

```dart
final holidays = await supabase
    .from('school_holidays')
    .select('name, first_day, last_day')
    .gte('last_day', today) // 'AAAA-MM-JJ'
    .order('first_day')
    .limit(3);
// [{"name":"Vacances de la Toussaint","first_day":"2026-10-17","last_day":"2026-11-01"}, …]
```

Bande : les jours de `first_day` à `last_day`. Raccourci « Vacances de la Toussaint » : la plage
`[aujourd'hui (ou first_day s'il est plus tard), last_day + 1 jour)` dans `app_event_counts`.

### Recherche : `app_category_counts`, `app_tag_counts`, recherche par tag

« À venir » : `app_events_in_range` à partir d'aujourd'hui 0 h, sans fin (événements du jour pas
terminés compris, expositions en cours comprises), dans le périmètre, avec `hide_from_home` (la
recherche n'est pas l'accueil).

```sql
app_category_counts(city_ids uuid[] = null, at_time timestamp = null)
  returns table (category_id uuid, name text, display_order integer, events_count integer)
app_tag_counts(city_ids uuid[] = null, max_tags integer = 20, at_time timestamp = null)
  returns table (tag_id uuid, name text, events_count integer)
```

- `app_category_counts` : une ligne par catégorie active, même à 0, la plus fournie d'abord (à
  égalité : `display_order`, puis le nom). L'icône reste celle de `categories.icon_svg`, déjà lue.
- `app_tag_counts` : les tags d'au moins un événement à venir, le plus fourni d'abord (à égalité :
  le nom), `max_tags` au plus (1 à 100).

```dart
final categories = await supabase.rpc('app_category_counts',
    params: {'city_ids': cityPreferences.effectiveCityIds}) as List<dynamic>;
// [{"category_id":"c56a…","name":"Spectacle","display_order":4,"events_count":205}, …]
final tags = await supabase.rpc('app_tag_counts',
    params: {'city_ids': cityPreferences.effectiveCityIds, 'max_tags': 12}) as List<dynamic>;
// [{"tag_id":"…","name":"Théâtre","events_count":73}, …]

// Toucher un tag : ses événements à venir.
final events = await supabase
    .rpc('app_events_in_range', params: {
      'range_start': wall(today),
      'city_ids': cityPreferences.effectiveCityIds,
    })
    .contains('tag_ids', [tagId]) // tag_ids=cs.{…}
    .select(_eventColumns)
    .order('date', ascending: true)
    .range(0, 29);
```

Instantané du 2026-10-19, toutes villes : Spectacle 205, Atelier 58, Concert 47, Danse 33 ; #Théâtre
73, #Humour 44, #Danse 43, #Cirque 28, #Musique 27, #Jeune Public 24 ; les mêmes que les maquettes,
sauf Concert (45 dans les maquettes, qui ne comptaient pas les 2 événements dont la catégorie est
écrite « Concert »). Orléans seul : Spectacle 101, Atelier 49, Concert 33, Danse 21.

Index : la recherche par tag passe par l'index sur `date` (`idx_events_approved_visible_date`). Un
index GIN sur `tag_ids` ne servirait pas à l'app : sous la RLS, Postgres évalue `@>` (fonction non
« leakproof ») après les politiques de `events` et ne l'utilise que pour une requête qui passe outre
la RLS (vérifié sur 20 000 événements : GIN en service role, index sur `date` en anon). Pour la même
raison, les fonctions comparent `date` à des bornes calculées à part : les plans des appels ci-dessus
utilisent les index sur `date` et `end_date` (0,4 à 6 ms sur l'instantané ; 2 à 10 ms sur 20 000
événements).

### Fiche : `app_organizer_counts`, événements à venir des organisateurs

```sql
app_organizer_counts(organizer_ids uuid[], city_ids uuid[] = null, at_time timestamp = null)
  returns table (organizer_id uuid, kind text, events_count integer)
```

Sous « Organisé par », chaque organisateur affiche « 40 événements à venir » (décision du 2026-10-20).
Un organisateur de l'app est une ligne de `organizers` ou un lieu relié comme organisateur
(`event_organizers.location_id`) : `organizer_ids` accepte les deux sortes d'id, telles que la fiche
les lit dans `event_organizers`. Une ligne par id qui existe (inconnu, nul : pas de ligne ; en double :
une ligne ; au plus 200 ids), le plus fourni d'abord.

- `kind = 'organizer'` : ses événements par `event_organizers.organizer_id` ;
- `kind = 'location'` : les événements que le lieu organise (`event_organizers.location_id`) et ceux qui
  s'y tiennent (`events.location_id`), chacun une fois, comme la page d'un lieu dans l'app (un lieu qui
  organise ses propres soirées ne les compte pas deux fois). Une simple salle (non organisatrice) donne
  donc le nombre d'événements qui s'y tiennent.
- « À venir » : comme les comptes de la recherche (à partir d'aujourd'hui 0 h, expositions en cours
  comprises, pas terminé, sans les événements masqués par l'utilisateur ni les auteurs bloqués).
- `city_ids` : null pour la fiche (tous les événements de l'organisateur) ; le périmètre de l'app
  sinon.

```dart
final rows = await supabase.rpc(
  'app_organizer_counts',
  params: {'organizer_ids': [for (final o in event.organizers) o.id]},
) as List<dynamic>;
// [{"organizer_id":"78d1fda4-3d58-412f-8105-b35a04227428","kind":"location","events_count":84}]
final countById = {
  for (final row in rows) row['organizer_id'] as String: row['events_count'] as int,
};
```

Instantané prod du 2026-10-20 : Théâtre d'orléans 84, Théâtre de la Tête Noire 48, La Passerelle 35,
Artéphé 35, L'astrolabe 22. Les maquettes affichaient 40 pour le Théâtre d'orléans : l'app comptait
alors les seuls événements chargés (`SearchPlace.index`), une partie des 84.

### Fiche : `app_see_also`, « À voir aussi »

```sql
app_see_also(event_id uuid, city_ids uuid[] = null, at_time timestamp = null, max_results integer = 3)
  returns setof public.app_see_also_results
  -- (section text, rank integer, event_id uuid,
  --  source_kind text, source_id uuid, source_name text, source_events_count integer)
```

La fiche ne finit plus sur « Organisé par » (audit du 2026-10-20, `../live/docs/AMELIORATIONS.md`, U11 ;
maquettes, lot 1 : « Fiche, À voir aussi ») : deux rangées au plus, chacune masquée si elle est vide, lues
en un appel une fois la fiche affichée.

- `section = 'place'`, « Aussi à <lieu> » : les prochains événements du lieu de l'événement, ceux de sa
  page (qui s'y tiennent ou qu'il organise, toutes villes), par date (une exposition en cours d'abord). Si
  le lieu n'a pas d'autre spectacle, ou si l'événement n'a pas de lieu : ceux de l'organisateur de
  l'événement qui en a le plus (un organisateur, ou un autre lieu qui organise ; à égalité, par nom).
  Chaque ligne porte cette source : `source_kind` (`location` : la page d'un lieu ; `organizer` : celle
  d'un organisateur), `source_id`, `source_name` et `source_events_count`, son nombre d'événements à
  venir, l'événement de la fiche compris : le nombre de sa page et d'`app_organizer_counts` (« Les 83
  événements du lieu »).
- `section = 'genre'`, « Dans le même genre » : les événements de la même catégorie (par id ou par nom)
  ou avec un tag en commun, à 7 jours au plus du jour de l'événement, avant ou après (du jour à
  aujourd'hui pour un événement passé ou en cours), dans le périmètre `city_ids` (`null` ou `[]` :
  toutes les villes), sans ceux de la première rangée. Les plus proches sont retenus (le plus de tags en
  communs, plus 1 pour la même catégorie, puis le plus près dans le temps), puis rendus par date. Les
  champs `source_*` sont `null`.
- Une ligne par série (`app_event_series`, ci-dessous ; un événement seul est sa propre série, depuis la
  migration `20261021170000` : avant, le même titre suffisait, sans lieu ni écart de dates). Une rangée
  n'en montre que la première date (« Dans le même genre » : la plus proche), jamais une date de la
  série de la fiche : elles sont dans ses puces (« Autres dates »). Un même titre au même lieu à plus de
  7 jours d'écart est une autre série : « La Scène est à toi » de novembre est proposée sur la fiche de
  celle d'avril. Les comptes comptent chaque date.
- Rien du même festival (migration `20261023160000`, en prod depuis le 2026-10-23) : ni les autres événements du
  festival de la fiche, ni le festival lui-même, ni, sur la fiche d'un festival, ses événements ; ils sont
  dans « Au même festival » et le programme. Un lieu qui n'a d'autres spectacles que ceux du festival passe
  la main à l'organisateur, comme un lieu sans autre spectacle. Les comptes ne changent pas.
- « À venir » et filtres par utilisateur : ceux des comptes de la recherche (`app_events_in_range` à
  partir d'aujourd'hui 0 h, expositions en cours comprises, avec `hide_from_home`, sans les événements
  masqués par l'utilisateur ni les auteurs qu'il a bloqués). L'événement de la fiche est lu sous la RLS
  de l'appelant : publié, ou le sien en attente ; inconnu ou invisible, `[]`.
- `max_results` : par rangée, 1 à 20 (3 par défaut, les trois lignes des maquettes). `rank` part de 1,
  la rangée `place` d'abord : trier dessus (`order=rank`). Même raison que pour `app_search` : des lignes
  de la table `app_see_also_results` (toujours vide, illisible : 401) dont la clé étrangère vers `events`
  permet d'embarquer l'événement avec le select de l'app.

```dart
final rows = await supabase
    .rpc('app_see_also', params: {
      'event_id': event.id,
      'city_ids': cityPreferences.effectiveCityIds, // pour « Dans le même genre »
    })
    .select('section, rank, source_kind, source_id, source_name, source_events_count, '
        'event:events($eventSelect)') // le select de la liste, jointures comprises
    .order('rank', ascending: true) as List<dynamic>;
// [{"section":"place","rank":1,"source_kind":"location","source_id":"78d1fda4-…",
//   "source_name":"Théâtre d'Orléans","source_events_count":83,"event":{"id":"…","title":"Plonger | …",…}},
//  …,
//  {"section":"genre","rank":4,"source_kind":null,"source_id":null,"source_name":null,
//   "source_events_count":null,"event":{"id":"…","title":"Max De Bernardi & Veronica Sbergia",…}}, …]
```

Sur l'instantané prod du 2026-10-21 (363 événements à venir), fiche de « Youn Sun Nah + 1re partie Nit
And Dogs » (Théâtre d'Orléans, mardi 17 novembre, Concert, #Jazz), le 21 octobre : « Aussi au Théâtre
d'Orléans » Plonger (ce soir), Fora (22 octobre ; sa date du 23 n'est pas reprise), Atelier souplesse
et exploration du mouvement (24 octobre), 83 événements ; « Dans le même genre » Max De Bernardi &
Veronica Sbergia (15 novembre, Concert, #Blues #Jazz), Scène Ouverte Orléans (17 novembre, Concert),
Live Atelier : Afro Cubain et Jazzy (20 novembre, Concert, #Jazz). Le 23 octobre, jour du scénario des
maquettes, « Aussi au Théâtre d'Orléans » donne Fora, Atelier souplesse et Finale du concours de piano :
la rangée de la maquette A ; dans « Dans le même genre », la maquette avait Robert Finley (Concert, sans
tag commun) à la place de Scène Ouverte Orléans (Concert, le même soir), plus proche.

Temps côté serveur (`x-envoy-upstream-service-time`), prod du 2026-10-21, rôle anon, une fois la
connexion chaude (les premiers appels d'une série : 100 à 500 ms, comme `app_search`) :

| Appel | Temps |
| --- | --- |
| `app_see_also` seule (`select=rank`) | ~40 ms (18 à 83) ; exécution en base 14 à 17 ms |
| appel de l'app, 6 événements embarqués (select de la liste) | 45 à 90 ms (médiane 58 ms pour le TTN et L'Astrolabe, 80 à 86 ms pour le Théâtre d'Orléans) |

Embarquer les 6 événements avec le select de la liste coûte 25 à 45 ms : ces lignes n'affichent qu'un
titre, une date, une affiche, un lieu et une catégorie, un select plus léger ferait gagner d'autant. En
local (Postgres 17.6 et PostgREST v13.0.5 sur l'instantané), la fonction s'exécute en 5 à 12 ms (lecture
des 363 événements à venir : 2,5 ms).

### Proposer : `app_possible_duplicates`, « Cet événement existe peut-être déjà »

```sql
app_possible_duplicates(title text = null, starts_at timestamp = null, location_id uuid = null,
  link text = null, at_time timestamp = null, max_results integer = 3)
  returns setof public.app_possible_duplicate_results  -- (rank integer, event_id uuid, reason text)
```

Avant l'envoi d'une proposition, l'app montre l'événement déjà publié qui lui ressemble, avec « Voir la
fiche » et « Ce n'est pas le même » (audit du 2026-10-20, `../live/docs/AMELIORATIONS.md`, partie E,
point 6 ; maquettes du lot 2 : « Proposer, affiche lue »). La règle est celle de la collecte
(`findDuplicateEvent`, `lib/agent/events.ts`), réduite à ce qu'une proposition connaît, en SQL pour que
l'admin puisse la reprendre.

- Candidats : les événements à venir d'`app_events_in_range` (à partir d'aujourd'hui 0 h, expositions en
  cours comprises, toutes villes, sans les événements masqués par l'utilisateur ni les auteurs qu'il a
  bloqués) ; jamais un événement en attente, pas même le sien.
- `reason = 'link'` : `link` (le lien de la proposition, avec son `https://`) désigne la même page que
  `external_url`, `facebook_url`, `instagram_url` ou `scraping_url` (la page d'où la collecte l'a
  importé). Comparés par `app_link_keys(text)`, comme `urlMatchKeys` de la collecte : sans protocole,
  « www. », fragment, paramètres de suivi (`utm_*`, `fbclid`, `igsh`…) ni slash final, en minuscules ; le
  chemin seul suffit quand son dernier segment est précis (8 caractères au moins, pas une page `.php`,
  `.asp(x)`, `.htm(l)`). Un autre domaine (`m.facebook.com`) ne correspond pas.
- `reason = 'place'` : même lieu (`location_id`) et début à deux heures près de `starts_at`.
- `reason = 'title'` : titre équivalent (`app_similar_titles(text, text)`, la règle `similarTitles` de la
  collecte : sans accents, casse ni ponctuation, identiques, l'un contenu dans l'autre à partir de 6
  caractères, ou mots de plus de 2 lettres communs à 60 %) le jour de `starts_at`, ou en cours ce
  jour-là (exposition).
- `starts_at` : heure de Paris sans fuseau, comme `events.date` (conventions communes). Sans lien ni date,
  aucune ligne. Un événement qui a plusieurs raisons prend la plus sûre (`link`, puis `place`, puis
  `title`) ; rang par raison, puis du plus proche de `starts_at` au plus loin, puis date et id.
  `max_results` : 1 à 5 (3 par défaut) ; l'app montre la première ligne.
- Comme `app_search` : des lignes de la table `app_possible_duplicate_results` (toujours vide, illisible)
  dont la clé étrangère vers `events` permet d'embarquer l'événement avec le select de l'app ; trier sur
  `rank`. `language sql`, `stable`, `security invoker` : la RLS de l'appelant s'applique, avec ou sans
  session.

```dart
final rows = await supabase
    .rpc('app_possible_duplicates', params: {
      'title': draft.title,
      'starts_at': draft.startDateTime?.toIso8601String(), // heure de Paris, sans fuseau
      'location_id': draft.matchedLocation?.id,
      'link': normalizedLink, // mode lien
    })
    .select('rank, reason, event:events($eventSelect)')
    .order('rank', ascending: true) as List<dynamic>;
// [{"rank":1,"reason":"place","event":{"id":"…","title":"Youn Sun Nah + 1ère partie Nit And Dogs",…}}]
```

Tests : `supabase/tests/app_possible_duplicates.test.sql` (les trois règles, les exclusions, l'ordre,
`app_link_keys` et `app_similar_titles`) ; chaque règle a été changée une fois pour vérifier qu'un test
échoue.

### Séries : `app_event_series`

```sql
app_event_series(at_time timestamp = null)
  returns table (event_id uuid, series_id uuid, date timestamptz, dates_count integer)
```

Les dates d'un même spectacle (audit du 2026-10-20, `../live/docs/AMELIORATIONS.md`, U14 ; maquettes,
lot 3 : « Séries ») : sur l'accueil, une carte par série, à sa première date, avec « et 3 autres dates »
dans la ligne d'infos ; sur la fiche, « 4 dates » et les dates en puces, chacune ouvrant sa fiche. Règle
tranchée le 2026-10-21 (AMELIORATIONS.md, § 5) : automatique, sans lien posé dans l'admin.

- **Règle** : deux événements à venir sont de la même série s'ils ont le même titre normalisé, le même
  lieu (`location_id` ; sans lieu, d'aucune série), et si l'on passe de l'un à l'autre par des dates de
  ce titre à ce lieu qui se suivent à 7 jours au plus. Les jours sont ceux du calendrier, heure de Paris :
  vendredi 20:30 et le vendredi suivant 21:00 se suivent. Une série chaque semaine reste une seule série
  tant qu'il n'y a pas de trou de plus de 7 jours ; deux séances le même jour sont deux dates.
- **La règle seule** : `app_event_series_of(event_ids, dates, location_ids, titles)` l'applique à des
  événements donnés en tableaux parallèles, sans rien lire ; `app_event_series` la passe sur les événements
  à venir, `app_see_also` sur ceux qu'il a déjà lus (sous la RLS d'`events`, une lecture de plus coûte :
  ~0,5 ms par événement en prod le 2026-10-21).
- **Titre normalisé** (`app_event_series_title(title)`) : sans la date écrite au début ou à la fin
  (`app_event_title_without_date`, les motifs de `stripDateFromTitle` de `lib/scraping/dates.ts`, qui la
  retire déjà à l'import : « Atelier broderie - dim. 01/11 », « Samedi 31 octobre 2026 : Atelier SITA »,
  « Live - Novembre 2026 » ; s'il reste moins de 3 caractères, le titre entier : « 30/30 »), puis sans
  accents, casse ni ponctuation, comme la recherche (`app_search_normalize`).
- **À venir et par utilisateur** : comme `app_see_also` (`app_events_in_range` à partir d'aujourd'hui 0 h,
  expositions en cours comprises, toutes villes, avec `hide_from_home`, sans les événements masqués par
  l'utilisateur ni les auteurs qu'il a bloqués). Une date passée n'est plus une date de la série.
- **Lignes** : une par événement à venir d'une série de 2 dates ou plus ; un événement seul n'a pas de
  ligne. `series_id` : la première date de la série (par date, puis id), l'événement à ouvrir pour la
  série ; `dates_count` : le nombre de dates de la série, l'événement compris (« 4 dates » ; « et 3 autres
  dates » = `dates_count - 1`) ; `date` : celle de l'événement (`events.date`), pour les puces sans autre
  appel. Rendues par série (sa première date), puis par date.
- **Pour l'app** : lue une fois, toutes villes (les séries ne dépendent pas du périmètre). L'accueil garde,
  pour chaque `series_id`, la première date de sa liste ; la fiche affiche les dates de sa série. Une
  série peut commencer avant la plage d'une liste (« Demain » d'une série commencée ce soir) : la carte
  est alors à sa première date dans la liste, et « et N autres dates » compte toutes les dates de la
  série. Au-delà de 1 000 lignes (le `max_rows` de PostgREST chez Supabase), la réponse serait tronquée :
  141 lignes le 2026-10-21.

```dart
final rows = await supabase
    .rpc('app_event_series', get: true)
    .select('event_id, series_id, date, dates_count') as List<dynamic>;
// [{"event_id":"…","series_id":"…","date":"2026-10-29T20:30:00+00:00","dates_count":4},
//  {"event_id":"…","series_id":"…","date":"2026-10-30T20:30:00+00:00","dates_count":4}, …]
```

Sur l'instantané prod du 2026-10-21 (363 événements à venir, à 17:30) : 52 séries, 141 dates ; la plus
longue, « Les Croquis du TTN » (Théâtre de la Tête Noire), 7 dates en 3 jours ; « Le Dîner de Condé »,
4 dates à l'Espace Béraire (29 octobre au 1er novembre) et 3 à La Passerelle (12 au 14 novembre), deux
séries ; « Plateau stand-up Orlin's Comedy » (Java Pop), 6 mercredis d'affilée, une série. En local
(Postgres 17, rôle anon), la fonction s'exécute en ~3,5 ms, dont ~2 ms pour les titres ; `app_see_also`
prend ~5 ms de plus (les titres des événements qu'il lit déjà). En prod le 2026-10-21 (rôle anon, serveur) :
`app_event_series` ~245 ms, presque tout pour lire les 362 événements à venir sous la RLS d'`events` (~0,5 ms
par ligne, voir `MIGRATIONS_LOG.md`, « Séries ») ; `app_see_also` inchangée par les séries (~290 à 460 ms selon
la fiche, la même RLS). L'app la garde 5 minutes.

### Recherche : `app_search`, `app_search_names`

```sql
app_search(query text, city_ids uuid[] = null, at_time timestamp = null, max_results integer = 30)
  returns setof public.app_search_results   -- (event_id uuid, rank integer)
app_search_names(query text, city_ids uuid[] = null, at_time timestamp = null, max_results integer = 10)
  returns table (rank integer, kind text, id uuid, name text, events_count integer,
                 is_organizer boolean, image_url text, city text)
```

La recherche de l'app sur toute la base (audit du 2026-10-20, `../live/docs/AMELIORATIONS.md`, U1 :
« concert » ne rendait qu'un résultat quand la tuile Concert en annonce 47, l'app ne cherchant que
dans les 200 événements chargés par l'accueil). « À venir », périmètre et filtres par utilisateur :
ceux des comptes de la recherche (à partir d'aujourd'hui 0 h, expositions en cours comprises, avec
`hide_from_home`), si bien que « Concert · 47 » ouvre les 47 événements de la tuile.

Correspondance, sans accents ni casse, ponctuation en espaces (« Théâtre d’Orléans » et
« theatre d orleans » se valent) :

- chaque mot de la requête doit se trouver quelque part ; les mots vides (« de », « d », « la »…) et
  d'une lettre ne sont pas exigés (tous le sont si la requête n'a que ceux-là) ; moins de 2
  caractères : rien ; au-delà de 200 caractères et de 10 mots, la suite est ignorée ;
- un mot se trouve : mot entier, début de mot (« jaz » → Jazz, la recherche à la frappe), même
  racine française en plein texte (« concerts » → Concert), ou, à partir de 4 lettres, mot proche
  (trigrammes de `pg_trgm`, « concrt » → Concert) ;
- pertinence d'un événement : titre (1) avant artistes liés, lieu et organisateurs (0,6), avant
  catégorie, tags et ville (0,45), avant description (0,25, plein texte seul) ; une requête de
  plusieurs mots lue d'un bloc passe devant les mêmes mots épars ; un titre égal à la requête passe
  devant. À pertinence égale : par date (une exposition en cours d'abord).

`app_search` rend une ligne `(event_id, rank)` par événement, `rank` partant de 1 (le plus
pertinent), `max_results` au plus (1 à 100). Ce sont des lignes de la table `app_search_results`,
toujours vide (RLS sans politique, aucun droit), dont la clé étrangère vers `events` permet
d'embarquer l'événement avec le select habituel de l'app et de trier par rang, en un seul appel. Un
`setof events` trié par la fonction ne suffisait pas : PostgREST joint lieux et villes par hachage
autour d'elle, et l'ordre des lignes se perdait (vu sur PostgREST v13.0.5, la version de la prod).

```dart
final rows = await supabase
    .rpc('app_search', params: {
      'query': query,
      'city_ids': cityPreferences.effectiveCityIds, // [] : toutes les villes
    })
    .select('rank, event:events($eventSelect)') // le select de la liste, jointures comprises
    .order('rank', ascending: true) as List<dynamic>;
// [{"rank":1,"event":{"id":"…","title":"Concert de LUIZA avec Première Partie",…}}, …]
final events = [
  for (final row in rows)
    if (row['event'] is Map<String, dynamic>) Event.fromJson(row['event']),
];
```

`app_search_names` : les noms qui correspondent (mêmes règles, sur le nom seul), au plus
`max_results` de chaque sorte (1 à 50), seulement s'ils ont au moins un événement à venir ; `rank` :
catégories, puis tags, lieux, organisateurs, chacun du plus pertinent au moins pertinent (puis le plus
fourni). L'ordre n'étant pas garanti sans `order`, trier sur `rank`.

| `kind` | `events_count` | `is_organizer` | `image_url` | `city` |
| --- | --- | --- | --- | --- |
| `category` (active) | comme `app_category_counts` (par id ou nom) | false | null | null |
| `tag` | comme `app_tag_counts` | false | null | null |
| `location` | comme `app_organizer_counts` (s'y tient ou organisé par lui, une fois chacun) | organise au moins un de ces événements | image du lieu | ville du lieu |
| `organizer` | comme `app_organizer_counts` | true | logo, à défaut icône | null |

Un organisateur qui porte le nom d'un lieu (sans accents ni casse ; un en prod, « Noraebang ») n'est
pas rendu à part : ses événements comptent avec ceux du lieu, comme l'app réunissait déjà les deux.

```dart
final names = await supabase
    .rpc('app_search_names', params: {
      'query': query,
      'city_ids': cityPreferences.effectiveCityIds,
    })
    .order('rank', ascending: true) as List<dynamic>;
// [{"rank":1,"kind":"location","id":"78d1fda4-…","name":"Théâtre d'orléans","events_count":84,
//   "is_organizer":true,"image_url":"https://…/locations-images/…","city":"Orléans"}]
```

Sur l'instantané prod du 2026-10-20 (367 événements à venir, toutes villes) :

| Requête | `app_search` (au plus 100) | `app_search_names` |
| --- | --- | --- |
| concert | 54 : les 2 titres, puis les autres événements de la catégorie (47 en tout), puis 6 descriptions | Concert (catégorie) 47, #Concert 8 |
| concrt | 48 | les mêmes |
| theatre d orleans | 100, ceux du lieu d'abord | Théâtre d'orléans (lieu) 84 |
| luiza | 2 (titres ; « LUIZA + 1ERE PARTIE » a aussi l'artiste lié) | — |
| jaz | 8 : « … Jazzy » (titre), puis les 4 autres du tag Jazz, puis 3 descriptions | #Jazz 5 |
| tete noire | 49 | Théâtre de la Tête Noire (lieu) 48 |

Les comptes de `app_search_names` égalent, sur tout l'instantané, ceux d'`app_category_counts`
(9 catégories), d'`app_tag_counts` (71 tags) et d'`app_organizer_counts` (33 lieux et organisateurs).

Index : aucun. Sous la RLS d'`events`, ni `%` ni `@@` (non « leakproof ») ne serviraient d'index : la
fonction lit les événements à venir par l'index sur `date` (`app_events_in_range`) et compare leurs titres
et descriptions ; les noms (lieux, salles, artistes, organisateurs, catégories, tags, villes) sont
comparés une fois chacun, puis rattachés aux événements par leurs liens
(`20261020210000_speed_up_app_search.sql` : la première version relisait artistes et organisateurs
événement par événement, sous la RLS de leurs liens, deux fois plus lente). Le plein texte d'une
description et les trigrammes ne sont calculés que pour un texte qui contient le début de la racine ou
un trigramme du mot.

Temps côté serveur (`x-envoy-upstream-service-time`), prod du 2026-10-20 (366 événements à venir), rôle
anon, après quelques appels :

| Appel | Temps |
| --- | --- |
| `app_search` seule (`select=rank`) | 40 à 70 ms (première version : ~125 ms) |
| appel de l'app, peu de résultats (« luiza », « jaz ») | 60 à 95 ms |
| appel de l'app, 30 événements embarqués (« concert », « theatre d orleans ») | ~100 à 120 ms (première version : 140 à 200 ms) |
| `app_search_names` | 25 à 40 ms |

Embarquer 30 événements avec le select de l'app coûte à lui seul ~50 à 60 ms : c'est le coût de la page
d'un tag (`app_events_in_range`, 30 événements, ~68 ms). En local (Postgres 17.6 et PostgREST v13.0.5 sur
l'instantané) : `app_search` 11 à 16 ms en base, l'appel de l'app 16 à 30 ms ; avec 5 000 événements
passés de plus, inchangé (index sur `date`) ; le coût croît avec le nombre d'événements à venir.

## Favoris : `event_like_counts`, sans lire `event_likes`

```sql
event_like_counts(event_ids uuid[]) returns table (event_id uuid, likes_count integer)
```

Migration `20261020180000_create_event_like_counts.sql`, tests `supabase/tests/event_likes.test.sql`.
Nombre de favoris de chaque événement demandé, pour « Mes suggestions » (compteur « 3 favoris » des
contributions validées). Une ligne par id d'un événement visible dans l'app (`app_events()`) ou créé par
l'appelant (`events.created_by`, quel que soit son statut) ; un autre id (inconnu, non visible, nul) n'a
pas de ligne : compter 0. Ids en double : une ligne ; au plus 200 ids par appel. `security definer` :
compte toutes les lignes sans les rendre.

```dart
final rows = await supabase.rpc(
  'event_like_counts',
  params: {'event_ids': [for (final e in events) e.id]},
) as List<dynamic>;
// [{"event_id":"…","likes_count":3}]
```

Jusqu'ici, l'app comptait en lisant les lignes (`from('event_likes').select('id').eq('event_id', …)`),
ce que la policy SELECT `USING (true)` permettait à tous, anon compris : qui a aimé quoi était public.
`20261020181000_restrict_event_likes_select.sql` réserve la lecture des lignes à leur auteur ; à
appliquer quand les versions de l'app en circulation passent par `event_like_counts` (une ancienne
version afficherait alors 0 favori, ou 1). L'app ne lit plus que ses propres lignes (`user_id` filtré).

## Données d'un invité recopiées sur le compte : `copy_guest_data`

```sql
copy_guest_data(guest_session_id uuid)
  returns table (likes integer, hidden_events integer, notification_preferences integer,
                 notification_categories integer, follows integer)
```

L'app ouvre une session anonyme par installation. Quand la personne se connecte ou crée un compte,
`AuthCoordinator` (app) appelle cette fonction avec le jeton du compte : elle recopie sur lui les favoris
(`event_likes`), les événements masqués (`user_hidden_events`) et les suivis (`user_follows`, avec leur
date ; depuis `20261021141000`) de l'invité, sans doublons, et ses préférences de notification
(`user_notification_preferences`, `follows_enabled` compris, et `user_notification_categories`) si le
compte n'en a pas encore. L'invité garde les siennes ; rejouer l'appel n'ajoute rien. Rend une ligne : le
nombre de lignes ajoutées par table.

- `guest_session_id` : l'id de la session de l'invité (`auth.sessions.id`), claim `session_id` de son jeton.
  Il prouve que l'appelant a tenu cette session ; l'id de l'utilisateur invité ne suffit pas (il est public
  s'il a créé un événement publié). La session reste en base quand l'app passe au compte.
- Refusé (erreur `42501`, HTTP 403, rien d'écrit) : appelant invité ou sans session, session inconnue ou
  d'un compte. `execute` à authenticated seulement.
- Avant cette fonction, l'app lisait les lignes de l'invité avec le jeton du compte : la RLS (« chacun les
  siennes ») ne rendait rien, et seuls les favoris connus sur l'appareil passaient.

```dart
final rows = await supabase.rpc(
  'copy_guest_data',
  params: {'guest_session_id': decodeJwt(guestSession.accessToken).payload.claims['session_id']},
) as List<dynamic>;
// [{"likes":2,"hidden_events":1,"notification_preferences":1,"notification_categories":1,"follows":2}]
```

`follows` est arrivé avec les suivis (la fonction a été recréée) : une version de l'app qui ne le lit pas
l'ignore ; une version qui le lit doit accepter son absence (base pas encore migrée).

## Mesure d'audience : `app_audience_add`, sans identité

```sql
app_audience_add(day date, counts jsonb) returns integer
```

Migration `20261021013000_create_app_audience_counts.sql` (compteurs ajoutés par `20261023142000` et
`20261023180000`), tests `supabase/tests/app_audience.test.sql` ; lecture dans l'admin : « Audience de l'app »
(`/admin/audience`, `lib/audience/app-audience.ts`). Conditions
de la CNIL pour se passer de consentement, et ce qui y répond : `docs/AUDIENCE_ET_PLANTAGES.md` de l'app (U41).

L'app compte ses gestes par jour, sur le téléphone, et envoie au plus une fois par jour les totaux des
journées finies : `event_opened` (fiche ouverte), `ticket_tapped` (billetterie touchée), `search_no_result`
(recherche sans résultat), `when_sheet_used` (feuille « Quand ? » utilisée), `event_liked` (cœur), et depuis
la migration `20261023142000_add_radio_audience_metrics.sql` `radio_live_play` (le direct de la radio lancé)
et `radio_episode_play` (un épisode lancé), depuis `20261023180000_add_festival_audience_metric.sql`
`festival_opened` (la page d'un festival s'ouvre : la fiche d'un festival qui a un programme ; elle compte aussi
dans `event_opened`). En prod depuis le 2026-10-23 à 16:24, ces huit compteurs sont acceptés, ceux de la radio
compris (la migration de la radio n'y est pas encore, la liste est la même). Un appel par journée :
`{"day": "2026-10-20", "counts": {"event_opened": 3, "event_liked": 1}}`.

- **Sans identité** : l'app appelle avec la clé publique seule (`apikey` et `Authorization: Bearer <clé anon>`),
  jamais avec le jeton de sa session, pour que rien ne relie l'envoi à un compte, journaux de Supabase compris.
  La fonction n'enregistre ni l'IP ni un identifiant : elle additionne.
- Gardes : compteurs connus seulement, nombres arrondis à l'entier inférieur et plafonnés à 200 par compteur et
  par appel, jour des 7 derniers jours (heure de Paris), `counts` objet JSON. Le reste est ignoré **sans
  erreur** : la fonction rend le nombre de compteurs ajoutés (0 si rien). L'app jette la journée envoyée dès la
  réponse 2xx, qu'elle ait compté ou non : un compteur que la base ne connaît pas encore (une version de l'app
  sortie avant sa migration) est perdu, seul, et le reste de l'envoi compté. Un nouveau compteur se déclare donc
  ici avant la sortie de l'app qui l'envoie.
- Conservation : chaque appel efface les jours de plus de 25 mois.
- Table `app_audience_counts (day, metric, count)`, une ligne par jour et par compteur : RLS, lecture par un admin
  seulement ; ni anon ni un compte ordinaire ne la lisent ni ne l'écrivent directement.
- Abus : sans identité, des appels répétés ne peuvent pas être refusés, seulement bornés. Chiffres indicatifs.

```dart
final response = await http.post(
  Uri.parse('$supabaseUrl/rest/v1/rpc/app_audience_add'),
  headers: {
    'apikey': anonKey,
    'Authorization': 'Bearer $anonKey',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({'day': '2026-10-20', 'counts': {'event_opened': 3, 'event_liked': 1}}),
);
// 200, corps : 2
```

## Résumés poussés : `daily-events` et `weekly-summary`

Les crons (`app/api/cron/notifications/`, `lib/notifications/digest.ts`) envoient un message par
utilisateur et par passe, sur ses catégories (`user_notification_preferences`, fréquence `daily` ou
`weekly`). Les événements sont ceux de l'accueil de l'app : `app_events_in_range` (heure de Paris, pas
terminés), sans les complets ni `hide_from_home`, comptés quand ils commencent dans la plage (une
exposition de plusieurs mois ne fait pas un message chaque soir).

| Passe | Plage | Titre | Corps |
| --- | --- | --- | --- |
| chaque matin (`daily`) | ce soir, de 18 h à 6 h (« Ce soir » de l'app) ; rien ce soir : la journée | « 3 événements ce soir dans tes catégories » ; « 2 événements aujourd’hui… » | les deux premiers titres, puis « et 1 autre » |
| le lundi (`weekly`) | du lundi au dimanche | « 12 événements cette semaine dans tes catégories » | idem |

Rien dans la plage, pas de message. Ni nom, ni e-mail, ni donnée personnelle. Envoi : 08:00 UTC
(`vercel.json`, à l'heure près sur Hobby), soit 10 h l'été et 9 h l'hiver à Paris.

Données de la notification, que l'app lit au toucher pour ouvrir l'accueil sur la période et ces
catégories. FCM (Android) les reçoit en texte : une liste y devient `"a,b"` ; APNs (iOS) les garde en
JSON, à la racine du message à côté de `aps`.

| Champ | `daily_events` | `weekly_summary` |
| --- | --- | --- |
| `type` | `daily_events` | `weekly_summary` |
| `period` | `tonight` ou `today` | `week` |
| `date` / `start_date`, `end_date` | `date` : le jour (`2026-10-21`) | le lundi et le dimanche |
| `categories` | ids des catégories des événements envoyés | idem |
| `event_ids` | les 10 premiers, par date | idem |
| `events_count` | le nombre d'événements du message | idem |

Les versions de l'app d'avant le 2026-10-21 n'ouvrent rien de particulier au toucher (l'app s'ouvre
là où elle était) : ces champs ne lui servent pas, et aucun n'a été retiré sauf `days_count` (hebdo,
jamais lu).

## Suivis : `user_follows`, `app_follows`, notification `follows-digest`

Migrations `20261021140000_add_events_published_at.sql`, `20261021141000_create_user_follows.sql` et
`20261021142000_create_follows_digest.sql` ; tests `supabase/tests/user_follows.test.sql`,
`supabase/tests/follows_digest.test.sql`, `lib/notifications/follows-digest.test.mjs` et
`lib/notifications/digest-routes.test.mjs`. U8 de `../live/docs/AMELIORATIONS.md` : suivre un lieu, un
organisateur ou un artiste, « Mes suivis », la notification qui va avec. Les festivals en favori s'y ajoutent
avec `20261023160000_add_festival_follows_and_see_also.sql` (tests `supabase/tests/festival_follows_see_also.test.sql`,
en prod depuis le 2026-10-23) : un cœur sur un festival vaut suivi de son programme, sans ligne dans `user_follows`.

### Table `user_follows`

| Colonne | |
| --- | --- |
| `user_id` | l'utilisateur (invités compris : une session anonyme suit comme un compte) |
| `target_type` | `location` (un lieu, y compris un lieu qui organise : sa page dans l'app est celle du lieu), `organizer` (une ligne d'`organizers`) ou `artist` |
| `target_id` | l'id de la cible dans `locations`, `organizers` ou `artists` |
| `created_at` | début du suivi : ce qui était publié avant n'est ni « nouveau » ni notifié |

Clé primaire `(user_id, target_type, target_id)`. Chacun ne lit, n'ajoute et ne retire que ses lignes
(RLS) ; anon : rien ; pas de mise à jour. Une cible qui n'existe pas est refusée (`23503`, HTTP 409), un
type inconnu aussi (`23514`, HTTP 400) ; une ligne pour un autre utilisateur, `42501` (HTTP 403). Un lieu,
un organisateur ou un artiste supprimé emporte ses suivis, un compte supprimé aussi.

```dart
// Suivre, sans erreur si c'est déjà fait.
await supabase.from('user_follows').upsert(
  {'user_id': userId, 'target_type': 'location', 'target_id': locationId},
  onConflict: 'user_id,target_type,target_id',
  ignoreDuplicates: true,
);
// Ne plus suivre.
await supabase.from('user_follows').delete()
    .eq('user_id', userId).eq('target_type', 'location').eq('target_id', locationId);
// Ce que je suis (le bouton « Suivre » de chaque page).
await supabase.from('user_follows').select('target_type, target_id, created_at').eq('user_id', userId);
```

### `app_follows` : la liste « Mes suivis »

```sql
app_follows(at_time timestamp default null)
  returns table (target_type text, target_id uuid, name text, image_url text,
                 upcoming_count integer, new_count integer, followed_at timestamptz)
```

Une ligne par suivi de l'appelant dont la cible existe : son nom et son image (lieu : sa photo ;
organisateur : son logo, à défaut son icône ; artiste : sa photo ; `null` sans image), ses événements à
venir (`upcoming_count`, comme `app_organizer_counts` : `app_events_in_range` à partir d'aujourd'hui,
sans les masqués de l'appelant ni ses auteurs bloqués ; un lieu compte ceux qui s'y tiennent et ceux
qu'il organise, chacun une fois) et, parmi eux, ceux publiés depuis 7 jours et depuis le début du suivi
(`new_count`, « 2 nouveaux événements »). Triée : du nouveau d'abord, puis le plus d'événements à venir,
puis le nom. `at_time` : « maintenant » en heure de Paris (tests) ; null, maintenant. Exécutable par
authenticated.

```dart
final rows = await supabase.rpc('app_follows') as List<dynamic>;
// [{"target_type":"location","target_id":"…","name":"L’Astrolabe","image_url":"https://…",
//   "upcoming_count":12,"new_count":2,"followed_at":"2026-10-21T08:00:00+00:00"}]
```

### `events.published_at`

L'instant où un événement est apparu dans l'app pour la première fois (conditions d'`app_events()`
remplies), tenu par la base seule (trigger `trg_events_set_published_at`) : jamais effacé ni déplacé,
une valeur envoyée est ignorée ; null, jamais visible. Les événements déjà visibles au 21/10/2026 ont
leur `created_at`. C'est la date des « nouveaux événements » des suivis, pas `created_at` : un événement
importé peut attendre la modération plusieurs jours.

### La notification : `/api/cron/notifications/follows-digest`

Chaque jour à 16:00 UTC (`vercel.json`, à l'heure près sur Hobby), soit 18 h l'été et 17 h l'hiver à Paris, à
part du résumé du matin (08:00 UTC) pour ne pas tomber à la même minute : à chaque personne dont un suivi a
publié, un message (`lib/notifications/follows-digest.ts`), au plus un par jour (`notification_logs.delivery_key`
`follows_digest:<jour>:<utilisateur>`). Ce qu'il contient vient
de `follows_digest(at_time)` (service role seulement) : les événements visibles, pas complets, pas
terminés, publiés depuis le dernier message des suivis envoyé (`notification_logs.covered_until`, l'instant
du calcul ; un envoi qui échoue ne compte pas), depuis le début du suivi et depuis au plus 7 jours, sans
les masqués de la personne ni ses auteurs bloqués. Pour un festival en favori (un cœur, `event_likes`, sur la
fiche d'un festival visible), les événements entrés à son programme : un événement y entre quand il est à la
fois rattaché et publié (le plus tard de `events.festival_added_at` et `published_at`), depuis le cœur, le
dernier message et au plus 7 jours, avec les mêmes règles. Un événement entré au programme avant le cœur n'est pas
annoncé ; un événement à la fois au programme et chez un suivi compte une fois.

Envoyé si `user_notification_preferences.is_enabled` (l'interrupteur général) et `follows_enabled`
(« Mes suivis », vrai par défaut) ; sans préférences en base, rien. Ni e-mail ni donnée personnelle : les
noms sont ceux des lieux, organisateurs, artistes et festivals.

| Cas | Titre | Corps |
| --- | --- | --- |
| une seule cible a publié | « 2 nouveaux événements chez L’Astrolabe » ; artiste : « 1 nouvel événement avec Youn Sun Nah » ; festival : « Fulgurances Électroniques #2 : 2 événements ajoutés au programme » (« 1 événement ajouté ») | les deux premiers titres, puis « et 1 autre » |
| plusieurs | « 3 nouveaux événements chez tes suivis » | idem |

Données (FCM : en texte, une liste y devient `"a,b"` ; APNs : en JSON, à côté de `aps`) :

| Champ | `follows_digest` |
| --- | --- |
| `type` | `follows_digest` |
| `date` | le jour du message (`2026-10-21`) |
| `event_ids` | les 10 premiers, par date |
| `events_count` | le nombre d'événements du message |
| `follows_count` | le nombre de cibles suivies qui ont publié |
| `target_type`, `target_id` | la cible, quand elle est seule (sinon absents) ; `festival` : l'id de la fiche du festival (un événement) |

Toucher, dans l'app : la page de la cible quand elle est seule (`target_type`, `target_id`), sinon
l'onglet Favoris (« Mes suivis »). `target_type` `festival` : la fiche du festival
(`com.lazbutton.live://event/<id>`) ; les versions qui ne connaissent pas ce type (`FollowTargetType.fromValue`
rend `null`) ouvrent l'onglet Favoris.

## Radio : `radio_stations`, `app_radio_day`, `app_radio_shows`, `GET /api/v1/radio/{stationId}/live`

« Radio Campus dans OutLive » : écouter le direct de Radio Campus Orléans et réécouter ses émissions dans
l'app. Le contrat est celui du § 4 de `../live/docs/RADIO_CAMPUS.md` (fixé le 2026-10-23), recopié ici ; un
changement se fait des deux côtés ensemble. Migrations `20261023140000_create_radio_tables.sql`,
`20261023141000_create_app_radio_functions.sql`, `20261023142000_add_radio_audience_metrics.sql` et
`20261023143000_schedule_radio_import.sql` ; tests `supabase/tests/app_radio.test.sql` et
`lib/radio/*.test.mjs` (fixtures enregistrées le 2026-10-23 dans `lib/radio/fixtures/`).

**Radio Campus Orléans** : station `e2f7ade2-f5d2-4408-90b4-f8bfca383399` (id fixe, le même en local et en
prod), organisateur `9d6d803d-4a7e-4118-beba-1744a1159b99`. Elle est créée avec `enabled = false` : la RLS
la cache alors, avec ses émissions et ses épisodes, et l'app ne montre rien de la radio. L'utilisateur la
passe à `true` en prod après l'accord écrit de la radio (RADIO_CAMPUS.md, § 5).

### Tables

Lecture publique (anon et authenticated) d'une station activée, de ses émissions et de ses épisodes ;
écriture par la clé service role seulement (l'import, le back-office `/admin/radio`).

`radio_stations`

| Colonne | Type | Note |
| --- | --- | --- |
| `id` | uuid | |
| `organizer_id` | uuid, unique, → `organizers` | la station remplace la page de cet organisateur ; le supprimer est refusé tant que la station existe |
| `name` | text | « Radio Campus Orléans » |
| `frequency` | text | « 88.3 » |
| `stream_url` | text | `https://streams.labomedia.org:8443/stream_rco` |
| `stream_url_light` | text, null | le flux léger, s'il existe un jour (l'app le prend en données mobiles) |
| `status_url` | text | `https://streams.labomedia.org:8443/status-json.xsl` |
| `site_url` | text | `https://orleans.radiocampus.org/` |
| `enabled` | boolean, défaut `false` | l'interrupteur (plus haut) |

`radio_shows` : `id`, `station_id`, `source_id` (bigint, l'id WordPress, unique par station), `slug` (unique
par station), `name`, `style` (texte libre, première lettre en capitale ; null si la page n'en a pas),
`family` (`musique` ou `parole`), `description` (texte, sans HTML : un paragraphe par bloc, séparés par une
ligne vide), `page_url`, `feed_url`, `slots` (jsonb, `[{"weekday": 4, "start": "22:00", "end": "24:00"}]`,
jour ISO : 1 = lundi ; heures de Paris ; une fin plus tôt que le début finit le lendemain, minuit s'écrit
« 24:00 » ; la forme est vérifiée par la base), `organizer_id` (null : le collectif qui fait l'émission),
`last_episode_at` (le plus récent `aired_at` de ses épisodes, tenu par la base), `updated_at`.

`radio_episodes` : `id`, `show_id`, `guid` (unique), `title` (« Nation Groove du 22/10/2026 »), `aired_at`,
`duration_s` (null si le flux ne la donne pas), `audio_url`, `page_url`.

`radio_show_sync` : le suivi de l'import (dates de lecture, ETag des flux), illisible sauf par le service.

**Dates** : comme `events.date`, l'heure de Paris étiquetée UTC : `aired_at`, `last_episode_at`, `starts_at`,
`ends_at`, et dans la route `startsAt`, `endsAt`, `at` et `updatedAt`, se lisent sans conversion. Le flux RSS
donne de vrais instants UTC (« Thu, 22 Oct 2026 20:00:01 +0000 » = 22:00 à Paris) : l'import les convertit.

**Une émission active** a un épisode depuis 45 jours (`last_episode_at`, heure de Paris). Seules les
actives sortent des fonctions et de la route (47 le 2026-10-23, sur 91 au site).

### Fonctions (RPC publiques)

```sql
app_radio_day(p_station uuid, p_day date, p_at timestamp = null)
  returns table (show_id uuid, slug text, name text, style text, family text,
                 starts_at timestamptz, ends_at timestamptz,
                 episode_id uuid, audio_url text, duration_s integer, state text)
app_radio_shows(p_station uuid, p_at timestamp = null)
  returns table (id uuid, slug text, name text, style text, family text, slots jsonb,
                 last_episode_at timestamptz, organizer_id uuid, description text, page_url text,
                 letter text)
```

- `app_radio_day` : les émissions actives d'un jour, par `starts_at` (puis par nom). Un jour passé : celles
  qui ont un épisode ce jour-là. Aujourd'hui : celles passées qui ont un épisode, celle en cours, celles à
  venir ; une émission finie sans épisode (pas encore publié, ou pas eu lieu) n'y est pas. `p_day` va
  d'aujourd'hui − 6 à aujourd'hui (heure de Paris) ; un autre jour, aucune ligne.
  - `state` : `past` (finie), `live` (en cours), `next` (à venir), d'après l'heure de Paris. Une émission
    commencée la veille et pas finie (samedi 23:00 → dimanche 02:00, à 01:00) est `live` dans la journée où
    elle a commencé.
  - L'épisode se rattache au créneau de son émission dans lequel il commence, jusqu'à 15 minutes avant : la
    ligne a le début et la fin du créneau (« Nation Groove du 22/10/2026 », 22:00:01 → 22:00 – 24:00). Deux
    épisodes dans le même créneau : le premier. Un épisode hors de tout créneau (émission sans créneau,
    déplacée, spéciale) a sa propre ligne, à son heure (à la minute), jusqu'à la fin de sa durée (une heure
    sans durée).
  - `episode_id`, `audio_url`, `duration_s` : null sans épisode (`live`, `next`).
- `app_radio_shows` : les émissions actives de A à Z, sans tenir compte des articles « le », « la », « les »,
  « l' » au début, des accents, de la casse ni de la ponctuation (`radio_show_sort_key`). **`letter`**, en plus
  du contrat : la lettre sous laquelle ranger l'émission (« Le Mag Culturel » → `M`, « L'Enfer du Dimanche »
  → `E`, « À Bâtons Rompus » → `A`, `#` pour un chiffre), pour que la règle des articles reste en SQL.
- `p_at` (heure de Paris, sans fuseau) remplace « maintenant » pour les tests ; l'app ne l'envoie pas.
- Les épisodes d'une émission : la table directement.

```dart
const station = 'e2f7ade2-f5d2-4408-90b4-f8bfca383399';
final day = await supabase.rpc('app_radio_day', params: {
  'p_station': station,
  'p_day': '2026-10-22', // AAAA-MM-JJ, heure de Paris
}).order('starts_at') as List<dynamic>;
// [{"show_id":"…","slug":"la-mag-culturel","name":"Le Mag Culturel","style":"Danse, théâtre, cinéma, musique",
//   "family":"parole","starts_at":"2026-10-22T17:00:00+00:00","ends_at":"2026-10-22T18:00:00+00:00",
//   "episode_id":"…","audio_url":"https://orleans.radiocampus.org/wp-content/uploads/…mp3",
//   "duration_s":3587,"state":"past"}, …]
final shows = await supabase.rpc('app_radio_shows', params: {'p_station': station}) as List<dynamic>;
final episodes = await supabase.from('radio_episodes')
    .select('id, title, aired_at, duration_s, audio_url, page_url')
    .eq('show_id', showId).order('aired_at', ascending: false).limit(30);
```

### « Ce qui passe » : `GET /api/v1/radio/{stationId}/live`

Publique (aucune session), en cache 10 s au CDN (`Cache-Control: public, max-age=10, s-maxage=10,
stale-while-revalidate=10`), CORS comme les autres routes v1. Lue par l'app via `ApiClient`.

```json
{
  "station": {"id": "…", "name": "Radio Campus Orléans", "frequency": "88.3",
              "streamUrl": "https://streams.labomedia.org:8443/stream_rco", "streamUrlLight": null},
  "show": {"id": "…", "name": "Kawaï Campus Club", "style": "Mangas, animes et pop culture japonaise",
           "family": "parole", "startsAt": "2026-10-23T19:00:00+00:00", "endsAt": "2026-10-23T20:00:00+00:00"},
  "track": null,
  "next": {"id": "…", "name": "Blockchain", "style": "Hip-hop", "family": "musique",
           "startsAt": "2026-10-23T20:00:00+00:00"},
  "recentTracks": [],
  "updatedAt": "2026-10-23T19:12:04+00:00"
}
```

- La grille se lit en SQL (`radio_live_grid`, réservée à la route) : `show` est l'émission active en cours,
  `next` la prochaine émission active à commencer (dans les 7 jours ; null sinon). `style` peut être null.
- Pendant une émission, la radio n'envoie que son nom : `track` à null. Si la grille annonce une émission
  mais que le serveur envoie un morceau (l'émission n'a pas lieu), c'est la playlist : `show` à null.
- Entre deux émissions : `show` à null, `track` = `{"title": "To Ki Me Ki", "artist": "Akiko Yano"}` (artiste
  et titre au premier « - » du titre Icecast ; `artist` null sans tiret) et `recentTracks` = les quatre d'avant
  (`{"at", "title", "artist"}`, du plus récent au plus ancien), lus sur la page « Titres diffusés » de la radio
  (`admin-ajax.php?action=rco-get-past-titles`, du HTML, gardée 60 s) jusqu'à ce qu'elle donne un JSON. Ils
  s'arrêtent à un début d'émission et à deux heures : il peut y en avoir moins de quatre.
- Titres nettoyés : sans les jingles (« Tu ecoutes Radio Campus Orleans – Jingle » : `track` à null), sans
  numéros de piste (« 01 », « 05 - », « 19_ », « 1. ») ni fins de nom de fichier (« _GBCVZ2200466_44k-16b »,
  « .mp3 », « [44_16] ») ; tels que la radio les envoie pour le reste. Un nombre qui fait partie du titre
  reste (« 72-Hour Sweat », « 7 Miles to Jordan »).
- Station désactivée ou inconnue, id illisible : 404 `{"error": {"code": "not_found", "message": "Station
  introuvable"}}` (format des erreurs v1). Serveur de la radio muet : 200, `show` d'après la grille, `track`
  à null, `recentTracks` vide. Base en erreur : 500.
- Le serveur envoie le nom d'une émission prévue mais pas active (La Méridienne, sans podcast) : `show` et
  `track` à null (comme un serveur muet entre deux émissions).
- **Sans `Authorization`** : le CDN de Vercel ne garde pas une réponse à une requête qui porte cet en-tête.
  Avec le JWT de l'app, chaque appel lancerait la fonction (quotas Vercel Hobby). `ApiClient.get` envoie
  toujours le JWT et en demande un : l'app appelle cette route sans (`authenticated: false`, comme `post`).

### L'import, le back-office, la mesure d'audience

- **Import** (`GET /api/cron/radio-import`, `lib/radio/import.ts`), en lecture seule chez la radio (des GET,
  User-Agent « OutLive/1.0 … ») : l'API WordPress (`/wp-json/wp/v2/show?per_page=100`), la page d'une émission
  quand elle est nouvelle, modifiée sur le site ou lue il y a plus de 24 h (le style dans `.rco-show-style`,
  les créneaux dans `.rco-show-infos-dates-time li`, le lien du flux, la présentation), puis son flux RSS
  (ses 30 derniers épisodes) en lecture conditionnelle, pas plus d'une fois en 50 minutes. Pas de visuels.
  N'écrit que ce qui change ; un épisode sorti du flux est retiré. **Chaque heure par pg_cron** (tâche
  `radio-import`, à :07, migration `20261023143000`, une fois le secret posé dans Vault) et une fois par jour
  par `vercel.json` (5:30 UTC) : Vercel Hobby refuse un cron plus fréquent.
- **Famille par défaut** à la création d'une émission : `parole` pour ces 19, `musique` pour les autres :
  `quoique-ten-dises`, `champion-des-ondes`, `la-mag-culturel`, `ecoute-ta-fac`, `alors-on-se-fait-un-film`,
  `cine-qua-non`, `parlons-philo`, `a-batons-rompus`, `lemission-du-fictionnaire`, `la-science-infuse`,
  `les-clitoriciennes`, `univox`, `redac-pop`, `la-diagonale`, `kawai-campus-club`, `double-saut`,
  `pause-poesie`, `le-moulin-a-paroles`, `h1000`. Ensuite, famille et collectif (`organizer_id`) se modifient
  dans le back-office (`/admin/radio`) ; l'import n'y touche plus.
- **Mesure d'audience** (U41) : `radio_live_play` (le direct lancé) et `radio_episode_play` (un épisode
  lancé), acceptés par `app_audience_add` (voir « Mesure d'audience » plus haut).
- **Suivre une émission** (plus tard) : `user_follows` (U8) gagnera le type `radio_show`.

## Incohérences relevées, non corrigées

1. **Alertes admin rejouables.** Les données personnelles exposées (`diagnostics`, ids d'admin dans
   `errors`), le texte libre de new-request au format trigger et de new-feedback au format webhook,
   les champs du corps de new-report et de new-feedback sont corrigés (voir plus bas) : les trois
   alertes ne poussent que ce qui est en base. Reste :
   - new-request, new-report et new-feedback sont publiques : avec un id valide, n'importe qui peut
     les rappeler en boucle, chaque appel pousse une notification sur chaque token admin. Un id de
     demande, de signalement ou de feedback est un UUID, non devinable, mais connu de son auteur
     (renvoyé par `/api/user-requests`, ou lu après une insertion directe, permise à tout compte qui
     passe `can_use_ugc_features()`, et pour un feedback à tout compte non anonyme). L'auteur peut
     aussi modifier sa demande en attente (`event_data.title`) ou son feedback en attente
     (`description`, `feedback_object_id`) avant de le rejouer : texte de son choix, mais rattaché à
     son compte (`requested_by`, `user_id`). Un signalement ne peut pas être modifié par son auteur
     (pas de politique UPDATE pour lui) ; le texte affiché n'en reprend que le motif (libellé fixe) et
     le titre de l'événement, ses détails partent dans `data.message`, rattachés à son compte
     (`reporter_user_id`).
   - Piste, non faite : une seule notification par id. Colonne `admin_notified_at` sur
     `user_requests`, `content_reports` et `feedbacks` (migration), réservée par
     `update … set admin_notified_at = now() where id = $1 and admin_notified_at is null returning id` ;
     sans ligne renvoyée, répondre 200 avec `sent: 0` sans rien envoyer. Le premier appel de l'app,
     le seul qu'elle fasse, ne change pas ; `/api/user-requests` réserve aussi.
     Sans migration, une garde partielle : ne notifier que si `requested_at` (ou `created_at`) date de
     moins de 10 minutes, ce qui borne le rejeu sans l'empêcher. Une limite par IP demanderait un
     stockage partagé (Vercel n'en a pas sans service ajouté).
2. Les alertes admin répondent 200 même quand personne n'a été notifié (`success: false`).
3. PATCH des actions rapides : les erreurs métier sortent en 500 avec leur message, au lieu de 400 ou
   404 : « Événement introuvable », « Le titre doit contenir au moins 3 caractères », « Date
   invalide », « Le lieu est requis », « Lieu introuvable », « Prix invalide », « Impossible de
   modifier le prix tant que Prix libre est activé ».
4. Dates. Revu le 2026-10-19 : le décalage supposé ici (« 20:30 choisi à Orléans enregistré 22:30 »)
   n'existe pas, car `events.date` est l'heure de Paris étiquetée UTC (voir les conventions). Pas
   de `TZ` dans les variables Vercel de prod : les fonctions tournent en UTC, et l'ancien
   `new Date("2026-10-24T20:30:00.000")` y donnait `20:30Z`, la bonne valeur. Seul défaut côté
   serveur : ce résultat dépendait du fuseau du serveur (un `next dev` à Paris enregistrait 18:30).
   Corrigé : l'édition rapide lit une date sans fuseau en UTC (`parseEventDateInput`,
   `lib/date-utils.ts`). Corrigés le 2026-10-21 :
   - analyse d'affiche : une date écrite en toutes lettres était convertie par `zonedTimeToUtc` en
     vrai UTC (`…T18:30:00.000Z` pour 20:30 en été, `…T19:30:00.000Z` en hiver ; une date sans
     heure, la veille à 22:00), et une date ISO avec décalage passait telle quelle. L'assistant
     l'affichait 18:30 et, si le contributeur ne la corrigeait pas, l'événement était créé à
     18:30 ; le back-office, qui garde les heures écrites (`toDatetimeLocal`), aussi. Les dates
     sortent maintenant en heure murale sans fuseau (voir « Analyse d'affiche » plus haut).
   - app : la feuille d'actions rapides (`_formatDateTime`) affichait la date avec `toLocal()` :
     une date inchangée y apparaissait 1 à 2 h trop tard (22:30 pour 20:30), alors que la fiche et
     le sélecteur disaient 20:30. Elle lit maintenant les champs de la date, comme la fiche
     (lazbutton/live-app#123) ; l'app n'a plus de `toLocal()`.
   Reste, **à ne pas faire côté app : envoyer `toUtc()`.** 20:30 choisi partirait `18:30Z` et
   serait enregistré 18:30. Garder l'envoi sans fuseau, ou envoyer l'heure murale étiquetée UTC :
   `DateTime.utc(d.year, d.month, d.day, d.hour, d.minute).toIso8601String()`.
5. Analyse d'affiche avec `imageUrl` : si l'image ne se charge pas, la route renvoie le statut de
   l'hôte de l'image (404, 403…). L'app n'envoie jamais `imageUrl`.
6. Pas de double notification des demandes. Le trigger `notify_admins_new_request_trigger`, comme
   celui des feedbacks, appelle pg_net avec un corps `text` alors que `net.http_post` attend du
   `jsonb` : l'appel échoue, l'erreur finit en WARNING et rien ne part (vérifié sur une base locale,
   pg_net 0.19.5). Les deux triggers sont retirés par `20261019200000_drop_notify_admins_triggers.sql`,
   à appliquer en prod.
7. **Prix inconnu affiché « Gratuit » dans l'app** (relevé le 2026-10-19). Règle fixée par
   l'utilisateur le 2026-10-20 : un prix de 0 s'affiche « Gratuit », un prix non renseigné n'affiche
   rien ; elle vit en SQL, dans `events.price_kind` (voir « Genre de prix » plus haut), lue par l'admin
   (page de partage, page d'artiste, visuels pour les réseaux, espace organisateur) depuis la
   migration `20261020100000_add_price_kind_to_events.sql`. L'espace organisateur a le même choix que
   l'admin (Non précisé, Gratuit, Payant, Prix libre) et garde un prix de 0 à la modification.
   L'app le lit aussi depuis lazbutton/live-app#54 (`Event.priceKind`, `getCompactPriceLabel()` rend
   null quand le prix n'est pas renseigné), mergée le 2026-10-20 après la migration. Le 2026-10-19 :
   154 des 393 événements publiés sans aucun prix, affichés « Gratuit » par l'app.

## Comportements changés

Par l'ajout des schémas, seulement pour des corps invalides, que l'app n'envoie pas :

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

Par le retrait du format « ligne » de new-request (celui du trigger SQL retiré, sans appelant) : la
route ne lit plus `id`. Un corps avec `id` mais sans `requestId` donne 400 (« requestId : requis »)
au lieu de notifier les admins avec le contenu du corps, sans relire la demande. Rien ne change pour
l'app ni pour la page de test, qui envoient `requestId`.

Par la relecture de new-report en base : les champs du corps autres que `reportId` sont acceptés
mais ignorés, la notification (texte et `data`) vient du signalement et du titre de son événement,
relus à chaque appel. Pour l'app, rien ne change : elle envoie ce qu'elle vient d'enregistrer, et
ses libellés de motif (`ContentReportReason.label`) sont ceux de `reasonLabels`, à l'octet près,
depuis la première version. Seule différence possible : si le titre de l'événement a changé depuis
que l'app l'a chargé, c'est le titre actuel qui part. Pour les autres corps : `reporter_user_id`
vient de la ligne (avant : `userId` du corps, sinon `null`) ; en paramètres de requête, un
`blockRequested` absent ne force plus `false`.

Vérifié le 2026-10-19 : 15 appels rejoués sur les handlers d'avant et d'après (faux Supabase). Corps
de l'app, en JSON et en paramètres de requête : même statut, même réponse, même notification
(titre, texte, `data`), plus une lecture de `events`. Corps invalides (400) et id inconnu (404) :
inchangés. Les autres écarts sont ceux décrits ci-dessus.

Par la relecture de new-feedback en base (route gardée pour les builds 1.0.3 à 1.0.6, qui
envoient `{ feedbackId, message, userId, feedbackType?, feedbackObjectId }`) : seul `feedbackId`
sert (corps JSON, sinon paramètres de requête), les autres champs sont acceptés mais ignorés. Le
texte et `data` viennent du feedback relu dans `feedbacks` et du nom de son objet, relu dans
`feedback_objects` par `feedback_object_id` (non nul, clé étrangère). Ce nom est ce que l'app
envoyait dans `feedbackType`, lu juste après l'insertion : même notification qu'avant. Seule
différence : quand l'app n'avait pas pu lire ce nom (objet désactivé entre-temps, donc invisible
pour elle, ou erreur réseau), elle omettait `feedbackType` et le texte commençait par « feedback » ;
il commence maintenant par le nom de l'objet. Le format webhook (`{ id, description, … }`, celui du
trigger retiré, qui n'a jamais rien envoyé) n'est plus lu : un corps avec `id` mais sans
`feedbackId` donne 400 (« feedbackId : requis ») au lieu de notifier les admins avec le texte du
corps, sans relire `feedbacks`, quel que soit l'id. Un corps invalide reçoit le 400 commun (`issues`
au lieu de `hint`) ; réponses 200 et 404 inchangées. La page de test du back-office envoie un id
inventé : 404, comme avant.

Vérifié le 2026-10-19 (`lib/api/app/routes.test.mjs`, faux Supabase), test des corps des anciens
builds lancé sur l'ancienne route puis sur la nouvelle : même statut, même réponse ; même
notification (titre, texte, `data`) pour le corps avec `feedbackType`, plus une lecture de
`feedback_objects`. Pour le corps sans `feedbackType`, le texte et `data.feedback_type` prennent le
nom de l'objet, comme décrit ci-dessus.

## Alertes admin sans données personnelles (2026-10-19)

- `sendNotificationToAdmins` (lib/notifications/admin.ts) ne renvoie plus `diagnostics` (id, e-mail
  et début des tokens de chaque admin) et ses `errors` ne citent plus l'admin. Le détail par admin
  (id et erreur, compte final) va dans les journaux du serveur. Touche les réponses de new-request,
  new-report, `/api/user-requests` et aussi new-feedback (route inchangée, même fonction ; les
  anciens builds ne lisent pas sa réponse). La page de test du back-office lit `sent` et `error` et
  marche comme avant ; pour les tests admin, ses pastilles « Admins sans token » et « Tokens en
  échec » n'apparaissent plus (textes de la page mis à jour).
- new-request : `requestType` et `eventTitle` du corps ne servent plus de repli, le texte poussé
  vient seulement de la demande relue en base.

Vérifié le 2026-10-19, sur le code d'alors, qui acceptait encore le format « ligne » : 11 appels
(corps de l'app, paramètres de requête, ligne du trigger, page de test) rejoués sur les handlers
d'avant et d'après (faux Supabase, deux tokens admin en échec) : même statut, même corps hors
`diagnostics` et texte de `errors`, même notification poussée (titre, texte, `data`), mêmes requêtes
à la base, plus la relecture du trigger.

## Routes gardées pour les anciennes versions de l'app

Plus appelées par l'app actuelle (admin embarquée retirée), gardées pour les builds publiés ; ni
décrites ici, ni à modifier :

- `GET /api/admin/mobile/summary`, `GET /api/admin/mobile/events`, `GET /api/admin/mobile/events/[id]`
- `GET /api/admin/mobile/requests`, `PATCH /api/admin/mobile/requests/[id]`,
  `POST /api/admin/mobile/requests/[id]/convert`
- `POST /api/notifications/send-test`, `POST /api/notifications/send` (repli de `send-test`)
- `POST /api/notifications/admin/new-feedback` (notification relue en base depuis le 2026-10-19,
  voir « Comportements changés »)
- `POST /api/notion/resync` : sans effet depuis le retrait de Notion (2026-10-20). Le JWT admin est
  toujours vérifié (401 et 403 inchangés) ; un admin reçoit 200
  `{ "ok": true, "result": { "mode": "notion_removed" }, "drainResult": null }`, la forme d'avant (les
  anciens builds n'en lisent rien et affichent « Resync Notion lancé »). Test : `lib/api/app/routes.test.mjs`.

Docs plus anciennes sur ces routes, antérieures à ce contrat : `MOBILE_NOTIFICATIONS_API.md`,
`ADMIN_NOTIFICATIONS_NEW_REQUESTS.md`.
