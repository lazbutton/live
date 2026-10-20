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

## Fonctions SQL de la refonte : calendrier, vacances scolaires, recherche

Pour le calendrier « Quand ? » et la recherche des maquettes (`../live/docs/MAQUETTES_REFONTE.md`),
l'app lit ces comptes dans Supabase au lieu de les calculer en Dart. Migrations :
`20261019210000_create_app_events_in_range_and_counts.sql` (règle complète en tête),
`20261019211000_create_school_holidays.sql`, `20261019212000_create_app_search_counts.sql`, pour la
fiche `20261020140000_create_app_organizer_counts.sql`, et pour la recherche plein texte
`20261020170000_create_app_search.sql`. Tests : `supabase/tests/*.test.sql` (`npm run db:test`) et
`lib/school-holidays/official-calendar.test.mjs`. Les quatre premières sont en prod depuis le
2026-10-20, et `school_holidays` est chargée (64 périodes) ; détail : `supabase/migrations/MIGRATIONS_LOG.md`.

| Objet | Appel Dart | Rend |
| --- | --- | --- |
| `app_event_counts(ranges, city_ids, category, at_time)` | `rpc('app_event_counts', params: …)` | une ligne par plage : `events_count`, `starting_count` |
| `app_events_in_range(range_start, range_end, city_ids, category, at_time)` | `rpc('app_events_in_range', params: …)` + filtres, `select`, tri, pagination | lignes de `events` (`setof events`, comme `app_events()`) |
| table `school_holidays` | `from('school_holidays').select(…)` | périodes de vacances : `name`, `first_day`, `last_day` |
| `app_category_counts(city_ids, at_time)` | `rpc('app_category_counts', params: …)` | catégories actives et leur nombre d'événements à venir |
| `app_tag_counts(city_ids, max_tags, at_time)` | `rpc('app_tag_counts', params: …)` | tags populaires et leur nombre d'événements à venir |
| `app_organizer_counts(organizer_ids, city_ids, at_time)` | `rpc('app_organizer_counts', params: …)` | nombre d'événements à venir de chaque organisateur (fiche, « Organisé par ») |
| `app_search(query, city_ids, at_time, max_results)` | `rpc('app_search', params: …)` + `select('rank, event:events(…)')`, `order('rank')` | événements à venir qui correspondent à la requête, par pertinence puis date |
| `app_search_names(query, city_ids, at_time, max_results)` | `rpc('app_search_names', params: …)` + `order('rank')` | catégories, tags, lieux et organisateurs dont le nom correspond, avec leur nombre d'événements à venir |
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
- **Périmètre** : `city_ids` = les ids que l'app envoie déjà (`CityPreferencesController.effectiveCityIds`,
  ceux de son filtre `city_id=in.(…)`), comparés à `events.city_id`, à défaut à la ville du lieu
  (comme `app_cities()`). `null` ou `[]` : toutes les villes. Le filtre Dart au rayon
  (`CityEventMatching`, sur les coordonnées) n'est pas repris : un événement d'une ville du
  périmètre mais hors du rayon compte ici.
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
app_event_counts(ranges jsonb, city_ids uuid[] = null, category text = null, at_time timestamp = null)
  returns table (range_index integer, range_key text, range_start timestamp, range_end timestamp,
                 events_count integer, starting_count integer)
```

`ranges` : un tableau de plages `{"start": …, "end": …, "key": …}` (`key` facultative, texte libre
rendu tel quel ; `start` ou `end` absents : sans borne). Au plus 500 plages par appel, les suivantes
sont ignorées. Une ligne par plage, dans l'ordre reçu, même vide (0) ; `range_index` part de 0.

- `events_count` : les événements de la plage selon la règle ci-dessus, chacun une fois (un
  week-end compte une fois l'exposition qui le couvre), sans `hide_from_home` sur Tout. C'est le
  nombre de lignes que rend `app_events_in_range` pour la même plage (avec `hide_from_home=is.false`
  sur Tout) : le « Voir les N événements » d'une liste qui montre aussi les expositions en cours.
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
                    category text = null, at_time timestamp = null)
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
fonction lit les événements à venir par l'index sur `date` (`app_events_in_range`), puis compare leurs
textes ; le plein texte d'une description et les trigrammes ne sont calculés que pour un texte qui
contient le début de la racine ou un trigramme du mot. Mesuré sur une base locale chargée de
l'instantané (Postgres 17.6, PostgREST v13.0.5, rôle anon, l'appel complet de l'app avec ses
jointures, 30 événements, ~90 Ko) : `app_search` 25 à 45 ms aller-retour, dont ~25 ms en base ;
`app_search_names` 7 à 11 ms. Avec 5 000 événements passés de plus : inchangé (index sur `date`) ;
avec 3 fois plus d'événements à venir (1 137) : ~75 ms en base, linéaire.

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
- `POST /api/notion/resync`

Docs plus anciennes sur ces routes, antérieures à ce contrat : `MOBILE_NOTIFICATIONS_API.md`,
`ADMIN_NOTIFICATIONS_NEW_REQUESTS.md`.
