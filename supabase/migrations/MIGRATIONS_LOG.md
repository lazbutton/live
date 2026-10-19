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

