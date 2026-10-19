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
  cette heure murale.

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
ignoré). Une date sans fuseau à 20:30 donne un événement à 20:30. Exception : une date issue de
l'analyse d'affiche peut arriver en vrai UTC (incohérence 4).

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
`UserRequestApiService.extractEventFromImage`). JWT d'un compte réel ayant accepté les conditions.
Formulaire multipart : champ `image`, fichier JPEG pour l'app (`imageUrl`, URL d'une image, sert
aux autres appelants).

- 200 : `{ data, metadata, warnings }`.
  - `data` : champs lus par l'IA, tous facultatifs et éventuellement `null` : `title`,
    `description`, `date`, `end_date`, `category`, `price` et `capacity` (texte ou nombre),
    `door_opening_time`, `external_url`, `external_url_label`, `image_url`, `location`, `address`,
    `organizer`, `tags` ; d'autres clés peuvent suivre (`is_full`, `presale_price`…).
    L'app (`ImportedEventPayload.fromJson`) convertit chaque valeur en texte.
    `date` et `end_date` : une date ISO lue par l'IA est renvoyée telle quelle ; une date écrite
    en toutes lettres (« samedi 24 octobre 20h30 ») est convertie en vrai UTC (incohérence 4).
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
| `image_card_url` | texte ou `null` | vignette WebP de `image_url`, ~800 px de large |
| `image_width`, `image_height` | entier ou `null` | dimensions de l'original (orientation EXIF appliquée), aussi le ratio de la vignette |
| `image_color` | texte ou `null` | couleur dominante, `#rrggbb` |

`null` tant que la vignette n'est pas faite (quelques secondes après l'enregistrement, au plus un
jour) : garder `image_url`. Quand `image_card_url` est remplie, les trois autres le sont aussi.
L'app actuelle ne sélectionne pas ces colonnes : ce qu'elle reçoit ne change pas. Elles seront lues
à l'étape C7b de `../live/docs/PLAN_REFONTE.md`. Fabrication et garanties : `EVENT_IMAGE_CARDS.md`.

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
   `lib/date-utils.ts`). Restent, non corrigés :
   - **app, à ne pas faire : envoyer `toUtc()`.** 20:30 choisi partirait `18:30Z` et serait
     enregistré 18:30. Garder l'envoi sans fuseau, ou envoyer l'heure murale étiquetée UTC :
     `DateTime.utc(d.year, d.month, d.day, d.hour, d.minute).toIso8601String()`.
   - app : la feuille d'actions rapides (`_formatDateTime`) et les écrans admin affichent la date
     avec `toLocal()` : une date inchangée y apparaît 1 à 2 h trop tard (22:30 pour 20:30). Le
     sélecteur, lui, part de l'heure UTC et propose bien 20:30. Afficher sans `toLocal()`, comme
     le reste de l'app.
   - analyse d'affiche : une date écrite en toutes lettres est convertie par `zonedTimeToUtc` en
     vrai UTC (`…T18:30:00.000Z` pour 20:30 en été), et une date ISO avec décalage passe telle
     quelle. L'app la lit en `DateTime` UTC, l'assistant l'affiche 18:30 et, si le contributeur ne
     la corrige pas, `eventData.date` part `…T18:30:00.000Z` : l'événement sera créé à 18:30.
     À corriger côté serveur en renvoyant l'heure murale sans fuseau (comme `toParisWallClock`,
     `lib/scraping/dates.ts`).
5. Analyse d'affiche avec `imageUrl` : si l'image ne se charge pas, la route renvoie le statut de
   l'hôte de l'image (404, 403…). L'app n'envoie jamais `imageUrl`.
6. Pas de double notification des demandes. Le trigger `notify_admins_new_request_trigger`, comme
   celui des feedbacks, appelle pg_net avec un corps `text` alors que `net.http_post` attend du
   `jsonb` : l'appel échoue, l'erreur finit en WARNING et rien ne part (vérifié sur une base locale,
   pg_net 0.19.5). Les deux triggers sont retirés par `20261019200000_drop_notify_admins_triggers.sql`,
   à appliquer en prod.

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
- `POST /api/notion/resync`

Docs plus anciennes sur ces routes, antérieures à ce contrat : `MOBILE_NOTIFICATIONS_API.md`,
`ADMIN_NOTIFICATIONS_NEW_REQUESTS.md`.
