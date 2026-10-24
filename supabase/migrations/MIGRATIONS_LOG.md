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

## 2026-10-21 — Mesure d'audience de l'app (U41)

- `20261021013000_create_app_audience_counts` : table `app_audience_counts` (un total par jour et par compteur,
  additionné par tous les téléphones ; RLS, lecture par un admin seulement) et fonction `app_audience_add(day,
  counts)`, exécutable par anon et authenticated, sans identité : elle additionne des compteurs connus, de 1 à 200
  par compteur et par appel, pour un jour des 7 derniers jours (heure de Paris), ignore le reste sans erreur et
  efface au passage les jours de plus de 25 mois. Contrat : `docs/API_APP.md` ; conditions de la CNIL :
  `docs/AUDIENCE_ET_PLANTAGES.md` de l'app. Lue par la page « Audience de l'app » (`/admin/audience`).
- Testée : `supabase/tests/app_audience.test.sql` (13 cas) et toute la suite sur une base Supabase locale jetable ;
  types régénérés (la table et la fonction seulement).
- Répétée en prod dans une transaction annulée (`BEGIN … ROLLBACK`) : table et RLS, `execute` pour anon, lecture
  directe refusée à anon ; un appel en anon ajoute un compteur d'hier et ignore le compteur inconnu et un jour de 2020.
- **Appliquée en prod le 21/10/2026**, avec l'accord de l'utilisateur (psql, `--single-transaction`,
  `SET ROLE postgres`), sans erreur. Vérifié après, par HTTP avec la clé publique, sans rien écrire : l'appel avec un
  jour hors fenêtre rend 0 (HTTP 200) ; la lecture de la table est refusée (401, 42501).

## 2026-10-21 — `app_see_also()` : « À voir aussi » en bas de la fiche (U11)

- `20261021110000_create_app_see_also` : les deux rangées qui terminent la fiche de l'app (audit UI/UX du
  2026-10-20, U11 ; maquettes, lot 1), en un appel. `app_see_also(event_id, city_ids, at_time, max_results)` rend
  des lignes `(section, rank, event_id, source_kind, source_id, source_name, source_events_count)` de la table
  `app_see_also_results`, toujours vide (RLS sans politique, aucun droit), dont la clé étrangère vers `events`
  permet à l'app `select=section,rank,…,event:events(…)&order=rank`, comme `app_search`.
  - `place`, « Aussi à <lieu> » : les prochains événements du lieu de l'événement (ceux de sa page et
    d'`app_organizer_counts`, toutes villes), à défaut de l'organisateur qui en a le plus ; par date, avec la
    source et son nombre d'événements à venir (« Les 83 événements du lieu »).
  - `genre`, « Dans le même genre » : même catégorie ou un tag commun, à 7 jours au plus du jour de l'événement,
    dans le périmètre `city_ids`, sans ceux de la première rangée ; les plus proches retenus, rendus par date.
  - Une ligne par spectacle (même titre, normalisé par `app_search_normalize`) : jamais les autres dates du
    spectacle de la fiche (U14), une seule date des autres. La moitié des 363 événements à venir sont d'autres
    dates d'un même spectacle au même lieu (« Les Croquis du TTN » : 7 en 3 jours).
- `language sql`, `stable`, `security invoker`, `execute` à anon et authenticated ; aucune table existante modifiée,
  aucun index.
- Testée : `npm run db:test` (copie privée du script) : `supabase/tests/app_see_also.test.sql` (28 cas : lieu,
  ce qu'il organise ailleurs, hors périmètre, hors accueil, événement passé, expo en cours, repli sur
  l'organisateur ou le lieu qui organise, lieu avant organisateur, sans lieu, aucune source, égalité par nom,
  plage de 7 jours et ses bords, à partir d'aujourd'hui 0 h, catégorie par id, par nom ou hors de `categories`,
  tags, périmètre, rangée « Aussi à » exclue, dates d'un même spectacle, rangs, bornes de `max_results`, en
  attente, inconnu, masqué, auteur bloqué, droits) ; chaque règle faussée à tour de rôle fait échouer au moins
  un cas (27 mutations). Sur l'instantané prod du 2026-10-21 lu en anon (391
  événements, 363 à venir) : rangées vérifiées sur des fiches du Théâtre d'Orléans, du TTN, de L'Astrolabe et une
  expo ; par PostgREST v13.0.5, ordre et embarquement corrects, id inconnu `[]`, id invalide 400, table 401 ;
  la fonction s'exécute en 5 à 12 ms. `lib/supabase/database.types.ts` régénéré : la table et la fonction.
- Répétée en prod dans une transaction annulée, avec l'accord de l'utilisateur : droits (anon exécute la fonction,
  ne lit pas la table, vide), mêmes rangées que sur l'instantané pour Youn Sun Nah et les Croquis du TTN, compte
  du Théâtre d'Orléans égal à `app_organizer_counts` (83) ; la fonction s'exécute en 14 à 17 ms (EXPLAIN ANALYZE
  en anon, 18 appels sur 3 fiches).
