# Log des migrations Supabase

## Statut actuel (mode dev / squash)

- **Migrations actives** : uniquement les fichiers SQL situés directement dans `supabase/migrations/`.
- **Migrations archivées** : tout ce qui est dans `supabase/migrations/archives/` est **historique** et **ne doit plus être appliqué**.

## Baseline (migration unique)

- **Migration** : `20251212120000_baseline.sql`
- **But** : contenir le schéma final (baseline) après squash des migrations historiques.

## Historique (archivé)

- Les anciennes migrations incrémentales ont été déplacées dans `supabase/migrations/archives/`.
- `_sync_existing_migrations.sql` a également été archivé.

## 2026-10-17 — Schéma unique

- `live-admin/supabase/migrations/` devient la seule source du schéma ; `live/supabase/` est supprimé.
- Recopiées depuis l'app (elles n'existaient que là) :
  `20251216000001_audit_and_reinforce_rls_policies`, `20260415123000_format_entity_names`,
  `20260415190000_add_generic_price_range`, `20260415194000_bootstrap_notification_defaults`,
  `20260415213000_add_pay_what_you_want_to_events`, `20260504163000_normalize_event_categories_set`,
  `20260505171500_add_hide_from_home_to_events`, `20260821124000_configure_notification_api_url`.
- Fichiers homonymes : la version admin est conservée (les 4 migrations de janvier 2025 ne
  différaient que par des lignes vides ; la baseline de l'app avait été modifiée après coup pour
  y ajouter `price_min` / `price_max` / `is_pay_what_you_want`, déjà ajoutées par leurs migrations).
- Ajoutées : `20260915120000_add_show_on_app_and_agenda_types`, `20261017120000_create_app_events_function`.
- Aussi déplacés depuis l'app : `supabase/functions/delete-user`, `supabase/templates/otp_email.html`.


## 2026-10-18 — Application en prod

- État relevé avant : les 8 migrations recopiées depuis l'app étaient déjà appliquées ; `show_on_app` et
  `app_events()` absents. `supabase_migrations.schema_migrations` s'arrête à `20251214000001` : il n'est
  plus tenu (migrations passées par le SQL Editor), ne pas s'y fier.
- Appliquées via psql, une transaction par fichier : `20260915120000_add_show_on_app_and_agenda_types`
  (`UPDATE 0` : la valeur par défaut a rempli les lignes, aucun trigger déclenché), puis
  `20261017120000_create_app_events_function`.
- Vérifié : 295 événements, tous `show_on_app = true` ; `app_events()` en anon = 254 lignes = calcul direct ;
  plan inliné (index `idx_events_approved_visible_date`).
- PostgREST v13 sur `rpc/app_events` : `order` sur une colonne absente du `select` échoue, et les filtres
  sur une jointure (`event_artists.artist_id=eq.…`) ne sont pas supportés.

## 2026-10-18 — `app_cities()` : villes de l'app et leur activité

- `20261018200000_create_app_cities_function` : une ligne par ville proposée dans l'app. Villes actives
  regroupées par libellé d'affichage (`extract_city_label_from_address`, comparé via `normalize_city_label`),
  centre moyen, alias, ids regroupés ; activité d'après `app_events()` : événements à venir / récents,
  prochaine et dernière date, fenêtre minuit UTC - 120 j / + 365 j. `stable`, `security invoker`,
  `execute` à anon et authenticated. Prérequis : `app_events()`.
