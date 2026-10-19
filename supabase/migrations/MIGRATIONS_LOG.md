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
- **Pas encore appliquée en prod.** Ordre de mise en route et vérifications : `docs/EVENT_IMAGE_CARDS.md`.

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
- **Pas encore appliquées en prod.** Ordre : les trois fichiers dans l'ordre des noms (une transaction
  par fichier), puis un premier chargement des vacances (cron appelé à la main avec `CRON_SECRET`, une
  fois l'admin déployé). Vérification, en anon : `GET /rest/v1/rpc/app_category_counts`,
  `POST /rest/v1/rpc/app_event_counts` (`{"ranges":[{"start":"2026-10-23","end":"2026-10-24"}]}`) et
  `GET /rest/v1/school_holidays?last_day=gte.2026-10-19`.