- **Appliquée en prod le 21/10/2026 à 09:30 (07:30 UTC)**, avec l'accord de l'utilisateur (psql,
  `--single-transaction`, `SET ROLE postgres`, `lock_timeout` 5 s), sans erreur. Vérifiée en anon, l'appel exact
  de l'app (select de la liste, 6 événements embarqués, `order=rank`) : rangées attendues sur 3 fiches (Théâtre
  d'Orléans, TTN, L'Astrolabe), id inconnu `[]`, id invalide 400, `app_see_also_results` illisible (401).
  Mesurée (`x-envoy-upstream-service-time`, statut 200) : la fonction seule (`select=rank`) ~40 ms (18 à 83) ;
  l'appel de l'app 45 à 90 ms une fois la connexion chaude (médiane 58 ms pour le TTN et L'Astrolabe, 80 à 86 ms
  pour le Théâtre d'Orléans), les premiers appels d'une série 100 à 500 ms, comme `app_search`. Embarquer les 6
  événements avec le select de la liste coûte 25 à 45 ms : un select plus léger pour ces lignes ferait gagner
  d'autant.

## 2026-10-21 — Suivis (U8) : `user_follows`, « Mes suivis » et leur notification

- `20261021140000_add_events_published_at` : `events.published_at`, l'instant où un événement est apparu dans
  l'app pour la première fois (conditions d'`app_events()`), tenu par le trigger `trg_events_set_published_at`
  (jamais effacé ni déplacé, valeurs des clients ignorées) ; les événements déjà visibles prennent leur
  `created_at`, sans toucher à `updated_at` (trigger `update_events_updated_at` désactivé le temps du remplissage :
  l'API v1 expose `updatedAt`). Index partiel `idx_events_published_at`.
- `20261021141000_create_user_follows` : table `user_follows (user_id, target_type, target_id, created_at)`
  (lieu, organisateur, artiste ; invités compris), RLS « chacun ses lignes » en lecture comme en écriture,
  droits réduits (authenticated : lire, suivre, ne plus suivre ; anon : rien) ; trigger de cible (23503 si
  elle n'existe pas) et triggers de suppression sur `locations`, `organizers`, `artists` ;
  `user_notification_preferences.follows_enabled` (vrai par défaut) ; `app_follows()` (« Mes suivis ») ;
  `copy_guest_data()` recréée (DROP + CREATE : une colonne `follows` de plus), qui recopie aussi les suivis
  et `follows_enabled`.
- `20261021142000_create_follows_digest` : `notification_logs.covered_until` et `follows_digest()` (service
  role seulement), lue par le nouveau cron `/api/cron/notifications/follows-digest` (`vercel.json`, 16:00
  UTC depuis le 21/10/2026, voir plus bas). Contrat : `docs/API_APP.md`, « Suivis ».
- Testées : `npm run db:test` (copie privée du script) : `supabase/tests/user_follows.test.sql` (24 cas),
  `supabase/tests/follows_digest.test.sql` (13 cas) et `copy_guest_data.test.sql` inchangé, vert avec la
  fonction recréée. `lib/supabase/database.types.ts` régénéré.
- Répétées en prod dans une transaction annulée (psql, `SET ROLE postgres`, `lock_timeout` 5 s, les trois fichiers
  par `\i`) : avant, 392 événements visibles sur 466, triggers de `events` sans surprise
  (`events_request_image_card`, `events_reset_image_card`, `sync_event_city_before_write`,
  `update_events_updated_at`) ; après, 392 `published_at` égaux à `created_at`, dernier `updated_at` inchangé,
  `app_events()` toujours 392, triggers tous actifs, 3 policies pour authenticated, anon sans droit, 80 préférences
  à `follows_enabled`, `follows_digest()` vide.
- **Appliquées en prod le 21/10/2026 à 11:41 (09:41 UTC)**, avec l'accord de l'utilisateur (psql, une transaction
  pour les trois fichiers, `SET ROLE postgres`, `lock_timeout` 5 s), sans erreur. Vérifié après, en lecture seule :
  les mêmes nombres qu'à la répétition, `copy_guest_data` rend sa colonne `follows` ; par l'API publique en anon,
  `user_follows`, `app_follows`, `follows_digest` et `copy_guest_data` refusés (401, 42501). Le cron des suivis part
  au déploiement de cette PR.
- Heure du message des suivis : 16:00 UTC (18 h l'été, 17 h l'hiver à Paris) depuis le 21/10/2026, au lieu de
  08:00 UTC, pour ne pas tomber à la même minute que le résumé du matin (décision de l'utilisateur ; une ligne de
  `vercel.json`, aucune migration).

## 2026-10-21 — Vignettes de 1 200 px (C7b)

- Aucune migration : le rendu passe à 1 200 px de large et 140 Ko au plus (`lib/image-cards/render.ts`),
  `CARD_VERSION` 2, fichiers dans `event-images/cards/v2/` (`docs/EVENT_IMAGE_CARDS.md`, « Changer le rendu »).
  Les vignettes de 800 px restent affichées jusqu'à être refaites par le rattrapage ; le cron ne les refait pas.
- Simulation en prod (lecture seule) : 0 événement sans vignette, 457 avec une vignette de 800 px,
  335 affiches distinctes, toutes dans Storage.
- Déployée (PR #40) le 21/10/2026 à 13:08 UTC. **Rattrapage fait en prod le 21/10/2026 vers 15:18 UTC**
  (`scripts/backfill-image-cards.mjs --write`, session de la PR #42) : 457 événements réécrits (`updated_at`
  compris, comme le rattrapage de C7a), deux passages, aucun échec durable (11 échecs passagers au premier,
  refaits au second). Un second lancement, à 16:41 UTC par la session vignettes avec l'accord de l'utilisateur,
  n'a rien trouvé à refaire et n'a rien écrit.
- Vérifié ensuite, en lecture seule : simulation du rattrapage, 0 vignette manquante ni d'un ancien rendu ; en anon,
  les 392 événements visibles avec vignette sont tous dans `cards/v2/`. Trois vignettes dépassent 140 Ko
  (212 à 250 Ko) ; la PR #46 borne le poids des suivantes. Les 326 fichiers de 800 px, orphelins, partiront avec
  `scripts/audit-storage.mjs` (délai de 30 jours).

## 2026-10-21 — « Gratuit » et « En famille » (U5) : `free` et `family`

- `20261021160000_add_free_family_filters` : `app_events_in_range()` et `app_event_counts()` prennent deux
  paramètres de plus, `free` et `family` (faux par défaut). Gratuit : `price_kind = 'free'` ; en famille :
  `is_young_audience`, ou le tag « Jeune Public » reconnu par son nom (décision du 2026-10-21, aucune donnée
  écrite). Nouvelle signature : les deux fonctions sont supprimées puis recréées dans le même fichier (deux
  versions feraient hésiter PostgREST), droits remis à anon et authenticated ; les fonctions SQL qui les
  appellent avec cinq arguments au plus (`app_category_counts`, `app_tag_counts`, `app_organizer_counts`,
  `app_search`, `app_see_also`, suivis) ne changent pas. Contrat : `docs/API_APP.md`, « Gratuit » et « En
  famille ».
- Testée sur un Postgres 17 Homebrew local en ICU (bouchons Supabase, toutes les migrations, baseline d'abord) :
  `supabase/tests/app_free_family.test.sql` (14 cas : prix gratuit, « 0 à 5 € », prix libre, inconnu ; case,
  tag, les deux, un tag nul ; périmètre, catégorie, `hide_from_home` sur Tout, plusieurs plages, appels à cinq
  arguments, un `null` qui vaut faux, événements masqués par un compte), et verts avec les fonctions
  recréées : `app_calendar`, `app_search_counts`, `app_see_also`, `app_organizer_counts`, `app_search`,
  `user_follows`, `follows_digest`, `price_kind`, `anon_privacy`. `lib/supabase/database.types.ts` : les
  deux paramètres, à la main (pas de Docker ce jour-là).
- Prod, lecture seule, le 2026-10-21 (toutes villes, à venir) : 364 événements, 29 gratuits, 43 en famille (les
  24 qui ont le tag ont aussi la case) ; aucun n'est retiré de l'accueil.
- Répétée en prod dans une transaction annulée (avec `20261021160000_add_artist_image_credit`, psql,
  `SET ROLE postgres`, `lock_timeout` 5 s) : avant, les deux fonctions à cinq arguments, 362 événements à venir ;
  après, une seule signature chacune (sept et six arguments), anon garde EXECUTE, en anon l'appel à cinq
  arguments de l'app actuelle rend toujours 362, gratuits 29, en famille 42, les deux 7.
- **Appliquée en prod le 21/10/2026 à 17:11 (15:11 UTC)**, à la demande de l'utilisateur (psql,
  `--single-transaction` avec `20261021160000_add_artist_image_credit`, `SET ROLE postgres`, `lock_timeout` 5 s),
  sans erreur. Vérifiée par l'API publique en anon : `app_events_in_range` à cinq arguments 362 (200), `free`
  29, `family` 42, `app_event_counts` avec `free` 29. `supabase gen types` de la prod identique à
  `lib/supabase/database.types.ts` (hors mise en forme).

## 2026-10-21 — Crédit des photos d'artistes (U33)

- `20261021160000_add_artist_image_credit` (PR #39) : `artists.image_credit`, `image_license`,
  `image_source_url` (photos libres de Wikimedia Commons, `docs/ARTIST_PHOTOS.md`), contrainte
  `artists_image_credit_check` (pas de crédit sans photo) et trigger `artists_reset_image_credit` (le crédit
  repart à null quand la photo change seule).
- Répétée puis **appliquée en prod le 21/10/2026 à 17:11 (15:11 UTC)** avec `20261021160000_add_free_family_filters`
  (voir plus haut), sans erreur : 4 artistes avec photo, 0 crédit ; trigger actif. Les colonnes se lisent en anon.

## 2026-10-21 — Séries (U14) : `app_event_series`, et « À voir aussi » par série

- `20261021170000_create_app_event_series` : la règle des séries de l'app (audit UI/UX du 2026-10-20, U14 ;
  maquettes, lot 3 ; tranchée le 2026-10-21 : automatique, en SQL, sans lien posé dans l'admin). Deux événements
  à venir sont de la même série : même titre normalisé, même lieu, et des dates qui se suivent à 7 jours de
  calendrier au plus. Contrat : `docs/API_APP.md`, « Séries : app_event_series ».
  - `app_event_title_without_date(title)` : `stripDateFromTitle` (`lib/scraping/dates.ts`) en SQL, mêmes motifs,
    même garde des 3 caractères ; `app_event_series_title(title)` : ce titre, sans accents, casse ni ponctuation
    (`app_search_normalize`), une expression que Postgres recopie dans l'appelant (les motifs ne sont lus que
    pour un titre qui a un chiffre et un séparateur : 19 sur 363 à venir).
  - `app_event_series_of(event_ids, dates, location_ids, titles)` : la règle seule, sur des événements donnés en
    tableaux, sans rien lire ; `app_event_series(at_time)` la passe sur les événements à venir : une ligne
    `(event_id, series_id, date, dates_count)` par date d'une série de 2 dates ou plus (à venir et par
    utilisateur comme `app_see_also`), `series_id` = sa première date.
  - `app_see_also()` recréée (même signature) : une ligne par série à la place du « même titre » ; jamais une date
    de la série de la fiche. Un même titre à un autre lieu, ou au même lieu à plus de 7 jours, est désormais une
    autre série. Elle passe `app_event_series_of` sur les événements à venir qu'elle lit déjà (pas de lecture
    d'`events` de plus : voir la RLS plus bas).
- `language sql`, `stable` (les trois fonctions de règle `immutable`), `security invoker`, `execute` à anon et
  authenticated ; aucune table modifiée, aucun index, aucune donnée écrite.
- Testée sur un Postgres 17 Homebrew local en ICU (bouchons Supabase, toutes les migrations ; Docker arrêté) :
  `supabase/tests/app_event_series.test.sql` (12 cas : motifs du titre et leur garde, la règle seule, même titre
  normalisé, même lieu, 7 jours de calendrier, deux séances le même jour, date dans le titre, en cours, ce matin
  sans heure de fin, passé, en attente, sans lieu, hors accueil, ordre des lignes, masqué, auteur bloqué ; « À
  voir aussi » par série) ; chaque règle faussée à tour de rôle fait échouer au moins un cas (19 mutations).
  `app_see_also.test.sql` : 2 attentes changent (39, du titre de 09 à un autre lieu, est une autre série : elle
  entre dans « Dans le même genre »), 28 cas verts ; les 16 autres fichiers verts (258 cas en tout). Les motifs
  rendent les mêmes titres que `stripDateFromTitle` sur 20 exemples. `lib/supabase/database.types.ts` : les quatre
  fonctions, à la main (pas de Docker ce jour-là).
- Sur l'instantané prod du 2026-10-21 lu en anon (392 événements, 363 à venir), à 17:30 : 52 séries, 141 dates, la
  plus longue de 7 (« Les Croquis du TTN »). `app_see_also` change sur 30 fiches sur 362, toutes par la règle : la
  prochaine édition d'un même titre à plus de 7 jours (« La Scène est à toi », « Cabaret d'impro », « Match
  d'impro ») entre dans « Aussi à ». En local : `app_event_series` ~3,5 ms ; `app_see_also` ~5 ms de plus.
- Répétée deux fois en prod dans une transaction annulée, avec l'accord de l'utilisateur (psql, `SET ROLE
  postgres`, `lock_timeout` 5 s) :
  - la première version (où `app_see_also` appelait `app_event_series`) : 52 séries, 141 dates, droits
    d'anon et d'authenticated ; « À voir aussi » avant/après sur les 363 fiches : 30 changent, comme sur
    l'instantané ; mais chaque appel relisait les événements à venir ;
  - la version finale : mêmes séries et droits.
- **RLS d'`events` coûteuse en anon (relevée là, non corrigée)** : la politique « Organizers can view their events »
  (`is_user_admin() OR EXISTS (… event_organizers … user_organizers … uo.user_id = auth.uid())`, migration
  20250114000000) est évaluée pour chaque ligne lue, même approuvée, et parcourt `user_organizers` (21 lignes en
  prod, `is_user_admin()` à chaque ligne par sa propre RLS) : ~0,5 ms par événement. `app_events_in_range` sur
  les 362 événements à venir prend ~188 ms en prod (EXPLAIN ANALYZE en anon), contre ~3 ms en local (table vide).
  Le même coût pèse sur toute lecture d'événements de l'app (accueil, recherche, comptes du calendrier). Mesuré
  avant la migration, `app_see_also` actuelle : 270 à 305 ms (Croquis du TTN), ~450 ms (Youn Sun Nah), ~434 ms (Le
  Dîner de Condé) ; la version finale, répétée : 294, ~460 et ~440 ms, autant. À reprendre à part (politique en
  `events.id IN (SELECT …)`, évaluée une fois par requête, ou réservée aux sessions qui ont un organisateur).
- **Appliquée en prod le 21/10/2026 à 18:04 (16:04 UTC)**, avec l'accord de l'utilisateur (psql,
  `--single-transaction`, `SET ROLE postgres`, `lock_timeout` 5 s, le fichier répété à l'octet près), sans erreur.
  Vérifiée en anon par l'API publique :
  - `rpc/app_event_series?select=event_id,series_id,date,dates_count` (l'appel de l'app, en GET) : 200, 141
    lignes, 52 séries ; `at_time` illisible : 400 (22007) ;
  - `app_see_also` du Dîner de Condé (29 octobre) : 200, sans ses autres dates.
  Temps serveur (`x-envoy-upstream-service-time`) : `app_event_series` 226 à 259 ms (médiane 245, 10 appels) ;
  `app_see_also` avec 6 événements embarqués 287 à 340 ms. Presque tout ce temps est la RLS ci-dessus.

## 2026-10-21 — Proposer un événement : analyse d'affiche ouverte à tous, « Cet événement existe peut-être déjà »

- Décisions du 2026-10-21 (`../live/docs/AMELIORATIONS.md`, § 5 et partie E, point 6) : « Proposer » s'ouvre sans
  compte, l'analyse d'affiche aussi, avec un plafond par jour ; le compte et les conditions ne sont demandés qu'à
  l'envoi.
- `20261021200000_create_poster_analysis_quota` : table `poster_analysis_usage (day, user_id, is_guest,
  analyses_count)` (RLS sans politique, aucun droit pour anon ni authenticated ; rien au-delà de la veille) et
  `take_poster_analysis(user_id, is_guest, per_user_limit, guest_total_limit)` (`security definer`, service role
  seulement) : réserve une analyse du jour, rend `ok`, `user_limit` ou `guest_limit`. Appelée par
  `/api/mobile/events/extract-from-image` (10 par session, 200 pour l'ensemble des invités,
  `lib/events/poster-analysis-quota.ts`). Sans elle, la route garde l'ancien comportement pour les invités (403)
  et lit l'affiche d'un compte sans plafond : la route peut être déployée avant la migration.
- `20261021201000_create_app_possible_duplicates` : `app_possible_duplicates(title, starts_at, location_id, link,
  at_time, max_results)` (lignes de la table toujours vide `app_possible_duplicate_results`, clé étrangère vers
  `events`), `app_link_keys(text)` et `app_similar_titles(text, text)` (`immutable`), exécutables par anon et
  authenticated. Les événements à venir qui ressemblent à une proposition : même lien, même lieu à deux heures
  près, titre équivalent le même jour. Contrat : `docs/API_APP.md`, « Proposer : app_possible_duplicates ».
- Testées sur un Postgres 17 local (Homebrew, ICU, bouchons Supabase ; Docker arrêté) avec toutes les migrations :
  `supabase/tests/app_possible_duplicates.test.sql` (26 cas ; 14 changements des règles, chacun repéré par un
  test) et `supabase/tests/poster_analysis_quota.test.sql` (12 cas). `lib/supabase/database.types.ts` complété à la
  main (les deux tables et les quatre fonctions, à la place et dans la forme du générateur) : `npm run db:types`
  demande Docker. Après la fusion de main (U5 : `app_events_in_range` à sept arguments, les deux nouveaux faux par
  défaut), les 19 fichiers de `supabase/tests` passent sur les 88 migrations.
- Prod, lecture seule, le 21/10/2026 à 18:15 : `app_events()`, `app_events_in_range()` (U5) et
  `app_search_normalize()` identiques à la base de test (md5 de `pg_get_functiondef`), colonnes d'`events` lues
  présentes, rien de ce que créent ces migrations. Le même jour, l'utilisateur a remis leur application à plus tard.
- Répétée en prod le 21/10/2026 dans une transaction annulée (psql, `SET LOCAL ROLE postgres`, `lock_timeout` 5 s,
  les deux fichiers ensemble) : avant, ni la table ni les fonctions ; après, `poster_analysis_usage` illisible pour
  anon et authenticated, `take_poster_analysis` exécutable par service_role seulement, `app_possible_duplicates`
  par anon, `app_possible_duplicate_results` illisible ; une réservation pour une session invitée inventée : `ok` ;
  en anon, le prochain événement à venir se retrouve lui-même (`place`, rang 1) en ~195 ms (EXPLAIN ANALYZE ;
  presque tout pour la RLS d'`events`, voir « Séries ») ; rien n'est resté après l'annulation.
- **Appliquée en prod le 21/10/2026 vers 18:32 (16:32 UTC)** par l'utilisateur (psql, `--single-transaction`,
  `SET ROLE postgres`, `lock_timeout` 5 s, les deux fichiers de la branche `claude/proposer-affiche`), sans erreur.
  Vérifiée par l'API publique en anon : `rpc/app_possible_duplicates` 200 ; `poster_analysis_usage` et
  `rpc/take_poster_analysis` 401.

## 2026-10-21 — RLS d'`events` : vérifications une fois par requête

- `20261021190000_speed_up_events_rls` : reprend la RLS coûteuse relevée par les séries (plus haut). Mêmes
  politiques (noms, commandes, rôles), réécrites par `ALTER POLICY` sur `events` (lecture, modification,
  suppression ; l'insertion ne bouge pas) et `user_organizers` :
  - `is_user_admin()`, `auth.uid()`, `is_real_authenticated_user()`, `can_use_ugc_features()` en `(SELECT …)` :
    une InitPlan par requête au lieu d'un appel par ligne ;
  - l'`EXISTS` corrélé des organisateurs devient `events.id IN (SELECT eo.event_id …)` (sous-plan haché, construit
    une fois), précédé de `(SELECT auth.uid()) IS NOT NULL` (sans session, il ne tourne pas). Même jointure, mêmes
    tables lues avec leur RLS, mêmes rôles (`owner`/`editor` pour modifier, `owner` pour supprimer), y compris la
    règle d'origine qui accepte n'importe quel lien de l'utilisateur pour un lieu-organisateur.
- Testée sur un Postgres 17 Homebrew local en ICU (bouchons Supabase, toutes les migrations ; Docker arrêté) :
  `supabase/tests/events_rls.test.sql`, 47 cas : qui voit, modifie, supprime quoi pour anon, un invité (lié à un
  organisateur, auteur d'un événement), un compte sans organisateur, un propriétaire, un éditeur et un lecteur
  d'organisateur, un propriétaire de lieu-organisateur (et d'un lieu qui n'organise plus), un lecteur de lieu qui
  est propriétaire ailleurs, un auteur, un auteur suspendu, un admin ; changements de statut refusés ou permis ; les
  liens `user_organizers` visibles. Les 44 cas de droits sont **verts sans la migration** (base neuve, migrations
  d'avant) : elle ne change les droits de personne. Les 3 cas de forme (aucun appel par ligne dans les politiques,
  aucun sous-plan rejoué) ne passent qu'avec. 14 règles faussées à tour de rôle : 13 font échouer un cas ; la
  quatorzième (retirer `uo.user_id = auth.uid()` de la lecture) ne change rien, la RLS de `user_organizers` ne
  laissant déjà voir que ses propres liens. Les 20 autres fichiers de `supabase/tests` restent verts (base neuve,
  toutes les migrations, Proposer compris).
- En local, jeu de mesure de 400 événements et 21 liens `user_organizers` (EXPLAIN ANALYZE, médiane de 9) :
  anon 2,7–9 ms → 0,1–3,4 ms, invité et compte sans organisateur 5–18 ms → 0,1–3,7 ms, organisateur 2–9 ms →
  0,6–4,6 ms ; mêmes ids visibles pour les cinq sessions.
- Prod, le 2026-10-21 : les 21 liens `user_organizers` appartiennent à 2 comptes admin (tous `owner`) : aucun
  organisateur non admin. En lecture seule, l'ancienne et la nouvelle jointure retiennent les mêmes événements
  pour ces 2 comptes (111 et 123, pour voir, modifier et supprimer).
- Répétée en prod dans une transaction annulée, avec l'accord de l'utilisateur (psql, `SET ROLE postgres`,
  `lock_timeout` 5 s ; comptes témoins choisis en SQL sans être affichés) : EXPLAIN ANALYZE, médiane, avant →
  après, et les lignes rendues identiques partout (md5) :

  | session | `app_events_in_range` (362) | `app_event_series` (141) | `app_see_also` (Dîner de Condé) | `events` |
  | --- | --- | --- | --- | --- |
  | anon | 200 → 2 ms | 207 → 9 ms | 233 → 13 ms | 7 → 0,5 ms (392) |
  | invité | 278 → 3 ms | 286 → 10 ms | 322 → 14 ms | 12 → 0,6 ms (392) |
  | sans organisateur | 270 → 3 ms | 278 → 10 ms | 313 → 13 ms | 15 → 0,6 ms (392) |
  | admin | 12 → 3 ms | 18 → 10 ms | 24 → 13 ms | 13 → 0,5 ms (466) |

  `events` est restée verrouillée 1,8 s pendant les mesures d'après de la répétition.
- **Appliquée en prod le 21/10/2026 à 19:10 (17:10 UTC)**, avec l'accord de l'utilisateur (psql,
  `--single-transaction`, `SET ROLE postgres`, `lock_timeout` 5 s, le fichier commité), sans erreur. Vérifiée en
  anon par l'API publique (`x-envoy-upstream-service-time`, 10 appels, avant → après) : `rpc/app_event_series`
  289–813 ms (médiane ~350) → 23–28 ms (les 6 premiers appels juste après, sur des connexions qui gardaient
  l'ancien plan, entre 233 et 335 ms) ; `rpc/app_events_in_range` sur un an 237–306 ms → 14–26 ms ;
  `rpc/app_see_also` du Dîner de Condé avec 6 événements embarqués ~440 ms (relevé des séries) → 48–107 ms
  (médiane 53) ; `rpc/app_events` avec `limit=30` 5–16 ms, inchangé (il s'arrête aux 30 premières lignes). Mêmes
  nombres de lignes qu'avant : 141 séries, 362 à venir, 392 visibles en anon.

## 2026-10-21 — La zone de l'app : une ville et un rayon (« Ville et rayon »)

- `20261021220000_create_app_zone` : refonte du choix des villes de l'app (`../live/docs/VILLES.md`). Une seule
  règle en SQL : un événement est dans la zone (ville, rayon) s'il est dans la ville choisie (tout son groupe :
  « 45000 Orléans » = « Orléans »), ou si son lieu, à défaut l'événement, est à moins du rayon du centre de la
  ville. Avant, l'app envoyait les villes dont le centre était dans le rayon, puis retirait en Dart ceux dont les
  coordonnées en sortaient : « Orléans · 5 km » cachait 8 événements d'Orléans (La Source), et les comptes SQL
  comptaient ce que la liste ne montrait pas.
  - nouvelles : `app_distance_km`, `app_city_groups` (le regroupement d'`app_cities`, sorti tel quel), `app_zone`,
    `app_in_zone`, `app_events_in_zone` (l'accueil « Toutes les dates » et « À la une »),
    `app_major_events_in_zone`, `app_zone_counts` (l'écran « Ville et rayon ») ;
  - `zone_city` et `zone_km` à la fin d'`app_events_in_range`, et transmis par `app_event_counts`,
    `app_category_counts`, `app_tag_counts`, `app_organizer_counts`, `app_search`, `app_search_names`,
    `app_see_also` (corps inchangés sinon : générés depuis leurs dernières définitions, diff vérifié) ; `city_ids`
    reste pour les versions installées ;
  - `app_cities(at_time)` : colonne `slug`, comptes à venir par `app_events_in_range`, seulement les villes avec
    un centre et des événements (en prod le 2026-10-21 : 9 sur 19 ; plus de Paris, Joué-lès-Tours, Vald'Yerre,
    Châlette-sur-Loing, « SAINT DENIS EN VAL » ni « place sainte beuve orleans »).
- Testée sur un Postgres 17 Homebrew local en ICU (bouchons Supabase, toutes les migrations ; Docker arrêté) :
  `supabase/tests/app_zone.test.sql`, 26 cas (distance, zone par slug ou id, groupe, ville inconnue, chaque rayon,
  rayon nul, ancien `city_ids` seul et avec la zone, chaque fonction qui transmet la zone, accueil, grands
  événements, comptes de l'écran, villes proposées, session qui masque un événement). Les 21 autres fichiers de
  `supabase/tests` restent verts.
- Répétée en prod le 21/10/2026 dans une transaction annulée, avec l'accord de l'utilisateur (psql, `SET ROLE
  postgres`, `lock_timeout` 5 s), en anon : `app_zone_counts('orleans')` 5 km = 340, 10, 25 et 50 km = 360 ;
  `olivet` 5 km = 226 ; `app_cities()` les 9 villes qui ont des événements (Orléans 212 à venir) ;
  `app_events_in_zone('orleans', 25)` à partir d'aujourd'hui 363 ; l'ancien appel d'`app_events_in_range` 362 ;
  EXPLAIN ANALYZE : `app_zone_counts` 16 ms, la requête de l'accueil 1,8 ms ; rien n'est resté après l'annulation.
- **Appliquée en prod le 21/10/2026 à 23:04 (21:04 UTC)**, avec l'accord de l'utilisateur (psql,
  `--single-transaction`, `SET ROLE postgres`, `lock_timeout` 5 s, le fichier commité), sans erreur. Vérifiée en
  anon par l'API publique : `rpc/app_zone_counts` et `rpc/app_cities` (avec `slug`) 200, mêmes valeurs que la
  répétition ; `rpc/app_events_in_zone` 200, 12–29 ms (`x-envoy-upstream-service-time`, 5 appels) ;
  `rpc/app_events_in_range` sans zone et `rpc/app_events` 200 (versions installées).

## 2026-10-21 — Villes : un centre fixe (la mairie), deux lignes fautives

- `20261021230000_fix_city_centers` : décision de l'utilisateur du 2026-10-21 (corriger aussi les données).
  `refresh_city_center` ne remplace plus un centre existant ; le centre des 18 villes connues = leur mairie
  (geo.api.gouv.fr, champ `mairie` ; Orléans : 47,9028 ; 1,9093, le centre de secours de l'app, au lieu de la
  moyenne de ses lieux à 800 m de là) ; « SAINT DENIS EN VAL » renommée « Saint-Denis-en-Val » (même slug) ;
  « place sainte beuve orleans » (une adresse prise pour une ville) : ses rattachements passent à Orléans, la ligne
  est supprimée. Par slug : sans effet sur une base de test.
- Sur l'instantané public de la prod chargé en local : `app_zone_counts('orleans')` inchangé (5 km = 340),
  `saran` 5 km 298 → 98 (sa mairie est à 5,6 km du centre d'Orléans ; la moyenne de ses lieux en était plus
  près). `supabase/tests/app_zone.test.sql` : un cas de plus (centre gardé, ou pris aux lieux s'il manque), qui
  échoue sans la migration ; les 22 fichiers verts avec les deux migrations.
- Répétée en prod le 21/10/2026 dans une transaction annulée, avec l'accord de l'utilisateur : avant, 19 villes dont
  2 sans centre ; rattachés à « place sainte beuve orleans » : 0 lieu, 1 événement (non public), 0 grand événement ;
  1 événement (non public) à Saint-Denis-en-Val. Après : 18 villes, toutes avec un centre ; en anon,
  `app_zone_counts('orleans')` 5 km = 340 (inchangé), `saran` 5 km = 98, `app_cities()` 9 villes.
- **Appliquée en prod le 21/10/2026 à 23:09 (21:09 UTC)**, avec l'accord de l'utilisateur (psql,
  `--single-transaction`, `SET ROLE postgres`, `lock_timeout` 5 s), sans erreur. Vérifiée en anon par l'API
  publique : `rpc/app_zone_counts` de Saran 5 km = 98, 10 km = 352 ; `cities` : Orléans à 47,9028,
  « Saint-Denis-en-Val », plus de « place sainte beuve orleans ».

## 2026-10-23 — Festivals : `events.festival_id`, `festival_locations`, `app_festival_events`

- `20261023120000_create_festivals` : étape 1 du § 6 de `../live/docs/FESTIVALS.md` (choix du 2026-10-23 : un
  festival est un événement de la catégorie Festival qui contient les autres ; sa page dans l'app est sa fiche en
  mode festival). Contrat : `docs/API_APP.md`, « Festivals ». Rien n'est remplacé : une colonne, une table, deux
  fonctions, un déclencheur.
  - `events.festival_id` (vers `events.id`, `on delete set null`, index partiel) ; `events_festival_id_not_self`
    (pas lui-même) ; `check_event_festival()` (`security definer`, déclencheur `BEFORE INSERT OR UPDATE OF
    festival_id`) : un festival n'est pas dans un festival, dans les deux sens, avec `FOR SHARE` sur le festival
    choisi pour que deux rattachements simultanés ne se croisent pas. La base ne regarde pas la catégorie.
  - `festival_locations (id, festival_id, location_id, sort_index)`, unicité de `(festival_id, location_id)`,
    `on delete cascade` des deux côtés, index sur `location_id` ; RLS : lisible quand le festival l'est
    (sous-requête sur `events`, sa RLS), écrite par l'admin ; droits : `select` pour anon et authenticated,
    écriture pour authenticated. **Pas de clé primaire sur `(festival_id, location_id)`** (le contrat de départ) :
    PostgREST (v13.0.5, la version de la prod) prend une table dont les deux clés étrangères forment la clé
    primaire pour une table de jonction ; `events` ↔ `locations` aurait eu deux relations, et
    `events?select=…,locations(…)` (les cartes, la fiche, les listes de l'app, versions installées comprises,
    l'admin) aurait répondu 400 PGRST201. Contrat changé avec la session de coordination.
  - `app_festival_events(at_time)` : une ligne par événement à venir (`app_events_in_range` à partir
    d'aujourd'hui 0 h) rattaché à un festival visible (dans `app_events()`, ni masqué par l'utilisateur, ni d'un
    auteur bloqué), `events_count` par festival, rendues par festival puis par date ; `execute` à anon et
    authenticated.
  - La zone ne change pas (décision de la session de coordination, 2026-10-23) : un festival y entre par son
    `location_id`, son premier lieu, comme tout événement ; la liste de l'accueil et les comptes disent la même
    chose (U3). Une première version faisait entrer un festival par l'un de ses lieux dans `app_events_in_zone`
    seulement : retirée avant toute application.
- Testée par `npm run db:test` (Docker) : `supabase/tests/festivals.test.sql`, 21 cas (rattacher, changer,
  détacher en admin ; pas lui-même ; pas dans un événement rattaché ; un festival qui a un programme n'entre dans
  rien ; festival inconnu ; à l'insertion et dans une même requête ; unicité et clés de `festival_locations` ;
  lecture pour anon, un compte, l'admin ; écriture refusée à anon et à un compte, permise à l'admin ; la zone par
  la fiche seulement, pour la liste et les comptes ; `app_festival_events` : à venir, une ligne par événement,
  finis, à partir d'aujourd'hui 0 h, masqués et bloqués, admin ; suppressions d'un festival et d'un lieu) ; 18
  règles faussées à tour de rôle (dont le retour de la zone par les lieux), chacune repérée par un cas. Les 24
  fichiers de `supabase/tests` passent (408 cas). `lib/supabase/database.types.ts` régénéré (`npm run db:types`) :
  il rattrape aussi les fonctions de la zone (20261021220000), absentes du fichier jusque-là.
- PostgREST v13.0.5 local (la base de `db:test`, le conteneur de la prod), anon, avant puis après la migration et
  les données de Fulgurances : les 396 embarquements depuis `events`, `locations`, `festival_locations`,
  `rpc/app_events`, `rpc/app_events_in_zone` et `rpc/app_events_in_range` vers chaque table exposée, et depuis
  chaque table vers les trois premières : rien de ce qui répondait 200 ne casse ; les 5 ambiguïtés d'avant
  (`event_opportunities` ↔ `events`, deux clés étrangères) restent les mêmes ; seules des relations nouvelles
  apparaissent (`events` ↔ `events`, `festival_locations`). Les `select` de l'app (`EventSelects` `detail`,
  `card`, `list`, `_favoriteEventsSelect`, `_eventsSelect` des artistes, `userEvents`, `app_possible_duplicates`)
  sur `events` et les trois RPC, et les quatre requêtes de la session de coordination (`events`, `rpc/app_events`
  et `rpc/app_events_in_zone` avec `locations(name)`, `locations?select=id,events(id)`) : 29 sur 29 en 200,
  mêmes lignes qu'avant.
- Essayée de bout en bout sur une pile Supabase locale (base, auth, PostgREST v14.1) avec l'admin de la branche :
  lieux du festival (ajout, ordre, le premier devient le lieu de la fiche), programme (suggestions, recherche,
  alertes, ajout, retrait), « Fait partie du festival » ; en anon par PostgREST : `rpc/app_festival_events`,
  `festival:festival_id(…)`, `events!festival_id(…)`, `festival_locations(…, locations(…))`.
- Répétée en prod le 23/10/2026 dans une transaction annulée (psql `--single-transaction`, `SET ROLE postgres`,
  `lock_timeout` 5 s, accès par `supabase db dump --linked --dry-run`, le fichier de la branche), puis, dans la
  même transaction, les données prévues pour Fulgurances :
  - avant : ni la colonne, ni la table, ni la fonction ; `app_events_in_zone`, `app_events_in_range` et
    `app_events()` identiques aux migrations (md5 de `prosrc`) ; les fiches du festival, de Micro et d'Infra et
    les trois lieux existent ;
  - après : aucun événement rattaché, aucun lieu de festival ; `app_events_in_zone` inchangée ; anon lit
    `festival_locations` sans pouvoir y écrire et appelle `app_festival_events` ; en anon,
    `app_events_in_zone('orleans', 25)` 391 événements, comme avant ;
  - avec les données (Micro et Infra rattachés, le festival renommé « Fulgurances Électroniques #2 », ses lieux
    Dropkick, Le 108, L'Astrolabe, sa fiche au Dropkick) : en anon, `app_festival_events()` rend Micro et Infra,
    `events_count` 2 (EXPLAIN ANALYZE : 1,2 ms) ; la zone, 391 ;
  - chaque instruction ~45 ms (latence réseau) : `events` reste verrouillée ~1 s pendant la migration ; rien n'est
    resté après l'annulation.
- **Appliquée en prod le 23/10/2026 à 14:27 (12:27 UTC)**, avec l'accord de l'utilisateur (psql,
  `--single-transaction`, `SET ROLE postgres`, `lock_timeout` 5 s, le fichier de la branche, empreinte vérifiée),
  sans erreur. Vérifiée en anon par l'API publique, avant puis après : `events`, `rpc/app_events` et
  `rpc/app_events_in_zone` avec `locations(name)`, `locations?select=id,events(id)`, les cartes de l'accueil
  (`EventSelects.card` sur `rpc/app_events_in_zone`), `rpc/app_events_in_range`, `rpc/app_event_series` : mêmes
  statuts et mêmes nombres (391, 65, 391, 356, 136), aucune ambiguïté ; `rpc/app_festival_events` et
  `festival_locations` 200, vides ; le cache de schéma de PostgREST s'est rechargé seul.
- **Données de Fulgurances appliquées le 23/10/2026 à 14:28**, avec l'accord de l'utilisateur (le fichier
  `fulgurances-donnees.sql` de la session de coordination, `--single-transaction`) : Micro et Infra rattachés au
  festival, renommé « Fulgurances Électroniques #2 », ses lieux Dropkick, Le 108, L'Astrolabe, sa fiche au
  Dropkick (adresse et coordonnées comprises). En anon par l'API publique : `rpc/app_festival_events` rend Micro et
  Infra, `events_count` 2 ; `festival:festival_id(title)` sur Micro et Infra ; sur la fiche, `locations(name)`
  Dropkick, `events!festival_id(…)` Micro puis Infra, `festival_locations(…)` dans l'ordre ; le festival dans
  `rpc/app_events_in_zone('orleans', 25)`. Temps serveur (`x-envoy-upstream-service-time`, 7 appels) :
  `rpc/app_festival_events` 3 à 23 ms, les 391 cartes de l'accueil 39 à 69 ms.

## 2026-10-23 — Radio Campus dans OutLive : stations, émissions, épisodes, grille

- Concept validé le 2026-10-23 (`../live/docs/RADIO_CAMPUS.md`, contrat au § 4, recopié dans `docs/API_APP.md`,
  « Radio ») ; l'accord écrit de la radio n'est pas encore reçu : tout est construit, la station reste désactivée.
- Numérotées de `20261023140000` à `20261023143000`, après `20261023120000_create_festivals` (déjà en prod) : elles
  avaient d'abord pris `20261023120000` à `20261023123000`, le même numéro que celle des Festivals.
- `20261023140000_create_radio_tables` : `radio_stations` (interrupteur `enabled`, faux par défaut ; organisateur
  unique, sa suppression refusée tant que la station existe), `radio_shows` (créneaux vérifiés par
  `radio_slots_valid`, famille `musique` ou `parole`, collectif `organizer_id`), `radio_episodes` (`guid` unique ;
  `last_episode_at` de l'émission tenu par trigger), `radio_show_sync` (suivi de l'import, service seulement).
  RLS : lecture par anon et authenticated d'une station activée, de ses émissions et de ses épisodes, par une
  sous-requête non corrélée (une fois par requête) ; aucune écriture ni TRUNCATE hors service role. Radio Campus
  Orléans insérée désactivée, id fixe `e2f7ade2-f5d2-4408-90b4-f8bfca383399`, par `insert … select` depuis son
  organisateur (`9d6d803d-…`) : rien sur une base sans lui.
- `20261023141000_create_app_radio_functions` : `app_radio_day(p_station, p_day)` et `app_radio_shows(p_station)`
  pour l'app (`letter` en plus du contrat : la lettre de la liste A à Z), `radio_live_grid(p_station)` pour la
  route « ce qui passe » ; les règles : émission active (un épisode depuis 45 jours), créneaux répétés chaque
  semaine à l'heure de Paris, épisode rattaché au créneau où il commence (jusqu'à 15 minutes avant), état
  `past`/`live`/`next`. `security invoker` : une station désactivée ne rend rien en anon.
- `20261023142000_add_radio_audience_metrics` : `radio_live_play` et `radio_episode_play` dans les deux listes
  d'`app_audience_add` (contrainte de la table et fonction). Ses listes comptent aussi `festival_opened` depuis
  `20261023180000` (le compteur des festivals, en prod avant la Radio) : appliquée après, elle ne le retire pas.
- `20261023143000_schedule_radio_import` : pg_cron (tâche `radio-import`, chaque heure à :07) appelle
  `/api/cron/radio-import` par pg_net avec le secret `radio_import_cron_secret` de Vault ; sans secret, rien. Raison :
  Vercel Hobby refuse un cron plus fréquent que quotidien (`vercel.json` garde un passage à 5:30 UTC).
- Testées sur la base jetable de `npm run db:test` (Postgres 17, toutes les migrations) :
  `supabase/tests/app_radio.test.sql` (44 cas : trigger, créneaux refusés, RLS et coût des politiques, journées
  passées, d'aujourd'hui et de nuit, rattachement, liste A à Z, grille du direct, droits, pg_cron) et le cas radio
  d'`app_audience.test.sql` ; les autres fichiers restent verts. Cinq règles cassées une à une (tolérance de
  15 minutes, 45 jours, émissions passées sans épisode, RLS des émissions, articles du tri) : un cas échoue chaque
  fois. Types régénérés (`npm run db:types`) : ils rattrapent aussi `20261021220000_create_app_zone`, jamais
  régénérée.
- **Pas appliquées en prod.** Ordre : `20261023140000`, `20261023141000`, `20261023142000`, puis, pour l'import
  horaire, `20261023143000` et le secret : `select vault.create_secret('<CRON_SECRET de Vercel>',
  'radio_import_cron_secret');`. Avant la première, vérifier l'organisateur :
  `select id, name from public.organizers where id = '9d6d803d-4a7e-4118-beba-1744a1159b99';`. Après : un premier
  import à la main (page des crons de l'admin, ou `/admin/radio`, « Importer maintenant »), puis
  `select count(*), count(*) filter (where last_episode_at > now() - interval '45 days') from public.radio_shows;`
  (91 et 47 le 2026-10-23). `enabled` reste à faux jusqu'à l'accord écrit de la radio.

## 2026-10-23 — Le rôle admin dans `raw_app_meta_data` (escalade corrigée)

- `20261023150000_admin_role_in_app_metadata` (PR #54) : le rôle admin quitte `raw_user_meta_data`, que
  l'utilisateur écrit lui-même (`updateUser`, inscription), pour `raw_app_meta_data`, écrit par le service seul.
  `is_user_admin()` et `make_user_admin()` y lisent et y écrivent ; un trigger sur `auth.users` efface toute clé
  `role` de `raw_user_meta_data` ; la policy du journal d'`organizer_audit_log` passe par `is_user_admin()`. Le code
  TypeScript (#54) et l'app (live#170) lisent `app_metadata` seulement.
- Fusionnée sans être appliquée : jusqu'à l'application, plus personne n'était admin pour le back-office déployé et
  l'app (rôle encore dans `user_metadata` seulement), et l'escalade restait ouverte en SQL. Quelques minutes avant,
  avec l'accord de l'utilisateur, `lazbutton@gmail.com` avait reçu le rôle dans `raw_app_meta_data` à la main (une
  ligne, répétée annulée d'abord) ; l'étape 1 du fichier, une fusion, n'y change rien.
- Répétée en prod le 23/10/2026 dans une transaction annulée (psql, `SET LOCAL ROLE postgres`, le fichier de
  `origin/main` au commit `4c9ee30`) :
  - avant : 3 comptes avec `role = admin` dans `raw_user_meta_data` (`lazbutton@gmail.com`, `test@admin.com`, un
    compte Apple en relais privé), aucun ailleurs ; seuls lecteurs du rôle en clair : `is_user_admin()` et la policy
    d'`organizer_audit_log` ; pas de trigger ;
  - migration sans erreur (`UPDATE 3`, `UPDATE 3`) ; après : les 3 comptes admin dans `raw_app_meta_data`, plus
    aucun `role` dans `raw_user_meta_data`, les deux fonctions lisent `raw_app_meta_data`, le trigger posé, plus
    aucun lecteur du rôle en clair ; un `role` écrit dans le `raw_user_meta_data` de `test@admin.com` est effacé
    par le trigger ; en `authenticated`, `is_user_admin()` vrai pour un admin, faux pour un compte ordinaire.
- **Appliquée en prod le 23/10/2026 à 16:44 (14:44 UTC)**, avec l'accord de l'utilisateur (psql,
  `--single-transaction`, `SET ROLE postgres`), sans erreur. Vérifiée en lecture seule : mêmes résultats que la
  répétition (3 admins dans `raw_app_meta_data`, aucun `role` dans `raw_user_meta_data`, trigger et fonctions en
  place, `is_user_admin()` vrai pour `lazbutton@gmail.com`). Une session ouverte avant garde l'ancien `app_metadata`
  dans son jeton jusqu'au rafraîchissement : l'app ne revoit l'admin qu'après (ou après une reconnexion).

## 2026-10-23 — Festivals, étape 4 : le programme dans le message des suivis, « À voir aussi » sans le même festival

- `20261023160000_add_festival_follows_and_see_also` : étape 4 du § 6 de `../live/docs/FESTIVALS.md` (§ 3,
  « Favoris et notifications », et § 5). Contrat : `docs/API_APP.md`, « Festivals », « Suivis » et « À voir aussi ».
  Prérequis : `20261023120000_create_festivals` (en prod). Mêmes signatures : rien ne change pour les appelants.
  - `events.festival_added_at` : l'instant où l'événement est entré au programme de son festival (rattaché, ou
    passé à un autre festival), null hors festival ; tenue par `set_event_festival_added_at()` (déclencheur
    `BEFORE INSERT OR UPDATE OF festival_id, festival_added_at`, comme `published_at` : une valeur envoyée est
    ignorée). Pas de reprise : Micro et Infra, rattachés le 23/10, la gardent nulle (leur entrée compte à leur
    publication, aucun message ne les annonce après coup).
  - `follows_digest(at_time)` : en plus des lieux, organisateurs et artistes suivis, les festivals en favori
    (`event_likes` sur la fiche d'un festival visible) ; lignes `target_type` `festival`, `target_id` le festival,
    `target_name` son titre. Un événement entre au programme quand il est rattaché et publié
    (`greatest(festival_added_at, published_at)`), dans la fenêtre des suivis (depuis le cœur, le dernier message,
    au plus 7 jours), avec leurs règles (visible, pas complet, pas terminé, ni masqué ni d'un auteur bloqué).
    Toujours réservée au service role. Titre (`lib/notifications/follows-digest.ts`) : « Fulgurances
    Électroniques #2 : 2 événements ajoutés au programme ».
  - `app_see_also(…)` : rien du même festival (`coalesce(festival_id, id)` égal) dans les deux rangées, ni dans le
    choix de la source (un lieu qui n'a que des événements du festival passe la main à l'organisateur) ;
    `source_events_count` reste celui de la page. Reprise de la définition de `20261021220000` (la zone).
- Testée par `npm run db:test` (Docker) : `supabase/tests/festival_follows_see_also.test.sql`, 13 cas
  (`festival_added_at` à l'insertion, valeur envoyée ignorée, même festival, changement, détachement et festival
  supprimé ; message : fenêtre, cœur, dernier message, 7 jours, complet, fini, masqué, bloqué, festival en
  attente, cœur sur un événement qui n'est pas un festival, un événement au programme et dans un lieu suivi (deux
  lignes, que le message compte une fois), festival retiré (le lieu suivi reste) ; « À voir aussi » : un
  événement du festival, le festival, hors festival, une source qui n'a que le festival) ; 19 règles faussées à
  tour de rôle, 18 repérées (la 19e, le filtre des 7 jours d'`ajouts`, double celui du cœur et ne sert qu'à lire
  moins de lignes). Les 25 fichiers de `supabase/tests` passent (421 cas).
  `lib/supabase/database.types.ts` régénéré (`npm run db:types`).
- Essayée sur une pile Supabase locale (base, auth, PostgREST) avec toutes les migrations et Fulgurances :
  `create_event` de l'agent (rattaché par le nom, par le titre, festival absent, hors dates, un festival et ses
  lieux, un événement du festival créé juste avant, doublons de Micro et du festival), l'import par lot de l'admin
  connecté en admin (rattachement, lieux du festival sous la RLS), le message des suivis d'un festival en favori
  (« Fulgurances Électroniques #2 : 2 événements ajoutés au programme ») et `rpc/app_see_also` en anon.
- Répétée en prod le 23/10/2026 dans une transaction annulée (psql `--single-transaction`, `SET ROLE postgres`,
  `lock_timeout` 5 s, accès par `supabase db dump --linked --dry-run`, le fichier de la branche) :
  - avant : ni la colonne ni la fonction du déclencheur ; `follows_digest` et `app_see_also` identiques à
    `20261021142000` et `20261021220000` (md5 de `prosrc`) ; Micro et Infra rattachés, publiés le 18/10 ; aucun
    cœur sur le festival ; `follows_digest()` vide à cet instant ;
  - migration sans erreur, ~50 ms par instruction (latence réseau), ~0,7 s en tout ; après : la colonne, aucune
    date posée, le déclencheur actif ; `follows_digest` exécutable par le service role seulement, `app_see_also`
    par anon ; les deux corps sont ceux du fichier ;
  - « À voir aussi » en anon sur 33 fiches (les 30 prochaines de la zone d'Orléans, le festival, Micro, Infra) :
    les 31 hors festival à l'identique ; le festival perd Micro (4 → 3 lignes), Micro perd le festival (2 → 1) ;
    Infra inchangée (rien du festival au 108). `follows_digest()` : mêmes lignes (aucune), aucune de festival ;
  - EXPLAIN ANALYZE : `app_see_also` (Micro, anon) 12,2 ms avant, 12,3 ms après ; `follows_digest()` (service
    role) 7,6 ms avant, 8,7 ms après ;
  - `events` verrouillée ~2,2 s, de la migration à l'annulation (vérifications comprises) ; rien n'est resté.
- **Appliquée en prod le 23/10/2026 à 16:01 (14:01 UTC)**, avec l'accord de l'utilisateur (psql,
  `--single-transaction`, `SET ROLE postgres`, `lock_timeout` 5 s, le fichier de la branche au commit `e5256ae`),
  sans erreur. Vérifiée ensuite : la colonne (aucune date posée), le déclencheur actif, les corps de
  `follows_digest` et `app_see_also` sont ceux du fichier, `follows_digest` réservée au service role (vide à cet
  instant ; aucun cœur sur Fulgurances). En anon par l'API publique, avant puis après les deux migrations du jour :
  les appels de l'app gardent leurs statuts et leurs nombres (391, 389, 389, 70, 389 cartes, 354, 136 séries,
  `app_festival_events` 2) ; « À voir aussi » de Micro ne propose plus le festival ni Infra, celui du festival ni
  Micro ni Infra ; `events?select=id,festival_added_at` répond 200 (le cache de schéma s'est rechargé seul).

## 2026-10-23 — Festivals : sur « Tout », un festival qui a un programme compte par ses événements

- `20261023170000_count_festival_programmes` : demandé par la session de coordination pour l'accueil de l'app
  (étape 3, PR lazbutton/live-app#168). Un festival y est une carte, ses événements dedans, et les nombres de la
  page comptent ses événements, pas sa fiche en plus (`EventsListPageData.build`) ; les nombres lus en SQL
  comptaient la fiche, un de trop chaque jour du festival (U3). Contrat : `docs/API_APP.md`, « Festivals ».
  - La règle, celle de l'app : une fiche ne compte pas quand `app_festival_events(at_time)` a au moins une ligne
    pour elle (un événement à venir rattaché, visible pour l'utilisateur, retiré de l'accueil compris) ; une fiche
    sans programme compte comme avant ; seulement sur « Tout », pas sur une page de catégorie (la page « Festival »
    montre les festivals). La catégorie de la fiche n'est pas regardée, comme dans l'app.
  - `app_event_counts` (sur « Tout » : category vide), `app_zone_counts`, `app_cities` (`upcoming_events_count`
    seulement : une ville qui n'a que des fiches à venir reste dans la liste, la prochaine date et les récents ne
    changent pas). Reprises de `20261021220000`, mêmes signatures ; les listes et les autres comptes ne changent
    pas.
- Testée par `npm run db:test` (Docker) : `supabase/tests/festival_counts.test.sql`, 7 cas (l'index ; « Tout »
  jour par jour, events_count et starting_count ; la page « Festival » ; une autre catégorie ; un programme tout
  masqué par l'utilisateur ; `app_zone_counts` ; `app_cities`) ; 8 règles faussées à tour de rôle (la fiche
  comptée, retirée aussi par catégorie, tout rattachement pris pour un programme, programme sans les événements
  retirés de l'accueil, la zone, les villes : compte, liste, `a_venir`), toutes repérées. Les 26 fichiers de
  `supabase/tests` passent (428 cas). `lib/supabase/database.types.ts` inchangé (`npm run db:types`).
- Répétée en prod le 23/10/2026 dans une transaction annulée (psql `--single-transaction`, `SET ROLE postgres`,
  `lock_timeout` 5 s, le fichier de la branche ; aucune table verrouillée, la migration ne remplace que des
  fonctions) :
  - avant : les trois fonctions identiques à `20261021220000` (md5 de `prosrc`) ; un seul festival a un
    programme, Fulgurances Électroniques #2 (Micro et Infra) ;
  - migration sans erreur (9 instructions, 20 à 110 ms chacune, latence réseau comprise) ; les corps sont ceux du
    fichier, anon les appelle ;
  - en anon, zone d'Orléans · 25 km, 46 jours à partir d'aujourd'hui et « toutes les dates » : seules 5 plages
    changent, chacune d'un (la fiche de Fulgurances) : 19/11 6/6 → 5/5, 20/11 10/9 → 9/9, 21/11 12/11 → 11/11,
    22/11 3/2 → 2/2, toutes les dates 354 → 353 ; pages « Festival » et « Concert » identiques ; la liste
    (`app_events_in_zone`) 391 comme avant ; `app_zone_counts` 335/354/354/354 → 334/353/353/353 ;
    `app_cities` : Orléans 207 → 206, les autres villes identiques ;
  - coût (EXPLAIN ANALYZE, anon) : exécution d'`app_event_counts` (47 plages) 9,8 → 10,9 ms, `app_zone_counts`
    16,4 → 17,0 ms, `app_cities` 7,2 → 8,5 ms ; planification +16 à 18 ms (25 → 42 ms pour `app_event_counts` :
    la sous-requête d'`app_festival_events` est planifiée avec la RLS d'`events`), payée seulement tant que le
    plan n'est pas en cache : en requête préparée (comme PostgREST), plan générique dès la 7e exécution,
    planification 0,1 ms, exécution 10,0 → 10,5 ms. Une variante sans `app_festival_events`
    (`app_events_in_range` directement) ne gagnait que 2 ms de planification : écartée ;
  - rien n'est resté (les trois corps comme avant l'essai).
- **Appliquée en prod le 23/10/2026 à 16:02 (14:02 UTC)**, après `20261023160000`, avec l'accord de
  l'utilisateur (psql, `--single-transaction`, `SET ROLE postgres`, `lock_timeout` 5 s, le fichier de la branche
  au commit `e5256ae`), sans erreur ; les trois corps sont ceux du fichier, anon les appelle. En anon par l'API
  publique (Orléans · 25 km), avant → après : « Tout » 19/11 6 → 5, 20/11 9 → 8 (starting 8), 21/11 14 → 13,
  22/11 3 → 2, toutes les dates 352 → 351 ; page « Festival » identique (19/11 à 22/11 : 1, toutes les dates 4) ;
  `app_zone_counts` 333/352/352/352 → 332/351/351/351 ; `app_cities` : Orléans 206 → 205, les autres villes
  identiques. Juste après, la première requête de chaque connexion replanifie (`events` a changé) : jusqu'à
  0,6 s une fois, puis les temps d'avant (`app_event_series` ~100 ms).

## 2026-10-23 — Festivals : le compteur d'audience `festival_opened`

- `20261023180000_add_festival_audience_metric` : demandé par la session de coordination pour l'étape 5 de l'app,
  à déclarer avant sa sortie. `festival_opened` : la page d'un festival s'ouvre (la fiche d'un festival qui a un
  programme) ; elle compte aussi dans `event_opened`. Les deux listes d'`app_audience_add` (contrainte de la table et
  fonction) gagnent la clé ; rien d'autre ne change. Contrat : `docs/API_APP.md`, « Mesure d'audience ».
  - En prod, les listes sont encore celles de `20261021013000` (5 compteurs) : la Radio (`20261023142000`) n'y est
    pas. Celle-ci reprend la liste de la Radio, la clé en plus (8 compteurs), et `20261023142000` gagne la clé
    elle aussi (elle n'est appliquée nulle part) : les deux rendent la même liste, à l'octet près pour la fonction,
    dans n'importe quel ordre d'application. Sinon, la Radio appliquée après aurait retiré `festival_opened`, en
    silence, ou en échouant sur les lignes déjà comptées.
  - Un compteur inconnu d'`app_audience_add` est ignoré sans erreur, le reste de l'envoi compté (déjà testé) : une
    app qui envoie `festival_opened` avant cette migration le perd (elle jette la journée dès la réponse), sans rien
    perdre d'autre.
- Testée : `supabase/tests/app_audience.test.sql` (3 cas de plus : compté avec le reste de l'envoi et une clé
  inconnue ignorée, les lignes du jour, la contrainte de la table accepte la clé et refuse une clé inconnue) ;
  `lib/audience/app-audience.test.mjs` : la page « Audience de l'app » (colonne « Festivals ouverts ») et une garde
  qui compare la liste de la page aux deux listes de chaque migration (trois oublis simulés, tous repérés).
- Répétée en prod le 23/10/2026 dans une transaction annulée (psql `--single-transaction`, `SET ROLE postgres`,
  `lock_timeout` 5 s, le fichier de la branche) :
  - avant : la contrainte et `app_audience_add` sont celles de `20261021013000` (5 compteurs, md5 de `prosrc`) ;
    comptés jusque-là : `event_opened` 49, `ticket_tapped` 2, `when_sheet_used` 1. Un envoi comme l'app, en anon,
    `{"festival_opened": 1, "event_opened": 1}` : 1 compteur ajouté (`festival_opened` ignoré, le reste compté) ;
  - migration sans erreur (4 instructions, 26 à 67 ms chacune ; `app_audience_counts` seule verrouillée, le temps de
    la transaction) ; après : la contrainte à 8 compteurs, le corps de la fonction celui du fichier, anon et
    authenticated l'appellent ; le même envoi avec une clé inconnue en plus : 2 compteurs ajoutés ;
  - rien n'est resté (5 compteurs, la fonction d'avant, les mêmes totaux).
- **Appliquée en prod le 23/10/2026 à 16:24 (14:24 UTC)**, avec l'accord de l'utilisateur (psql,
  `--single-transaction`, `SET ROLE postgres`, `lock_timeout` 5 s, le fichier de la branche au commit `139709d`),
  sans erreur. Vérifiée : la contrainte compte les 8 compteurs, le corps d'`app_audience_add` est celui du fichier,
  anon et authenticated l'appellent ; en anon, dans une transaction annulée pour ne pas fausser les chiffres, un envoi
  comme l'app (`festival_opened`, `event_opened` et une clé inconnue) ajoute 2 compteurs ; par l'API publique, en anon,
  `rpc/app_audience_add` répond 200 (un jour hors fenêtre : 0, rien d'écrit). Totaux inchangés (49, 2, 1). La Radio
  (`20261023142000`) n'est toujours pas en prod : appliquée plus tard, elle garde la même liste.

## 2026-10-23 — Festivals : les nombres des pages de lieu, d'organisateur et d'artiste

- `20261023190000_count_festival_frames_on_pages` : demandé par la session de coordination pour l'étape 5 de l'app
  (PR lazbutton/live-app#171). Ces pages montrent leurs festivals dans une section « Festivals » et en retirent les
  fiches de leur liste (`PlaceFestivals.withoutFrames`, `FestivalsRepository.festivalsOfPage`) ; les nombres lus en
  SQL pour elles comptaient encore la fiche (U3). Contrat : `docs/API_APP.md`, « Festivals ».
  - La règle, celle de l'app : une page ne compte pas la fiche d'un festival qui a un programme
    (`app_festival_events` pour l'utilisateur) ni, sur la page d'un lieu, celle d'un festival dont ce lieu est un des
    lieux (`festival_locations`), même sans programme. Ses autres événements comptent.
  - `app_organizer_counts`, `app_search_names` (lieux et organisateurs ; un nom qui n'a plus rien n'est pas
    proposé, comme avant ; catégories et tags inchangés : leurs listes gardent la fiche), `source_events_count`
    d'`app_see_also` (les rangées ne changent pas), `upcoming_count` et `new_count` d'`app_follows` (lieu,
    organisateur, artiste). Reprises de leurs dernières définitions (`20261021220000`, `20261023160000`,
    `20261021141000`), mêmes signatures.
- Testée par `npm run db:test` (Docker) : `supabase/tests/festival_page_counts.test.sql`, 8 cas (l'index ; les
  pages de cinq lieux et d'un organisateur ; la recherche, tag compris ; « À voir aussi » ; « Mes suivis » ; un
  utilisateur qui a masqué tout le programme : pages, recherche, suivis) ; 11 règles faussées à tour de rôle, toutes
  repérées. `festival_follows_see_also.test.sql` : le nombre du Dropkick passe de 4 à 3 (la fiche de son festival,
  voulu). Les 29 fichiers de `supabase/tests` passent (498 cas). `lib/supabase/database.types.ts` inchangé.
- Répétée en prod le 23/10/2026 dans une transaction annulée (psql `--single-transaction`, `SET ROLE postgres`,
  `lock_timeout` 5 s, le fichier de la branche ; aucune table verrouillée, la migration ne remplace que des
  fonctions) :
  - avant : les quatre fonctions identiques à leurs dernières migrations (md5 de `prosrc`) ; une seule fiche a des
    lieux ou un programme, Fulgurances Électroniques #2 (lieux Dropkick, Le 108, L'Astrolabe ; organisée par le
    Dropkick et Clair Obscure) ;
  - migration sans erreur (13 instructions, 24 à 109 ms chacune, latence réseau comprise) ; les corps sont ceux du
    fichier ; anon appelle les trois premières, `app_follows` reste réservée aux comptes ;
  - en anon, avant → après : sur les 137 lieux et organisateurs, seuls le Dropkick (3 → 2) et Clair Obscure (4 → 3)
    changent ; dans 8 recherches (20 noms), seul le Dropkick (3 → 2) ; « À voir aussi » de 43 fiches, seule la
    source Dropkick de la fiche du festival et de Micro (3 → 2) ; Le 108 et L'Astrolabe inchangés (la fiche n'est
    pas sur leur page) ;
  - coût (EXPLAIN ANALYZE) : exécution +0 à 2,5 ms (`app_organizer_counts` 3,1 → 4,2 ms, `app_search_names` 10,8 →
    13,3, `app_see_also` 13,9 → 13,8, `app_follows` 0,5 → 1,6) ; planification +17 à 20 ms tant que le plan n'est
    pas en cache (la sous-requête d'`app_festival_events`, comme `20261023170000`), effacée par les requêtes
    préparées de PostgREST ;
  - rien n'est resté (les quatre corps comme avant l'essai).
- **Appliquée en prod le 23/10/2026 à 16:45 (14:45 UTC)**, avec l'accord de l'utilisateur, par la session de
  coordination (psql `--single-transaction`, `SET ROLE postgres`, `lock_timeout` 5 s, le fichier de la branche,
  sha256 `cab5a8f2…`), sans erreur. Après : les quatre corps identiques au fichier ; en anon, `app_organizer_counts`
  Dropkick 3 → 2 et Clair Obscure 4 → 3, Le 108 (12) et L'Astrolabe (21) inchangés ; `app_search_names`
  « dropkick » 3 → 2, « clair obscure » 4 → 3 ; `app_see_also` de Micro, source Dropkick 3 → 2 : comme la
  répétition.
- Réappliquée à l'identique à 16:47 (14:47 UTC) par la session de live-admin, qui avait reçu le même accord sans
  savoir l'application de 16:45 faite (le même fichier, au commit `51be8c8`) : sans effet, les quatre corps sont
  restés ceux du fichier, avec les mêmes droits (anon appelle les trois premières, `app_follows` réservée aux
  comptes). En anon après : Dropkick 2, Clair Obscure 3, Le 108 12, L'Astrolabe 21, dans les pages, la recherche et
  « À voir aussi », comme à 16:46.

## 2026-10-23 — Suspension UGC dans `raw_app_meta_data` (escalade corrigée)

- `20261023230000_ugc_suspension_in_app_metadata` : même faille que le rôle admin (migration
  `20261023150000`, en prod), mais sur `ugc_suspended`. La suspension d'un compte pour le contenu
  communautaire était lue dans `raw_user_meta_data->>'ugc_suspended'` (`is_user_safety_suspended()`, qui
  alimente `can_use_ugc_features()` et les policies RLS d'`events` ; `lib/mobile-user-auth.ts`). Or
  l'utilisateur écrit lui-même `raw_user_meta_data` via `updateUser` (PUT /auth/v1/user) : un compte
  suspendu pouvait lever sa propre suspension. (La PR du rôle admin avait laissé la suspension dans
  user_metadata ; cette migration la ferme.)
- Correctif : les clés `ugc_suspended` / `ugc_suspension_reason` / `ugc_suspended_at` / `ugc_suspended_by`
  passent dans `raw_app_meta_data` (écrit par le service seul ; GoTrue refuse `app_metadata` en self-service).
  `is_user_safety_suspended()` lit app_meta. Garde-fou : trigger `strip_ugc_suspension_from_user_metadata`
  (BEFORE INSERT/UPDATE OF raw_user_meta_data sur `auth.users`) qui efface ces clés de user_metadata à chaque
  écriture. `ugc_terms_accepted_version` et le reste de user_metadata (nom, etc.) sont intacts.
- Trigger et fonction distincts de ceux du rôle admin (`strip_role_from_user_metadata`) : indépendants ;
  les deux garde-fous pourront être fusionnés plus tard. Numéro `20261023230000` : 160000/180000/190000
  étaient pris par des migrations festivals déjà en prod.
- Côté TypeScript (même PR, par-dessus la PR du rôle) : lecture (`lib/mobile-user-auth.ts`,
  `/api/admin/users/list`) et écriture (`/api/admin/users/[id]`, `/api/admin/moderation/reports/[id]` :
  rôle ET suspension dans app_metadata) passées à `app_metadata`.
- Côté app Flutter (`lazbutton/live-app`) : `AuthRepository.isSuspended` / `suspensionReason` passés à
  `appMetadata` (PR #169, à déployer avec cette migration) ; `isAdmin` de même (PR #170, avec la migration
  du rôle). Sinon la détection côté client cesse jusqu'au rafraîchissement du jeton, mais le serveur
  (RLS + `requireMobileUserAuth`) refuse toujours.
- Tests : `supabase/tests/ugc_suspension.test.sql` (le trigger retire la clé à l'inscription et à la mise à
  jour ; `is_user_safety_suspended` / `can_use_ugc_features` lisent app_meta ; l'auto-réhabilitation échoue,
  vérifiée aussi de bout en bout via GoTrue réel) ; fixtures de `events_rls.test.sql` (u09 via app_meta) et
  `lib/api/app/routes.test.mjs` (`jwt-suspended`). `npm run db:test`, `node --test`, `npx tsc --noEmit` au vert.
- Relevé en prod le 24/10/2026 (lecture seule, psql `BEGIN READ ONLY`) : `is_user_safety_suspended()` encore celle de
  `20260324100000` (elle lit `raw_user_meta_data`), ni la fonction ni le déclencheur du garde-fou ; seule
  `can_use_ugc_features()` l'appelle (7 policies : `events` ×3, `user_requests` ×2, `content_reports`,
  `blocked_users`). Aucun des 280 comptes (257 invités) n'a de clé de suspension, ni dans `raw_user_meta_data` ni
  dans `raw_app_meta_data` : les deux UPDATE de reprise ne touchent aucune ligne. Le back-office de `main` écrit déjà
  la suspension dans `app_metadata`, que la base ne lisait pas encore. L'app publiée (1.0.6) la lit dans
  `user_metadata` : elle ne verra plus qu'un compte est suspendu, le serveur le refuse toujours.
- Essai à blanc le 24/10/2026 sur une base locale jetable dans l'état de la prod (toutes les migrations sauf
  celle-ci et `20261024043000` ; les fonctions en jeu, leurs droits et les déclencheurs d'`auth.users` identiques à
  ceux de la prod) : 4 comptes
  d'essai (suspendu avec les 4 clés, suspension levée, admin, invité), la faille d'avant reproduite ; migration en
  une transaction ; 9 contrôles (reprise vers `app_metadata`, `user_metadata` nettoyé sans perdre le reste, lecture,
  `can_use_ugc_features`, faille refermée, inscription) ; retour arrière complet, puis migration rejouée : états
  identiques à l'avant et à l'après. `npm run db:test` (copie isolée du script) : tous les fichiers passent.
- Retour arrière. Si les inscriptions ou les mises à jour de compte échouent, retirer le seul déclencheur :
  `DROP TRIGGER IF EXISTS strip_ugc_suspension_from_user_metadata ON auth.users;` (la suspension reste lue dans
  `app_metadata`, que l'utilisateur ne peut pas écrire : rien ne se rouvre). Retour complet, qui rouvre la faille :
  retirer déclencheur et fonction, recopier la suspension d'`app_metadata` vers `raw_user_meta_data` pour les
  suspendus, remettre le corps de `20260324100000` et son commentaire (essayé en local : l'état d'avant à
  l'identique).
- **Appliquée en prod le 24/10/2026 à 05:06 (03:06 UTC)**, avec l'accord de l'utilisateur (psql,
  `--single-transaction`, `SET ROLE postgres`, `lock_timeout` 5 s, le fichier de `main`, sha256 `bf93c530…`), sans
  erreur, en 0,4 s (`UPDATE 0`, `UPDATE 0`). Vérifié en lecture seule : aucune clé de suspension, ni dans
  `user_metadata` ni dans `app_metadata` (280 comptes) ; `is_user_safety_suspended()` lit `app_metadata`, toujours
  `SECURITY DEFINER` avec les mêmes droits ; les deux déclencheurs d'`auth.users` (rôle, suspension) actifs ; empreinte
  identique à celle de l'essai local. Puis, avec le même accord, dans une transaction annulée : un compte fictif
  inscrit avec `ugc_suspended` dans `user_metadata` la perd (son nom reste), la même clé ajoutée ensuite est effacée,
  et suspendu par `app_metadata` il le reste (`is_user_safety_suspended()` vrai, `can_use_ugc_features()` faux) ;
  rien n'est resté.

## 2026-10-23 — Radio : les visuels gardés des émissions (`radio_shows.image_url`)

- `20261023235000_add_radio_show_images` (PR #62) : `radio_shows.image_url` (https seulement ; null : la pochette
  que l'app dessine dans la charte de Radio Campus, `../live/docs/RADIO_CAMPUS.md`, « Les pochettes »).
  `app_radio_day`, `app_radio_shows` et `radio_live_grid` la rendent en dernière colonne : leur type de retour
  change, elles sont supprimées puis recréées à l'identique, droits compris. L'import horaire n'y touche pas.
- Testée sur la base jetable de `npm run db:test` (`supabase/tests/app_radio.test.sql` : les trois fonctions
  rendent `image_url`, null sans visuel ; une adresse http est refusée).
- **Appliquée en prod le 2026-10-23 vers 20:30 (heure de Paris)**, par l'éditeur SQL de Supabase, en une transaction
  (`supabase db dump --linked --dry-run` restait bloqué ce soir-là, chez Claude comme dans le terminal, sans message :
  impossible de passer par psql). Vérifié en anonyme : `app_radio_shows` rend `image_url` (47 émissions),
  `app_radio_day` répond, et la route « ce qui passe » déployée (sans `imageUrl` jusqu'au déploiement de la PR)
  répond 200.
- **Onze visuels posés à 20:33** par `node --env-file=.env.local scripts/radio-show-images.mjs --write
  --confirm=tkyuiltgvqcgebnqdgmb` : À Bâtons Rompus, Écoute ta fac, Kawaï Campus Club, Entrez… c'est du jazz, Le
  Projet SETI, L'émission du fictionnaire, Nation Groove, Pull it up, Ride On, Rien ne fera venir le jour,
  Tentaculation, dans `organizers-images/radio-shows/` (WebP carrés, 21 à 284 Ko). Vérifié en anonyme : 11 émissions
  avec `image_url`, chaque image en 200 `image/webp` ; dans le programme d'hier, Écoute ta fac et Nation Groove ont
  le leur.

## 2026-10-24 — La table `event_notifications` supprimée (anciens rappels par événement)

- `20261024043000_drop_event_notifications` : la table des rappels individuels de l'ancien système (« 1 jour,
  3 heures ou 1 heure avant »), abandonné en mars 2026, voulue supprimée par l'utilisateur le 24/10/2026
  (`../live/docs/FEUILLE_DE_ROUTE.md`). Partent avec elle ses index, contraintes, 4 policies et 2 déclencheurs,
  `calculate_notification_scheduled_at()` (son déclencheur) et `update_event_notifications_updated_at()`, qui ne
  servait à rien ; `update_notification_preferences_updated_at()` reste (trois autres tables). Sans CASCADE.
- Relevé en prod le 24/10/2026 (lecture seule) : 0 ligne ; aucune vue, policy d'une autre table, clé étrangère,
  publication ni tâche pg_cron ne la cite ; aucune fonction hors son déclencheur et `check_rls_policies()` (le nom
  dans une liste de tables ; cette fonction échoue de toute façon, en prod aussi, sur `p.polrelid`, absent de la
  vue `pg_policies`) ; la seule Edge Function, `delete-user`, n'y touche pas.
- Qui s'en servait : le back-office, plus depuis mars 2026 (crons de rappels, `/api/events/[id]/notifications`) ;
  l'app de `main`, plus depuis le 21/10 (live-app `92aa71a`). L'app publiée, 1.0.6 (avril 2026, live-app
  `7c3f3a2`), comme la 1.0.4 et la 1.0.5, fait au lancement et au réenregistrement du jeton un UPDATE qui désactive
  les anciens rappels du compte (aucune ligne touchée), dans un try/catch : sans la table, PostgREST répond 404
  (PGRST205), l'erreur est attrapée et journalisée, sans autre effet. La 1.0.3 (décembre 2025) avait encore l'écran
  des rappels : un rappel ne s'y active plus.
- Sauvegarde (lecture seule, 24/10/2026 à 02:30 UTC) dans `~/Documents/Backups/outlive/event-notifications-2026-10-24/`
  sur la machine de l'utilisateur, hors dépôt : le contenu (CSV, en-tête seul : la table était vide), sa définition
  extraite du dump du schéma `public` de la prod (`schema.sql`), `SHA256SUMS`, `README.txt` (comment restaurer).
- Essai à blanc le 24/10/2026 sur une base locale jetable dans l'état de la prod : migration en une transaction,
  rejouée sans erreur ; `supabase/tests/drop_event_notifications.test.sql` (4 cas : ni table ni fonction des anciens
  rappels, la fonction updated_at partagée garde ses trois tables, un événement et un compte se suppriment) ;
  restauration depuis la sauvegarde : définition identique à celle d'avant (colonnes, contraintes, index,
  déclencheurs, policies, droits, commentaires), puis migration rejouée. `npm run db:test` (copie isolée du script) :
  tous les fichiers passent. `lib/supabase/database.types.ts` régénéré (`npm run db:types`) : la table en moins.
  `docs/EVENT_NOTIFICATIONS_DIRECT_SUPABASE.md` (le mode d'emploi de la table) retiré.
- Retour arrière : dans la sauvegarde, `\i schema.sql` (psql, rôle postgres), puis `\copy` du CSV s'il a des lignes.
- **Appliquée en prod le 24/10/2026 à 05:07 (03:07 UTC)**, après `20261023230000`, avec l'accord de l'utilisateur
  (psql, `--single-transaction`, `SET ROLE postgres`, `lock_timeout` 5 s, le fichier de la branche au commit
  `541f1cf`, sha256 `6b6c09ce…`), sans erreur (`DROP TABLE` en 0,13 s). Vérifié en lecture seule : ni la table ni
  les deux fonctions ; `update_notification_preferences_updated_at()` garde ses trois tables ; plus aucun
  déclencheur de clé étrangère vers elle sur `events` et `auth.users` ; `app_events()` rend 389 événements ;
  empreinte identique à celle de l'essai local. En anon par l'API publique : `event_notifications` répond 404
  (PGRST205, ce que recevra la 1.0.6), `rpc/app_events` 200.

## 2026-10-24 — L'accueil de l'app : ses dernières règles en Dart passent en SQL

- `20261024120000_app_home_rules` (règle complète en tête du fichier) : « Toutes les dates » et « À la une » de l'app
  lisaient `app_events_in_zone` puis retiraient en Dart les événements en cours de 12 h ou moins, les masqués, ceux
  des auteurs bloqués et, sur « Tout », ceux retirés de l'accueil ; une catégorie se comparait à son id et à son nom
  (`../live/docs/FEUILLE_DE_ROUTE.md`, « Défauts relevés le 2026-10-24 », la ligne « Des règles encore en
  Dart », maintenant). L'app lira `app_events_in_range` (PR de l'app lazbutton/live-app#203, à fusionner après cette
  migration), qui a déjà les trois premières règles, et cette migration ajoute :
  - `app_on_tout(events)`, la règle de « Tout » (`NOT hide_from_home`), une colonne calculée pour PostgREST (lue ou
    filtrée par l'app ; vérifié sur PostgREST v13.0.5 local, `select` et filtre sur `rpc/app_events_in_range`) ; les
    nombres de « Tout » la lisent (`app_event_counts` sans catégorie, `app_zone_counts`, `app_cities`, redéfinies
    depuis `20261023170000`, mêmes signatures) ;
  - `app_events_in_range` (redéfinie depuis `20261021220000`, même signature) : masqués et auteurs bloqués en
    sous-requêtes non corrélées (`NOT IN`, sous-plans hachés, `(SELECT auth.uid())`), la catégorie demandée résolue
    une fois. Les `NOT EXISTS` corrélés relisaient `user_hidden_events` pour chaque événement (et `auth.uid()` pour
    chacune de ses lignes), l'`EXISTS` sur `categories` tournait pour chaque événement d'une autre catégorie. Mesuré
    en local (PostgREST, ~430 événements sur un an, 200 cartes) : un compte qui a masqué 40 événements, ~50–80 ms
    avant, ~3–5 ms après ; anon ~10–15 ms avant, ~4–5 ms après (`app_events_in_zone` : ~2,5–3,5 ms) ;
  - `events.category` toujours l'id de sa catégorie : `resolve_event_category(text)` (security definer, fermée à anon
    et authenticated) et le trigger `events_normalize_category` (BEFORE INSERT OR UPDATE OF category, le premier par
    son nom), puis la conversion des lignes existantes. Un texte qui ne désigne aucune catégorie reste tel quel. En
    prod le 2026-10-24 (lecture anon) : 1 événement visible sur 389 a un nom (« Concert ») ; les autres lignes
    (en attente, archivées) se comptent à l'essai.
- Tests : `supabase/tests/app_home_rules.test.sql` (30 cas : la catégorie à l'écriture, par un admin connecté sans
  droit sur les fonctions, et rejouée par la conversion ; « Tout » et ses nombres ; masqués, auteurs bloqués, un
  événement sans auteur gardé malgré `NOT IN` ; catégorie par id, nom, texte inconnu, inactive ; plan : aucun nœud
  qui lit `user_hidden_events`, `blocked_users` ou `categories` ni aucun sous-plan ne tourne plus d'une fois).
  Contre-épreuves : l'ancienne `app_events_in_range` échoue au plan (9 passages au lieu de 1), un `NOT IN` sans le
  cas sans auteur et une règle de « Tout » cassée échouent aussi, cette dernière dans `app_calendar`, `app_zone`,
  `festival_counts` et `app_free_family`. Toute la suite passe sur l'image Supabase (avec la migration, avant le
  nouveau fichier) puis sur Postgres 17 nu en ICU (avec lui ; `app_radio` y manque de la file de pg_net).
- Types : `app_on_tout` et `resolve_event_category` ajoutés à la main dans `lib/supabase/database.types.ts`, au format
  du générateur (Docker arrêté sur la machine) ; à régénérer au prochain `npm run db:types`.
- **Essai à blanc en prod le 2026-10-24 vers 5 h 30** (heure de Paris, accord de l'utilisateur), dans une transaction
  annulée, par psql (identifiants de `supabase db dump --linked --dry-run`) : les quatre définitions de départ étaient
  bien celles de `20261021220000` et `20261023170000` (empreintes), la migration est passée sans erreur, et les
  empreintes d'après sont celles de la base locale. La conversion touche 2 événements (« Concert », dont un archivé) ;
  aucun texte ne désigne une catégorie inconnue. En anon, avant et après, mêmes nombres : « Tout » sur 7 jours 17/17,
  350 à venir (2 hors de « Tout »), 48 concerts, zones 328/347/347/347, villes 347. « Toutes les dates » (200 cartes,
  anon) : 4,6 ms d'exécution. Après l'essai, la prod est restée telle quelle (empreintes de départ, aucun trigger).
  Sauvegarde et retour arrière prêts : `~/Documents/Backups/outlive/regles-accueil-2026-10-24/`.
- **Appliquée en prod le 2026-10-24 à 5 h 36** (heure de Paris), avec l'accord de l'utilisateur, juste après l'essai :
  état revérifié en lecture (mêmes empreintes de départ, les 2 mêmes textes « Concert »), puis `psql --single-transaction
  -c 'SET ROLE postgres' -c "SET lock_timeout = '5s'" -f 20261024120000_app_home_rules.sql`, en une seconde, sans
  erreur (`UPDATE 2`). Après, en lecture : les empreintes d'après, le trigger actif, les 2 événements à l'id de
  Concert, plus aucun texte qui ne soit pas un id ; anon ne peut pas appeler `resolve_event_category`, il lit
  `app_on_tout`. En anon, les mêmes nombres qu'avant (« Tout » 7 jours 17/17, 350 à venir dont 2 hors de « Tout »,
  48 concerts, zones 328/347/347/347, villes 347). Par l'API publique (clé anon, les requêtes de la PR de l'app) :
  toutes en 200 ; « Toutes les dates » 200 cartes avec `app_on_tout`, « À la une » (aucune en prod), la carte du soir
  filtrée, `app_event_counts`, et `app_events_in_zone` des versions installées. Temps serveur, `select` carte complet,
  10 appels : `app_events_in_zone` 32,5 ms (médiane), `app_events_in_range` 45,5 ms (33 au mieux) ; les premiers appels
  après le changement de schéma, plus lents (1,2 s puis 0,2 s). Sauvegarde, sorties et retour arrière :
  `~/Documents/Backups/outlive/regles-accueil-2026-10-24/`. La PR de l'app (lazbutton/live-app#203) peut être fusionnée.

## 2026-10-24 — Photos libres des artistes : 32 posées

- Données seulement, pas de migration (colonnes du crédit : `20261021160000_add_artist_image_credit`). Relecture
  dans `docs/ARTIST_PHOTOS.md`, « Relecture du 2026-10-24 » : 32 photos validées par l'utilisateur, dans
  `docs/artist-photos-2026-10-24.json` (heure de pose et adresse de chaque copie).
- Posées par `node --env-file=.env.local scripts/artist-photos.mjs --plan=… --write
  --confirm=tkyuiltgvqcgebnqdgmb`, dans `organizers-images/artists/` (JPEG de 40 à 924 Ko) :
  - **4 CC0 ou domaine public, entre 05:06 et 05:08 (heure de Paris)** : Albertina Carri, Brad Mehldau, Marie
    Brassard, Marie Chouinard. La première passe a refusé Albertina Carri : l'API de Commons donne désormais ses
    vignettes sur `thumb.wikimedia.org`, que `downloadCommonsPhoto` accepte depuis (live-admin#68).
  - **28 CC BY ou CC BY-SA, entre 05:28 et 05:29**, à la demande de l'utilisateur, sans attendre la prochaine
    version de l'app : la 1.0.6 de l'App Store montre la photo d'un artiste sans crédit d'ici là.
- Vérifié en anonyme : 36 artistes avec photo, dont 32 avec crédit ; les 32 conformes à la liste (photo, crédit,
  licence, lien Commons, image en 200 `image/jpeg`) ; « Photo : Thesupermat, CC BY-SA 4.0 » sur
  https://www.outlive.fr/artists/jeanne-added. L'API publique v1 rend le crédit une fois live-admin#68 déployée.
- Retour arrière : `docs/ARTIST_PHOTOS.md`.

## 2026-10-24 — Accès de 15 lieux et photo de la Tête Noire (données, pas une migration)

- `locations.directions` des 15 lieux qui avaient 5 événements à venir ou plus dans l'app (326 des 350 dates),
  d'après les horaires TAO, les parkings de la Métropole, les sites des lieux et acceslibre (méthode dans
  `docs/LIEUX_ACCES.md`), liste relue par l'utilisateur : Théâtre d'Orléans, Théâtre de la Tête Noire, La
  Passerelle, Artéphé, Espace Béraire, L'Astrolabe, L'Alliage, L'Unisson, Zigotastiques – le QG, L'Envolée, Le 108,
  Java Pop, Le Bouillon, Orléans Comedy Club, L'Improviste Bar. Quatorze étaient vides ; L'Astrolabe avait
  « En bus : Ligne 1, 2, 3, 5, 71 et LB arrêt Les Turbulences. / En tramway : Ligne B, arrêt Madeleine. / En
  vélo+ : Une borne VÉLO+ se situe juste devant le bâtiment. / En voiture : Le Parking de la Patinoire, GRATUIT
  les soirs de concerts » (quatre lignes).
- `locations.image_url` de la Tête Noire, vide jusque-là : « Chapelle Notre-Dame-des-Aydes d'Orléans - façade vue
  du Nord » (Wikimedia Commons, U4you, CC0), copiée en 1 280 × 1 707 dans
  `locations-images/locations/1792812251913-udp175tffkr.jpg`.
- **Écrit en prod le 2026-10-24 à 5 h 24 (heure de Paris)** par `node --env-file=.env.local
  scripts/location-details.mjs <liste> --write --confirm=tkyuiltgvqcgebnqdgmb` : 15 lieux écrits, aucun laissé,
  aucune copie en échec. Vérifié : les 15 textes relus en base et lus par la clé publique de l'app ; la photo
  répond en 200 `image/jpeg`.
- Retour arrière : la liste inverse par le même script (vide pour quatorze lieux, l'ancien texte ci-dessus pour
  L'Astrolabe ; `image_url` de la Tête Noire à null), puis supprimer le fichier copié.

## 2026-10-24 — Accès des 12 autres lieux actifs, photos du Musée des Beaux-Arts et de la Collégiale (données)

- Même méthode, deuxième liste relue par l'utilisateur : `locations.directions` des 12 lieux qui avaient 1 à 4
  événements à venir (L'Argonaute, MAM, Dropkick, CCNO, Chafouin, château de Saint-Jean-le-Blanc, Théâtre
  Gérard-Philipe, Collégiale Saint-Pierre-le-Puellier, La Cave Végétale, La Ruche en Scène, Les Frangins, Musée des
  Beaux-Arts d'Orléans), tous vides jusque-là. Avec le premier lot, les 27 lieux qui ont des dates à venir ont un
  accès.
- `locations.image_url`, vides jusque-là : Musée des Beaux-Arts, « Ensemble extension de l'hôtel de ville, hôtel de
  région, musée des Beaux-Arts » (Commons, U4you, CC0), dans `locations-images/locations/1792813425106-03w8ncrfjl2n.jpg` ;
  Collégiale, « Saint-pierre-le-puellier-ru-folie » (Commons, ManuD, domaine public), dans
  `locations-images/locations/1792813423853-v4s3jq0k9n.jpg` ; les deux en 1 280 × 960.
- **Écrit en prod le 2026-10-24 à 5 h 43 (heure de Paris)**, même commande : 12 lieux écrits, aucun laissé, aucune
  copie en échec. Vérifié : les 12 textes relus en base (et les 15 du premier lot toujours en place), lus par la
  clé publique de l'app ; les deux photos répondent en 200 `image/jpeg`.
- Retour arrière : la liste inverse (accès à vide, `image_url` à null pour les deux photos), puis supprimer les
  deux fichiers copiés.

## 2026-10-24 — Adresses de 4 lieux, accès de L'Envolée et du Vinaigrier (données)

- Relu par l'utilisateur, écrit le 2026-10-24 à 6 h 02 (heure de Paris) par `scripts/location-details.mjs`, qui sait
  désormais corriger `address` (avec `latitude` et `longitude`) et `short_description` :
  - L'Envolée : « 189 Rue Jean Zay » → « 193 Rue Jean Zay 45800 Saint-Jean-de-Braye », (47.91222, 1.972269) →
    (47.912152, 1.973077) ; accès « Tram B, arrêt Léon Blum / Bus 2, arrêt Mairie Jean Zay » → « Tram B, arrêt Clos
    du Hameau / Bus 2, arrêt Mairie Jean Zay / Parking relais Clos du Hameau ».
  - CCNO : « 7 Rue du Bourdon Blanc » → « 37 Rue du Bourdon Blanc 45000 Orléans », (47.900785, 1.91336) →
    (47.902308, 1.913061).
  - Théâtre Gérard-Philipe : « Place Sainte-Beuve » → « 7 Place Sainte-Beuve 45100 Orléans », (47.837612, 1.936918)
    → (47.838031, 1.937421).
  - Collégiale Saint-Pierre-le-Puellier : « Cloître Saint-Pierre le Puellier » → « 13 Cloître Saint-Pierre le
    Puellier 45000 Orléans », coordonnées inchangées (le numéro n'est pas dans la Base Adresse Nationale).
  - Le Vinaigrier : accès « 📍Le Vinaigrier, Résidence Dessaux du Crous » → « Tram B, arrêt Cathédrale / Parking
    Halles Charpenterie » ; description vide → « Dans la résidence Dessaux du Crous. ».
- Vérifié : les 5 lieux relus en base et lus par la clé publique de l'app ; chacun garde sa ville
  (`sync_location_city`), aucune ville créée, Orléans et Saint-Jean-de-Braye inchangées (centre déjà fixé).
- Retour arrière : la liste inverse par le même script (anciennes adresses et coordonnées ci-dessus, anciens accès,
  description vide).

## 2026-10-24 — L'attribution publique d'une proposition, jamais une adresse e-mail

- `20261024140000_community_attribution_without_email` : l'app envoyait l'e-mail d'un compte sans nom (connexion
  Apple native, code par e-mail) comme `contributor_display_name` ; avec l'accord d'attribution, il serait devenu le
  nom public de l'événement (« Proposé par … » sur la fiche de l'app, `communityContributorLabel` dans l'API v1).
  L'app n'envoie plus que le nom du compte, sinon rien (lazbutton/live-app#211) ; la règle vit ici pour les versions
  déjà installées : `public_contributor_label(text)` (le nom sans les espaces autour ; NULL s'il est vide ou contient
  « @ »).
- `convert_event_request_to_event` recopie de nouveau l'attribution : `20260415190000` et `20260415213000` (prix,
  venues de l'app) avaient réécrit la fonction d'après une version antérieure à `20260411160000`, sans
  `community_submission`, `community_attribution_opt_in` ni `community_contributor_label`. Corps de `20260415213000`
  (prix libre) inchangé par ailleurs.
- `events` : un nom public qui contiendrait « @ » est effacé, puis refusé par la contrainte
  `events_community_contributor_label_not_email`, quel que soit le chemin.
- Le back-office montre l'e-mail du compte (`get_user_emails`) quand une demande n'a pas de nom (file des demandes).
- Une demande complétée dans le formulaire d'événement (`markRequestConverted`, le chemin des demandes « depuis un
  lien » et des affiches seules) ne recopie toujours aucune attribution : pas d'e-mail possible, mais ni « Proposé
  par » ni « Suggestion communautaire ».
- Tests : `supabase/tests/community_attribution.test.sql` (le nom public, la conversion avec et sans accord, avec et
  sans nom, l'e-mail d'une ancienne version écarté, le prix libre, le refus hors admin, la contrainte en insertion et
  en mise à jour) ; `lib/admin-requests-core.test.mjs`. `npm run db:test` (33 fichiers), `node --test` (334),
  `npx tsc --noEmit` et ESLint au vert.
- État de la prod relevé avant, en lecture seule : `convert_event_request_to_event` était la version de
  `20260415213000` (empreinte `left(md5(pg_get_functiondef(…)), 8)` = `9ba4d160`, aucune attribution) ; 465
  événements, aucun nom public, aucun « @ », aucun événement communautaire.
- Répétée en prod dans une transaction annulée, avec l'accord de l'utilisateur : `UPDATE 0`, contrainte validée,
  fonction après `b0ca2c58` ; après le ROLLBACK, de nouveau `9ba4d160`, ni fonction ni contrainte.
- **Appliquée en prod le 2026-10-24 à 6 h 25 (heure de Paris)**, avec l'accord de l'utilisateur : psql
  `--single-transaction`, `SET ROLE postgres`, `lock_timeout` 5 s, le fichier de `main` (sha256 `9e8a43be…`), sans
  erreur (`UPDATE 0`). Vérifié en lecture seule : fonction `b0ca2c58` (attribution, nom filtré, prix libre, security
  definer), `public_contributor_label` rend « Camille Martin » et NULL pour une adresse e-mail, contrainte validée,
  465 événements dont aucun nom public avec « @ ».

## 2026-10-24 — « Pour toi » : les goûts et la règle de la page

- `20261024190000_create_pour_toi` (étape 4 de `../live/docs/chantiers/pour-toi.md`) : `app_interests` (les douze
  goûts de la fiche, posés par les noms de leurs catégories et tags ; lisibles par tous, écrits par les admins),
  `user_interests` (les goûts choisis, chacun les siens, comme `user_follows`), `app_interest_ids(events)` (colonne
  calculée : les goûts qui prennent un événement ; le jeune public seulement par « En famille »), la règle de la page
  (`app_for_me_profile_of`, `app_for_me_profile`, `app_is_for_me` : un goût choisi, ou un lieu, un organisateur, un
  artiste suivi), `for_me` sur `app_events_in_range` et `app_event_counts` (supprimées puis recréées : PGRST203),
  `app_interest_counts` (les bulles, à partir de 5 événements ou choisies), `copy_guest_data` (les goûts aussi, une
  colonne `interests` de plus) et trois compteurs d'audience (`for_me_opened`, `interests_changed`, `for_me_to_all` ;
  la liste reprend ceux de `20261024150000`, « Suivre une émission »).
- Vérifié sur la lecture de la prod faite pour les maquettes (vendredi 23 octobre 18 h, 353 événements, clé publique) :
  les douze bulles et les quatre semaines des cinq personnes de la fiche sont ceux des planches validées (Concerts 48…
  En famille 56 ; Inès 32, Julien 8, Monique 23, Lucas 17, Camille 31), une fois « Kid Francescoli » ramené à l'id de
  sa catégorie comme l'a fait `20261024120000` en prod. Sous une liste courte, les planches disaient « 7 autres
  événements dans “Tout” » ce week-end-là : `for_me => false` en compte 5, car « Tout » n'a pas les deux événements
  retirés de l'accueil (`hide_from_home`) que les planches comptaient.
- Tests : `supabase/tests/pour_toi.test.sql` (43 cas : la règle d'un goût, les trois valeurs de `for_me` pour cinq
  utilisateurs, les comptes de « Tout », de « Pour toi » et des autres, les bulles et leur seuil, la zone, un goût
  inactif, la RLS et les droits, la recopie invité → compte, les compteurs) ; 15 règles cassées une à une, chacune
  attrapée. Les 34 fichiers de `supabase/tests/` passent (Postgres 17 local en ICU, comme la prod).
- Essai à blanc en prod le 2026-10-24 vers 8 h (accord de l'utilisateur, transaction annulée) : empreintes de départ
  conformes (`app_audience_add` 2655acba : la migration de « Suivre une émission » n'était pas en prod), migration
  sans erreur, mêmes nombres avant et après en anon (« Tout » 7 jours 17/17, 350 à venir dont 2 hors « Tout »,
  48 concerts, zones 328/347/347/347), les douze goûts posés avec leurs catégories et tags, aucune ligne pour toi sans
  session. Bulles d'aujourd'hui (Orléans · 25 km) : Concerts 48, DJ sets et électro 11, Théâtre 80, Humour 50,
  Cirque 30, Danse 57, Cinéma 8, Ateliers 43, En famille 56 ; les cinq personnes de la fiche sur les quatre semaines
  suivantes : Inès 33, Julien 6, Monique 24, Lucas 20, Camille 31. Sauvegarde des quatre fonctions d'avant et retour
  arrière (testé en local : empreintes d'avant retrouvées, les autres tests passent) :
  `~/Documents/Backups/outlive/pour-toi-2026-10-24/`.
- **Appliquée en prod le 2026-10-24 à 8 h 13 (heure de Paris)**, avec l'accord de l'utilisateur : psql
  `--single-transaction`, `SET ROLE postgres`, `lock_timeout` 5 s, le fichier de cette PR (sha256 `af6c866d9b5c4a13…`),
  sans erreur. Vérifié : les empreintes d'après (`app_events_in_range` 78383a47, `app_event_counts` 9a653e81,
  `app_interest_ids` e79be31c…) ; par l'API publique, l'appel des versions installées de l'app en 200 et « Tout »
  inchangé (17 sur 7 jours), `app_interests` lisible, `app_interest_counts` (les neuf bulles ci-dessus),
  `user_interests` refusé à anon (401), `app_interest_ids` sur les cartes ; 200 cartes du `select` de l'app : 62 ms
  (médiane de 10, temps du serveur), 70 ms avec `app_interest_ids`.
- À surveiller : si `20261024150000` (« Suivre une émission ») est appliquée après celle-ci sans les trois compteurs de
  « Pour toi », elle les retire d'`app_audience_add` (sa session est prévenue).