- Remplace le calcul Dart de `PublicPreferencesService` (app), qui lisait `cities` puis toutes les lignes
  de `app_events()` de la fenêtre. Écart théorique seulement : la normalisation SQL traite `æ` → `ae` et
  ignore `å` (l'inverse en Dart), et `[[:alpha:]]` accepte toutes les lettres (Dart : `[A-Za-zÀ-ÿ]`).
- Testée sur un Postgres 17 local avec toutes les migrations (baseline puis les suivantes) : sortie identique
  à l'ancien calcul Dart sur l'instantané prod du 2026-10-18 lu en anon (17 villes, 359 événements) et sur
  un jeu de cas limites (regroupements, villes inactives, ville du lieu, bornes de dates, événements en cours).
- **À appliquer en prod (SQL Editor) avant de merger la PR de l'app.** Vérification, en anon :
  `GET /rest/v1/rpc/app_cities` → une ligne par ville active, ou dans le SQL Editor
  `select label, upcoming_events_count, recent_events_count from public.app_cities();`.

## 2026-10-19 — Retrait des triggers de notification admin

- `20261019200000_drop_notify_admins_triggers` : supprime `trigger_notify_admins_new_request`
  (`user_requests`), `trigger_notify_admins_new_feedback` (`feedbacks`), leurs fonctions, et
  `notify_admins_new_request(uuid)` / `notify_admins_new_feedback(uuid)` (un RAISE NOTICE, jamais
  appelées, exposées en RPC). Rejouable (IF EXISTS), sans CASCADE.
- Ces triggers n'ont jamais rien envoyé : `body := payload::text`, alors que `net.http_post` attend du
  `jsonb` ; l'erreur finissait en WARNING. Les admins sont notifiés par le code (`/api/user-requests` ;
  repli de l'app via `new-request` ; ancien formulaire de feedback via `new-feedback`) : rien ne change
  pour eux. Réparés, ils auraient doublé ces notifications et notifié chaque ligne importée (scraping,
  Facebook, Notion).
- La baseline (dump de décembre 2025) ne contient ni ces triggers ni ces fonctions : en prod, ils
  n'existent peut-être pas, ou seulement les fonctions (recréées par `20260821124000`).
- Testée sur une base Supabase locale jetable (Postgres 17, pg_net 0.19.5, toutes les migrations).
  Avant : une demande et un feedback insérés (transaction annulée) donnent chacun un WARNING
  `function net.http_post(url => text, headers => jsonb, body => text) does not exist`, aucune requête
  en file. Après : plus de WARNING. Rejouée sans erreur ; passe aussi avec les fonctions sans les
  triggers ; échoue sans rien supprimer si un autre trigger utilise encore l'une des fonctions.
- **À appliquer en prod (SQL Editor, ou psql en une transaction)** après la vérification en lecture
  seule de la PR (pg_net, triggers des deux tables, définitions en place).

## 2026-10-19 — Vignettes des affiches (C7a)

- `20261019190000_add_event_image_cards` : `events.image_card_url`, `image_width`, `image_height`,
  `image_color` (et `image_card_error`), remises à null à l'insertion et quand `image_url` change
  (trigger `events_reset_image_card`). Contraintes : dimensions > 0 et ensemble, couleur `#rrggbb`,
  pas de vignette sans dimensions ni couleur.
- Trigger `events_request_image_card` : webhook pg_net vers `POST /api/events/<id>/image-card` quand une
  affiche apparaît ou change, avec le secret Vault `image_card_webhook_secret` ; sans secret, rien ne
  part (le cron quotidien `/api/cron/image-cards` rattrape). Crée `pg_net` s'il manque.
- `queue_event_sync_job()` : une mise à jour qui ne change que ces colonnes (et `updated_at`) n'est plus
  mise en file pour Notion. Reste identique à la définition de `20260414110000`.
- Testée sur une base locale jetable (toutes les migrations, puis rejouée une 2e fois sans erreur), dans
  une transaction annulée : remise à null à l'insertion et au changement d'affiche, pas de webhook sans
  secret ni pour une image_url inchangée, vide ou retirée, URL (par défaut et `app.api_url`), secret,
  corps et délai de la requête, pas de job Notion pour une vignette posée (toujours un pour un autre
  changement et pour une suppression), contraintes, `app_events()` avec les colonnes, enregistrement
  maintenu si pg_net échoue.
- **Appliquée en prod le 20/10/2026** (psql, une transaction, identifiants temporaires de
  `supabase db dump --linked --dry-run`, `SET ROLE postgres`), après les migrations de #17 et #18, sans erreur.
  Vérifié avant : `queue_event_sync_job()` en prod identique au repo (corps à l'octet près, mêmes attributs),
  pg_net 0.19.5 (`http_post(text, jsonb, jsonb, jsonb, integer)`), Vault 0.3.1, aucun objet de C7a déjà là.
  Testée avant sur une base jetable avec toutes les migrations de `main`, dans l'ordre des fichiers et dans celui
  de la prod (celle-ci en dernier) : tests de `supabase/tests/` et contrôles des triggers, tout passe.
- Même jour : `IMAGE_CARD_WEBHOOK_SECRET` sur Vercel (Production, sensible, redéploiement), puis le secret Vault
  `image_card_webhook_secret`. Vérifié de bout en bout : pg_net → `https://www.outlive.fr` → la route répond 404
  sur un id inexistant avec le secret de Vault (401 sans secret).
- Rattrapage (`scripts/backfill-image-cards.mjs`) : 460 événements avec affiche, 338 affiches distinctes →
  326 vignettes (448 événements), 11,0 Mo en tout ; 34,4 Ko en moyenne, médiane 27,6 Ko, 127,9 Ko au plus,
  13 au-dessus de 70 Ko. 12 échecs notés dans `image_card_error` : 11 affiches billetweb.fr en 404, 1 image de
  ccn-orleans.com au-delà de 15 Mo. Aucun job Notion créé.

## 2026-10-19 — `events.is_young_audience` : jeune public

- `20261019120000_add_is_young_audience_to_events` : booléen `NOT NULL DEFAULT false` (ajout instantané, pas de
  réécriture de la table), commentaire. Rempli par la collecte (`lib/events/young-audience.ts`, catégorie de la
  source, `create_event`) et modifiable dans le formulaire d'événement de l'admin.
- Indicateur seulement : `app_events()` ne change pas ; l'app peut lire la colonne (`_eventColumns`) pour signaler
  ou masquer ces événements.
- `lib/supabase/database.types.ts` régénéré par `npm run db:types` : la colonne dans `events` (Row / Insert / Update)
  et le retour de `app_events`, plus `app_cities()`, absente des types depuis `20261018200000`.
- Appliquée en prod le 19/10/2026 (SQL Editor), avant le déploiement de l'admin : le nouveau code écrit la colonne
  à chaque création d'événement. Vérification :
  `select count(*) filter (where is_young_audience) as jeune_public, count(*) from events;`
- Même jour : 52 événements existants cochés d'après `lib/events/young-audience.ts`, liste relue avant écriture.


## 2026-10-19 — Calendrier, vacances scolaires et recherche de l'app (refonte)

- `20261019210000_create_app_events_in_range_and_counts` : `app_event_in_range()` (règle d'appartenance
  d'un événement à une plage), `app_events_in_range()` (`setof events` d'une plage, périmètre, catégorie,
  sans les événements masqués par l'utilisateur ni les auteurs bloqués) et `app_event_counts()` (comptes
  par plage : `events_count`, `starting_count`). Règle en tête du fichier : commence dans la plage, ou
  dure 13 h ou plus et a commencé avant ; pas terminé ; heure de Paris.
- `20261019211000_create_school_holidays` : table `school_holidays` (vacances des élèves, académie
  d'Orléans-Tours, zone B), lecture pour tous, écriture par la clé service role. Remplie par le cron
  hebdomadaire `GET /api/cron/school-holidays` (`vercel.json`, lundi 5 h UTC) depuis le calendrier
  scolaire officiel (data.education.gouv.fr, `fr-en-calendrier-scolaire`).
- `20261019212000_create_app_search_counts` : `app_category_counts()` et `app_tag_counts()` (nombre
  d'événements à venir par catégorie et par tag, dans le périmètre). Pas d'index GIN sur `tag_ids` :
  sous la RLS, `@>` (non « leakproof ») ne peut pas s'en servir.
- `language sql`, `stable`, `security invoker`, sans clause SET, `execute` à anon et authenticated ; au-dessus
  de `app_events()`. Contrat pour l'app : `docs/API_APP.md` (« Fonctions SQL de la refonte »).
- Testées : `npm run db:test` (nouveau, `scripts/db-test.sh`) sur une base Supabase locale jetable
  (Postgres 17.6, toutes les migrations), 42 cas dans `supabase/tests/` ; le chargeur des vacances par
  `node --test lib/school-holidays/official-calendar.test.mjs` et sur le vrai jeu officiel (64 périodes,
  Toussaint 2026 du 17 octobre au 1er novembre) ; les appels de l'app rejoués par PostgREST v13.0.5 sur
  une base locale chargée de l'instantané prod du 2026-10-19 (lu en anon), plans compris.
  `lib/supabase/database.types.ts` régénéré par `npm run db:types`.
- **Appliquées en prod le 20/10/2026** (psql, une transaction par fichier, identifiants temporaires de
  `supabase db dump --linked --dry-run`, `SET ROLE postgres`), sans erreur. Vérifié en anon le même jour :
  `rpc/app_category_counts` (9 catégories, Spectacle 205), `rpc/app_tag_counts`, `rpc/app_event_counts`
  (GET avec `ranges` en JSON), `rpc/app_events_in_range`, `school_holidays` (table vide).
- PR mergée et déployée le 20/10/2026, vacances chargées le même jour par la route du cron (75 lignes
  lues, 64 périodes écrites, « Début des Vacances d'Été » 2028 écartée) ; vérifié en anon :
  `GET /rest/v1/school_holidays?last_day=gte.2026-10-19` (Toussaint du 17/10 au 1/11).

## 2026-10-20 — `events.price_kind` : genre de prix

- `20261020100000_add_price_kind_to_events` : colonne générée (STORED) `price_kind` : `pay_what_you_want`,
  `unknown` (aucun prix connu), `free` (tous les prix connus à 0), `paid`. Prix connus : `price_min`,
  `price_max`, à défaut `price` ; une valeur négative ne compte pas. Décision de l'utilisateur : 0 = « Gratuit »,
  prix non renseigné = rien d'affiché ; avant, l'app, la page d'artiste et les visuels affichaient « Gratuit ».
- L'ajout réécrit `events` une fois sans déclencher ses triggers (pas de job Notion, `updated_at` inchangé).
  Aucun code n'écrit la colonne : tous les inserts et updates de `events` listent leurs colonnes (admin, app,
  fonctions SQL, vérifié) ; une écriture de `price_kind` est refusée (`428C9`).
- Lue par l'admin : `formatGenericPriceLabel` (`lib/events/price-utils.ts`), page de partage, page d'artiste,
  visuels pour les réseaux, liste de l'espace organisateur. L'espace organisateur a le choix de tarif de l'admin
  (`lib/events/price-mode.ts`, composant `event-price-field.tsx`). `lib/supabase/database.types.ts` régénéré.
- Testée : `npm run db:test` (9 cas dans `supabase/tests/price_kind.test.sql`), `lib/events/price-mode.test.mjs`,
  et par PostgREST v13.0.5 sur l'instantané prod du 2026-10-19 : `paid` 184, `unknown` 154, `free` 33,
  `pay_what_you_want` 22 ; « Fora | ALICE RENDE » (sans prix) en `unknown`, « PLUTO #1 » (0 à 5 €) en `paid`.
- **Appliquée en prod le 20/10/2026** (psql, une transaction, `SET ROLE postgres`), avant le déploiement de l'admin
  et de l'app (leurs requêtes sélectionnent la colonne). Vérifié en anon le même jour : 391 événements publiés, aucun
  `price_kind` nul ; `paid` 184, `unknown` 152, `free` 33, `pay_what_you_want` 22 ; `app_events_in_range()` la rend.

## 2026-10-20 — `app_organizer_counts()` : événements à venir des organisateurs

- `20261020140000_create_app_organizer_counts` : pour chaque id demandé, organisateur (`organizers`, par
  `event_organizers.organizer_id`) ou lieu (`locations`, par `event_organizers.location_id` et
  `events.location_id`, chaque événement une fois), le nombre d'événements à venir
  (`app_events_in_range` à partir d'aujourd'hui, périmètre facultatif). Pour la fiche de l'app
  (« Organisé par … · 40 événements à venir »), décision de l'utilisateur du 2026-10-20.
- `language sql`, `stable`, `security invoker`, `execute` à anon et authenticated ; aucune table modifiée.
- Testée : `npm run db:test` (5 cas dans `supabase/tests/app_organizer_counts.test.sql` : organisateur, lieu
  qui organise et accueille, simple salle, passé, en attente, exposition en cours, périmètre, événement masqué,
  ids inconnus ou en double) ; par PostgREST v13.0.5 sur l'instantané prod du 2026-10-20 : 28 organisateurs,
  aucun écart avec un calcul indépendant (Théâtre d'orléans 84, Tête Noire 48, Artéphé 35) ; environ 9 ms.
- **Appliquée en prod le 20/10/2026** (psql, une transaction, `SET ROLE postgres`), sans erreur. Vérifiée en anon
  le même jour : les 28 organisateurs reliés à des événements, aucun écart avec un calcul indépendant ; Théâtre
  d'orléans 84.

## 2026-10-20 — Rattrapage de la prod : trois migrations jamais appliquées

- Écart trouvé en comparant les types générés depuis la prod
  (`supabase gen types typescript --project-id tkyuiltgvqcgebnqdgmb --schema public`) à
  `lib/supabase/database.types.ts`, puis confirmé en lecture seule (psql, `BEGIN READ ONLY … ROLLBACK`) :
  - `20260415150000_add_notification_log_delivery_keys` absente : `notification_logs` sans `flow_type`,
    `delivery_date`, `delivery_key`. `claimNotificationDelivery` (`lib/notifications/index.ts`) filtre sur
    `delivery_key` et lève une erreur : les crons `daily-events` (tous les jours, 8 h UTC) et `weekly-summary`
    (lundi, 8 h UTC) échouaient pour chaque utilisateur, sans rien envoyer. `notification_logs` était vide
    (aucune ligne, le cron `cleanup` efface au-delà de 90 jours) : aucun résumé parti depuis au moins juillet,
    sans doute depuis avril. Les journaux Vercel ne remontent pas assez loin pour le montrer.
  - `20260428180500_add_scan_timing_and_opportunity_log_link` absente (32 scans, 166 opportunités).
  - `20261019200000_drop_notify_admins_triggers` pas encore appliquée : les triggers
    `trigger_notify_admins_new_request` (`user_requests`) et `trigger_notify_admins_new_feedback` (`feedbacks`)
    et les quatre fonctions `notify_admins_new_*` existaient, aucun autre trigger ne les utilisait.
  - En plus en prod, dans aucune migration ni archive : `to_tag_title_case(text)`, `tags_force_title_case()`
    et le trigger `trg_tags_force_title_case` sur `tags`. Repris dans `20261020160000_capture_tag_title_case`
    (décision de l'utilisateur : garder).
- **Appliquées en prod le 20/10/2026**, avec l'accord de l'utilisateur, dans cet ordre : psql, une transaction
  par fichier (`--single-transaction`, `ON_ERROR_STOP`), identifiants temporaires de
  `supabase db dump --linked --dry-run`, `SET ROLE postgres`. Sans erreur.
- Vérifié après, en lecture seule : les trois colonnes de `notification_logs` et ses deux index (unique partiel
  sur `delivery_key`) ; les quatre colonnes de `event_source_scan_logs`, sa contrainte et son index,
  `event_opportunities.source_scan_log_id` (FK `ON DELETE SET NULL`) et son index ; plus aucune fonction
  `notify_admins_new_%` ni trigger `trigger_notify_admins_%`. Types régénérés depuis la prod : plus aucun écart
  avec `lib/supabase/database.types.ts`.
- `20261020160000_capture_tag_title_case` : recopie à l'identique de la prod (`pg_get_functiondef` comparé à
  l'octet près, mêmes attributs : IMMUTABLE, SECURITY INVOKER, sans SET). **Rien à appliquer en prod.** Testée
  sur un Postgres 17 local nu (table `tags` seule) : appliquée deux fois sans erreur,
  `supabase/tests/tag_title_case.test.sql` passe (4 cas). `npm run db:test` pas relancé (Docker arrêté).
  `to_tag_title_case` ajoutée à la main dans `database.types.ts`, ligne identique aux types générés depuis la prod.
  Les 163 tags de la prod respectent déjà la règle.
- Premier envoi attendu : `daily-events` le 21/10/2026 à 8 h UTC (10 h à Paris), `weekly-summary` le lundi
  26/10/2026 à 8 h UTC (9 h à Paris). Les crons n'ont pas été lancés à la main (ils écrivent à de vrais
  utilisateurs). Vérification, dans le SQL Editor, après 8 h UTC :
  `select flow_type, delivery_date, count(*), count(sent_at) as envoyees from notification_logs where delivery_date >= '2026-10-21' group by 1, 2;`
  (une ligne par utilisateur servi ; sans `sent_at`, l'envoi n'a pas abouti), et dans Vercel (projet `outlive`,
  Logs, chemin `/api/cron/notifications/daily-events`) : ligne « Notifications envoyées: N réussies, 0 échecs ».
- Reste ouvert : la policy `Users can view all event likes` (`event_likes`, SELECT `USING (true)`, rôle `public`)
  est bien celle de la prod : avec la clé publique, n'importe qui lit qui a aimé quoi. L'app compte les likes de
  « Mes contributions » en lisant ces lignes (`EventLikeService.getLikeCount`) : il faut d'abord une fonction de
  comptage, puis restreindre la lecture à `auth.uid() = user_id`. Non appliqué.

## 2026-10-20 — `app_search()` et `app_search_names()` : recherche plein texte de l'app

- `20261020170000_create_app_search` : la recherche de l'app sur toute la base (audit UI/UX du 2026-10-20,
  U1 : « concert » ne rendait qu'un résultat, l'app ne cherchant que dans les 200 événements chargés).
  - `app_search(query, city_ids, at_time, max_results)` : événements à venir (comme les comptes de la recherche)
    dont chaque mot exigé se trouve dans le titre, les artistes liés, le lieu, les organisateurs, la catégorie,
    les tags, la ville ou la description ; sans accents ni casse (`unaccent`), début de mot, racine française
    (plein texte), fautes de frappe (`pg_trgm`, ressemblance stricte). Pertinence pondérée titre > artistes, lieu
    et organisateurs > catégorie, tags et ville > description, puis date. Rend des lignes `(event_id, rank)` de la
    table `app_search_results`, toujours vide (RLS sans politique, aucun droit), dont la clé étrangère vers
    `events` permet à l'app `select=rank,event:events(…)&order=rank` : un `setof events` perdait son ordre dans
    les jointures de PostgREST.
  - `app_search_names(query, city_ids, at_time, max_results)` : catégories, tags, lieux et organisateurs dont le
    nom correspond, avec leur nombre d'événements à venir (comptes d'`app_category_counts`, `app_tag_counts`,
    `app_organizer_counts`), pour les raccourcis « Concert · 47 » et les lieux de la recherche.
  - Fonctions d'appoint : `app_search_normalize`, `app_search_query_words`, `app_search_word_score`.
  - Extensions `unaccent` et `pg_trgm` créées dans le schéma `extensions` si absentes (absentes en prod le
    2026-10-20 : schémas `public` et `extensions` relus par `supabase gen types --project-id`) ; la migration
    s'arrête si l'une est déjà installée ailleurs.
- `language sql`, `stable`, `security invoker`, `execute` à anon et authenticated ; aucune table existante modifiée.
  Pas d'index : sous la RLS d'`events`, `%` et `@@` n'en prendraient pas.
- Testée : `npm run db:test` (37 cas dans `supabase/tests/app_search.test.sql` : titre, catégorie par id ou nom,
  description, accents, début de mot, racine, fautes de frappe, artiste, organisateur, tag, ville, mots épars et
  phrase, titre exact, mots vides, périmètre, passé, en attente, masqué, auteur bloqué, `hide_from_home`,
  `max_results`, noms et leurs comptes, homonymes, droits) ; par PostgREST v13.0.5 sur l'instantané prod du
  2026-10-20 (367 événements à venir, lu en anon) : comptes des noms égaux à ceux des trois fonctions de comptes,
  appel complet de l'app 25 à 45 ms en local. `lib/supabase/database.types.ts` régénéré par `npm run db:types`.
- **Appliquée en prod le 20/10/2026** avec l'accord de l'utilisateur (psql, une transaction, `SET ROLE postgres`,
  après une répétition dans une transaction annulée), sans erreur : `unaccent` et `pg_trgm` créées dans
  `extensions`. Vérifiée en anon le même jour, l'appel exact de l'app : « concert » (les deux titres, puis les
  concerts ; « Concert » 47 et « #Concert » 8 en noms), « theatre d orleans » (le lieu, 84, puis ses événements),
  « luiza » (ses 2 événements), « jaz » (« #Jazz » 5) ; `app_search_results` illisible en anon (401). Mesurée :
  `app_search` seule ~125 ms, l'appel de l'app 140 à 200 ms : d'où `20261020210000_speed_up_app_search`.

## 2026-10-20 — `event_like_counts()` et lecture de `event_likes` réservée à son auteur

- Constat (prod, 2026-10-20) : la policy SELECT « Users can view all event likes » de `event_likes` est
  `USING (true)` pour public, et anon a SELECT : avec la clé publique, n'importe qui lit quel utilisateur
  (`user_id`) a aimé quel événement. L'app s'en servait pour compter les favoris de « Mes suggestions »
  (`EventLikeService.getLikeCount` : toutes les lignes d'un événement).
- `20261020180000_create_event_like_counts` : `event_like_counts(event_ids uuid[])` → `(event_id, likes_count)`,
  pour les événements visibles dans l'app (`app_events()`) et ceux créés par l'appelant (`created_by`, quel que
  soit leur statut) ; pas de ligne pour les autres ; au plus 200 ids. `security definer`, `set search_path = ''`,
  `stable` ; `execute` à anon et authenticated, retiré à public. Aucune table modifiée.
- `20261020181000_restrict_event_likes_select` : remplace la policy par « Users can view their own event likes »
  (`TO authenticated USING ((select auth.uid()) = user_id)`), comme INSERT et DELETE. L'app ne lit que les lignes
  de l'utilisateur (`user_id` filtré : cœur, liste des favoris) ; l'admin ne lit pas la table. **À appliquer
  quand les versions de l'app en circulation passent par `event_like_counts`** : une ancienne version
  afficherait 0 favori (ou 1) dans « Mes suggestions ». En prod le 2026-10-20 : une seule ligne dans
  `event_likes`, sur un événement qui n'est pas une suggestion communautaire (aucun compteur affiché) :
  appliquer maintenant ne change rien de visible.
- Testées : `npm run db:test` (9 cas dans `supabase/tests/event_likes.test.sql` : anon, auteur, autre compte,
  ids inconnus ou en double, droits d'exécution, lignes lisibles par chacun, favori ajouté et retiré).
  `lib/supabase/database.types.ts` régénéré.
- App : PR de `live` qui passe « Mes suggestions » par `event_like_counts` (un appel pour toutes les contributions).
- **Les deux appliquées en prod le 20/10/2026** (psql, une transaction par fichier, `SET ROLE postgres`), sans
  erreur, sur décision de l'utilisateur de ne pas attendre la mise à jour de l'app (une seule ligne dans la table).
  Vérifié le même jour : en anon, `GET /rest/v1/event_likes` → `[]` ; `rpc/event_like_counts` → le compte (1) de
  l'événement aimé, rien pour un id inconnu ; policy SELECT « Users can view their own event likes » seule.
  Les versions de l'app d'avant la PR afficheront 0 favori dans « Mes suggestions ».

## 2026-10-20 — `copy_guest_data()` : les données d'un invité passent sur son compte

- `20261020200000_create_copy_guest_data` : appelée par l'app à la connexion d'un compte, avec l'id de la session
  invitée (`auth.sessions.id`, claim `session_id` du jeton de l'invité). Recopie sur l'appelant les favoris et les
  masqués de l'invité (sans doublons), et ses préférences de notification avec leurs catégories si le compte n'en a
  pas. Appelant non anonyme, source anonyme (`auth.users.is_anonymous`), sinon `42501`. Audit UI/UX du 2026-10-20
  (U6) : l'app lisait ces lignes avec le jeton du compte, la RLS ne lui rendait rien.
- `language plpgsql`, `security definer`, `set search_path = ''` ; `execute` à authenticated seulement. Lit
  `auth.users` et `auth.sessions`, écrit `event_likes`, `user_hidden_events`, `user_notification_preferences`,
  `user_notification_categories` (aucun trigger à l'insertion sur ces tables).
- Testée : `npm run db:test` (14 cas dans `supabase/tests/copy_guest_data.test.sql` : compte neuf, compte qui a
  ses préférences, appel rejoué, invité appelant, session d'un compte, inconnue ou nulle, id d'utilisateur à la
  place de l'id de session, anon). `lib/supabase/database.types.ts` régénéré.
- **Appliquée en prod le 20/10/2026** (psql, une transaction, `SET ROLE postgres`), sans erreur, avec l'accord de
  l'utilisateur. Vérifié avant : `auth.users.is_anonymous` présent, `auth.sessions` lisible par postgres, les quatre
  contraintes uniques en place, aucun trigger à l'insertion. Vérifié après : propriétaire postgres, `security definer`,
  `search_path` vide, `execute` à authenticated et pas à anon ; dans une transaction annulée, un appelant inconnu →
  `42501` ; par PostgREST avec la clé anon → 401 (`42501`). Pas d'appel avec un vrai compte (aucune donnée recopiée).

## 2026-10-20 — `app_search()` deux fois plus rapide

- `20261020210000_speed_up_app_search` : `app_search` compare les noms (lieux, salles, artistes, organisateurs,
  catégories, tags, villes) une fois chacun, puis rattache ceux qui correspondent aux événements à venir par leurs
  liens, au lieu de reconstruire les textes de chaque événement (artistes et organisateurs relus événement par
  événement sous la RLS de leurs liens : plus de la moitié du temps, d'après un EXPLAIN ANALYZE en prod, lecture
  seule). Même signature, mêmes règles et poids, mêmes résultats.
- Testée : `npm run db:test` (les 37 cas de `supabase/tests/app_search.test.sql`) ; résultats identiques, ordre
  compris, à la première version sur 28 requêtes (instantané du 2026-10-20) ; en local, 11 à 16 ms au lieu de
  23 à 27 ms.
- **Appliquée en prod le 20/10/2026** avec l'accord de l'utilisateur : répétition dans une transaction annulée (mêmes
  résultats que la version en place sur 9 requêtes, ordre compris), puis application. Le corps d'`app_search` en
  prod est celui de ce fichier (appliqué en rejouant, en une transaction, la migration 20261020170000 qui le
  contenait alors). Mesurée en anon : `app_search` seule 40 à 70 ms, l'appel de l'app 60 à 95 ms avec peu de
  résultats et ~100 à 120 ms avec 30 événements embarqués (l'embarquement seul : ~50 à 60 ms) ;
  `app_search_names` 25 à 40 ms.

## 2026-10-20 — U39 : fermer ce que la clé publique (anon) lisait/appelait

- `20261020220000_restrict_anon_function_and_invitation_access` : audit de toutes les tables `public` portant un
  `user_id`/`created_by`/une donnée personnelle et des fonctions SECURITY DEFINER exposées à anon (tableau table
  par table dans la PR). Fuites fermées :
  - **`organizer_invitations`** : la policy SELECT `USING (true)` rendait e-mail invité + token (le secret qui
    permet de rejoindre l'équipe d'un organisateur) de toutes les invitations, à la clé anon. Remplacée par trois
    policies (admin conservée ; propriétaire de l'organisateur ; utilisateur connecté dont l'e-mail est celui de
    l'invitation). La vérification par lien (`/api/organizer/invite/verify`) lit déjà en service role ; l'acceptation
    exige d'être connecté.
  - **`make_user_admin(email)`** : EXECUTE à anon → escalade de privilèges (se nommer admin). Retirée de
    anon/authenticated/PUBLIC.
  - **`get_user_emails(uuid[])`** : résolvait uuid → e-mail pour tout le monde ; combinée à `events.created_by`
    (public, nécessaire au blocage/signalement côté app), elle reliait un événement à l'e-mail de son auteur. Garde
    interne ajoutée (admin ou propriétaire d'organisateur) ; retirée de anon.
  - `get_or_create_user_by_email`, `get_invitation_by_token`, `check_rls_policies` : retirées de
    anon/authenticated/PUBLIC (aucun appelant PostgREST).
  - `convert_event_request_to_event_service`, `cleanup_free_tier_technical_data`, `enqueue_notion_sync_job`,
    `claim_notion_sync_jobs`, `upsert_city`, `refresh_city_center`, `resolve_city_id_from_address` : réservées au
    service role (triggers non concernés : ils tournent avec les droits du propriétaire).
  - `accept_organizer_invitation` : garde `user_id_param = auth.uid()` ; retirée de anon.
  - Inchangées : fonctions `app_*`, `event_like_counts`, `copy_guest_data` (l'app en dépend) ; `is_user_admin`,
    `is_user_organizer`, `is_user_safety_suspended`, `can_use_ugc_features`, `is_event_approved_*` (évaluées dans
    les policies RLS, ne renvoient qu'un booléen sur l'appelant).
- Rejouable. Aucun changement de signature → `lib/supabase/database.types.ts` inchangé (régénéré, aucun diff).
- Testée : `npm run db:test` (12 cas dans `supabase/tests/anon_privacy.test.sql` + suite complète verte). App et
  admin vérifiés par grep des deux dépôts : l'app n'appelle aucune fonction restreinte ; les deux appelants de
  `get_user_emails` (route admin, page équipe d'un organisateur) sont admin ou propriétaire.
- **Appliquée en prod le 21/10/2026** par l'utilisateur (psql, `--single-transaction`, `SET ROLE postgres`), dans
  sa version de cette PR (droits Notion seulement si les fonctions existent : elles étaient déjà retirées), après une
  répétition dans une transaction annulée, sans erreur. Les deux NOTICE « policy … does not exist, skipping » sont
  attendus (nouvelles policies, `DROP … IF EXISTS` avant leur création).

## 2026-10-20 — Noms en français (U34) ; titres et descriptions des événements repris (U31, U32)

- `20261020223000_french_case_names` : `format_entity_label` (trigger des noms de lieux, d'organisateurs et
  d'artistes) et `to_tag_title_case` (trigger des tags, `20261020160000`) passaient chaque mot par `initcap`, qui
  en prod (collation ICU, `datlocprovider = i`) ne coupe pas le mot à l'apostrophe : « Théâtre d'orléans »,
  « L'astrolabe », tags « Théâtre D'orléans ». Corrigés à la main, ces noms revenaient à l'écriture suivante.
  Nouvelle règle, indépendante de la collation : capitale après une élision, petits mots en minuscules dans les noms
  composés (« Saint-Jean-le-Blanc »), petit mot ou mot élidé en capitales jamais pris pour un sigle, virgule finale
  retirée ; les tags suivent la même règle sur leur nom en minuscules, quelques sigles gardés (« DJ Set », « CDNO »).
  Puis les noms existants repassent par leur trigger, et cinq corrections nommées (« Cinema » → « Cinéma »,
  « Château de la Source », « Base de Loisirs de Chécy », « Collectif XY », tag « Orléans »).
- Testée : `supabase/tests/entity_names.test.sql` (nouveau), `tag_title_case.test.sql` et `app_search.test.sql`
  mis à la nouvelle règle, toute la suite sur une base Supabase locale (Postgres 17, ICU comme la prod).
- Répétée en prod dans une transaction annulée (`BEGIN … ROLLBACK`) : 33 noms changés, les mêmes que sur
  l'instantané public (16 lieux, 1 organisateur, 5 artistes, 8 tags, 1 catégorie), aucun slug d'artiste modifié,
  21 synchronisations Notion mises en file.
- **Appliquée en prod le 20/10/2026**, avec l'accord de l'utilisateur (psql, `--single-transaction`,
  `SET ROLE postgres`), sans erreur. Vérifié après, en lecture seule : plus aucun nom à reformater dans les quatre
  tables ; catégories « Concert | DJ Set | Expo | Atelier | Spectacle | Danse | Cinéma | Rencontre | Festival ».
- Données des événements (pas une migration) : `scripts/clean-event-texts.mjs` (règles de
  `lib/collecte/event-text.ts`), simulation relue par l'utilisateur, puis `--write` le 20/10/2026 : 469 événements
  lus (non archivés, publiés ou en attente), **249 mis à jour** (239 titres, 52 descriptions), 0 échec, une ligne
  `event.text_cleanup` par événement dans `admin_audit_log`. Une nouvelle simulation ne trouve plus rien. Gardés :
  le lieu en fin de titre de 7 événements en attente sans lieu ni adresse (« … - Théâtre de la Tête Noire »).
- Vu en passant : la file Notion grossissait (532 tâches en attente le 20/10 au soir, dont celles de ces corrections ;
  cron trop lent, pas bloqué). La synchro est retirée : voir « 2026-10-20 — Synchronisation Notion retirée » ci-dessous.

## 2026-10-20 — Fiches d'artistes qui sont des titres d'événements

- `20261020233000_clean_title_artists` : données seulement (schéma et `database.types.ts` inchangés). 22 fiches
  créées le 17/10/2026, avant que l'import découpe les plateaux (`splitArtistNames`, `lib/events/artist-names.ts`) :
  nom du plateau, du titre, ou mention qui n'est pas un artiste. Relevé sur l'instantané public du 2026-10-20
  (195 artistes, tous lisibles en anon ; descriptions des événements et pages de L'Astrolabe pour les titres).
  - 14 renommées, même id (l'app ouvre une fiche par son id) ; le slug, donc l'URL `/artists/<slug>`, suit le nom :
    « Alcest + 1ere Partie » → « Alcest », de même « Jeanne Added », « Les Louanges », « Luiza », « Razorlight »,
    « Robert Finley », « Syd Matters », « Zed Yun Pavarotti », « Folie's », « Zélie » (orthographe de la salle) ;
    « Assassin + Triptik » → « Assassin » + « Triptik » (créée), « La Jungle + Sodom & Sagesse » → « La Jungle »
    + « Sodom & Sagesse » (créée), « Pluto #1 : The Gnomes » → « The Gnomes », « Piche "Carré" » → « Piche ».
  - 8 supprimées avec leurs liens, les autres artistes des événements restent : « Le Cabaret Magnifique : 1926 »,
    « Coeur Gruyère - Ciné Concert », « Bubble Boum, Ça Chauffe sur le Ring », « Panique!! » (titres sans artiste
    nommé), « Atelier Afro-Cubain » et « Atelier Jazzy » (restent Igor Ivanov et Franck Sallé), « Bahini
    Illustration » (animatrice d'atelier), « Lucernaire Diffusion » (diffuseur ; reste la Cie les Modits).
  - Si la vraie fiche existe au moment d'appliquer (même nom normalisé), fusion : liens repris, champs vides de la
    vraie fiche complétés par ceux de la fiche-titre, tags réunis. Une ligne `artist.title_cleanup` par fiche dans
    `admin_audit_log` (avant, après, slugs, événements). Rejouable : une fiche déjà traitée est sautée, une fiche
    modifiée à la main depuis le relevé est laissée (NOTICE).
- Testée sur un Postgres 17 local en collation ICU comme la prod (toutes les migrations, plus celles de la PR #29
  déjà en prod) : sans effet sur une base vide ; sur l'instantané public, 14 renommées, 8 supprimées, 2 créées
  (195 → 189 fiches), 22 événements touchés, noms et slugs ci-dessus ; second passage sans effet. Chemins de
  fusion (vraie fiche déjà là, photo et tag repris, lien déjà présent, second nom connu) et fiche modifiée à la main
  vérifiés à part.
- Non relevé : les liens vers des événements non publics (en attente, archivés), que la clé anon ne lit pas ; la
  migration les traite de la même façon (par id d'artiste). Tags homonymes laissés tels quels : « Assassin »,
  « Luiza », « Razorlight », « Robert Finley », « Syd Matters » (portés par aucun événement public ni artiste).
- **Appliquée en prod le 21/10/2026** par l'utilisateur (psql, `--single-transaction`, `SET ROLE postgres`), après
  une répétition dans une transaction annulée au résultat identique : 14 renommées, 0 fusionnées, 8 supprimées,
  2 fiches créées (Triptik, Sodom & Sagesse), noms et slugs ci-dessus, 23 liens d'événements traités (Bahini
  Illustration en avait 2).

## 2026-10-20 — Synchronisation Notion retirée

- `20261020235000_remove_notion_sync` : l'utilisateur retire la synchronisation avec Notion plutôt que de réparer sa
  file. Relevé en prod (lecture seule, 20/10 au soir) : le cron `notion-sync` n'était pas bloqué, il traitait
  25 tâches par passage (un par jour, 02:00 UTC, le dernier le 20/10 à 02:19) quand les modifications en ajoutaient
  70 à 200 par jour depuis le 17/10 (532 en attente) ; l'import Notion → admin ne servait plus depuis mai (dernier
  webhook reçu le 15/05/2026).
- Retirés : les 5 triggers `queue_notion_*` (events, user_requests, locations, organizers, event_organizers) et leurs
  fonctions, `enqueue_notion_sync_job`, `claim_notion_sync_jobs`, `convert_event_request_to_event_service` (écrite
  pour le worker Notion, appelée par personne), les 7 tables `notion_*` (liens : 286 événements dont 173 supprimés
  depuis, 24 demandes, 41 lieux, 43 organisateurs ; 609 tâches, 8 erreurs, 5 points de reprise).
  `cleanup_free_tier_technical_data` ne purge plus la file : même signature, `p_batch_size` sans effet.
- `20261020220000` (U39, appliquée en prod le 21/10/2026, après ce retrait) : ses droits sur les trois fonctions
  Notion ne s'appliquent plus que si elles existent ; elle passe avant ou après le retrait.
- Code, même PR : `lib/notion/`, `/api/notion/webhook` et `bootstrap`, `/api/cron/notion-sync` et son cron
  (`vercel.json`), la carte « Synchronisation Notion » des réglages, `@notionhq/client`, `docs/notion-import/`.
  `POST /api/notion/resync` reste pour les anciennes versions de l'app : JWT admin vérifié, 200 sans effet
  (`docs/API_APP.md`, test dans `lib/api/app/routes.test.mjs`).
- Testée : `npm run db:test` (copie privée du script) : `supabase/tests/remove_notion_sync.test.sql` (7 cas : plus
  aucun objet Notion, écritures sur les 5 tables, purge) et toute la suite ; U39 rejouée après le retrait, puis le
  retrait rejoué, sans erreur. `lib/supabase/database.types.ts` régénéré : 7 tables et 3 fonctions en moins.
- Répétée en prod dans une transaction annulée : 7 tables, 9 fonctions (purge comprise) et 5 triggers Notion avant,
  aucun après ; droits de la purge réduits à postgres et service_role ; U39 rejouée derrière, sans erreur.
- Données exportées avant l'application (lecture seule, 20/10 à 23:04 UTC) dans
  `~/Documents/Backups/outlive/notion-2026-10-20/` sur la machine de l'utilisateur, hors dépôt : un CSV par table
  (lignes recomptées), `SHA256SUMS`, `README.txt` (comment restaurer).
- **Appliquée en prod le 21/10/2026 à 01:05 (23:05 UTC le 20/10)**, avec l'accord de l'utilisateur (psql,
  `--single-transaction`, `SET ROLE postgres`, `lock_timeout` 5 s), sans erreur, en environ 1 s. Vérifié après, en
  lecture seule : aucune table, fonction ni trigger Notion ; purge à postgres et service_role seulement ; autres
  triggers des 5 tables intacts ; `app_events()` rend 391 événements. Jusqu'au déploiement de ce code, l'ancien
  cron `notion-sync` (02:00 UTC) et la carte Notion des réglages échouent, sans autre effet.
- Vercel : les 9 variables `NOTION_*` (Production, Preview, Development) seront retirées une fois ce code déployé,
  avec l'accord de l'utilisateur. Côté Notion (à faire par l'utilisateur) : l'intégration et son abonnement webhook.

## 2026-10-21 — Suivis (U8) : `user_follows`, « Mes suivis » et leur notification

- `20261021140000_add_events_published_at` : `events.published_at`, l'instant où un événement est apparu dans
  l'app pour la première fois (conditions d'`app_events()`), tenu par le trigger `trg_events_set_published_at`
  (jamais effacé ni déplacé, valeurs des clients ignorées) ; les événements déjà visibles prennent leur
  `created_at`. Index partiel `idx_events_published_at`.
- `20261021141000_create_user_follows` : table `user_follows (user_id, target_type, target_id, created_at)`
  (lieu, organisateur, artiste ; invités compris), RLS « chacun ses lignes » en lecture comme en écriture,
  droits réduits (authenticated : lire, suivre, ne plus suivre ; anon : rien) ; trigger de cible (23503 si
  elle n'existe pas) et triggers de suppression sur `locations`, `organizers`, `artists` ;
  `user_notification_preferences.follows_enabled` (vrai par défaut) ; `app_follows()` (« Mes suivis ») ;
  `copy_guest_data()` recréée (DROP + CREATE : une colonne `follows` de plus), qui recopie aussi les suivis
  et `follows_enabled`.
- `20261021142000_create_follows_digest` : `notification_logs.covered_until` et `follows_digest()` (service
  role seulement), lue par le nouveau cron `/api/cron/notifications/follows-digest` (`vercel.json`, 08:00
  UTC). Contrat : `docs/API_APP.md`, « Suivis ».
- Testées : `npm run db:test` (copie privée du script) : `supabase/tests/user_follows.test.sql` (24 cas),
  `supabase/tests/follows_digest.test.sql` (13 cas) et `copy_guest_data.test.sql` inchangé, vert avec la
  fonction recréée. `lib/supabase/database.types.ts` régénéré.
- **Pas encore appliquées en prod.** Ordre : les trois fichiers dans l'ordre des noms, avant le déploiement du
  cron (sans elles, il répond 500 sans rien envoyer) et avant la version de l'app qui suit. Avec l'accord de
  l'utilisateur, après une répétition dans une transaction annulée.
