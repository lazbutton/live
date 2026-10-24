# OutLive — admin & API (`live-admin`)

Next.js (App Router) + Supabase. Back-office éditorial, espace organisateurs, pages publiques
de partage, API consommée par l'app Flutter (`../live`) et par les partenaires.

## Commandes

```bash
npm run dev
npm run build            # vérifie aussi les types
npm run lint
node --test "lib/**/*.test.mjs"  # tests (node:test), sans dépendance ; guillemets : sous-dossiers compris
npm run db:types         # régénère lib/supabase/database.types.ts depuis les migrations (Docker)
npm run db:test          # tests SQL de supabase/tests/ sur une base locale jetable (Docker)
npm run test:delete-user # l'Edge Function delete-user sur une pile Supabase locale jetable (Docker)
```

## Base de données — ce repo est la source de vérité

- `supabase/migrations/` est la **seule** source du schéma, pour l'admin et pour l'app Flutter.
  Mode d'emploi, ordre d'application et requête de vérification de la prod :
  `supabase/migrations/README.md`. Journal : `MIGRATIONS_LOG.md`.
- Migrations appliquées à la main (SQL Editor) : toujours vérifier ce qui est en prod avant
  de supposer qu'une colonne existe.
- Types : `lib/supabase/database.types.ts` (type `Database`), généré depuis les migrations par
  `npm run db:types` (base locale jetable, Supabase CLI + Docker, jamais la prod). Après une
  migration : le régénérer et le committer avec elle. Les clients de `lib/supabase/` sont typés ;
  types de ligne : `Tables<"events">`, `TablesInsert<…>`, `TablesUpdate<…>`. `TODO(types)` marque
  les écarts connus entre un type écrit à la main et le type généré.
- Règles métier partagées avec l'app : en SQL. `app_events()` = événements visibles dans l'app
  (approuvé, non archivé, `show_on_app`, non masqué par la modération). Changer cette règle
  ici change l'app.
  L'app l'appelle en `rpc/app_events` : sur un RPC, PostgREST v13 ne sait ni filtrer une jointure
  ni trier sur une colonne non sélectionnée. Au-dessus d'elle, pour l'app : `app_cities()`,
  `app_events_in_range()` et `app_event_counts()` (calendrier), `app_category_counts()` et
  `app_tag_counts()`, `app_search()` et `app_search_names()` (recherche ; extensions `unaccent` et `pg_trgm`
  dans le schéma `extensions`), `app_organizer_counts()` (fiche), `app_possible_duplicates()` (« Cet événement
  existe peut-être déjà » avant l'envoi d'une proposition ; règles `app_link_keys()` et `app_similar_titles()`,
  celles de la collecte), table `school_holidays`, `event_like_counts()`
  (favoris de « Mes suggestions » ; les lignes de `event_likes` ne sont lisibles que par leur auteur une fois
  `20261020181000` appliquée) ; contrat dans `docs/API_APP.md`, tests SQL dans `supabase/tests/`. Genre de prix
  (« Gratuit », prix libre, non renseigné) : colonne générée
  `events.price_kind`, lue par `formatGenericPriceLabel` ; ne pas le recalculer en TS ni en Dart.
- « Tout », la première page de l'accueil de l'app (`../live/docs/fonctionnalites/accueil.md`, « Règles ») :
  `app_on_tout(events)`, une colonne calculée pour PostgREST (`select=…,app_on_tout`, filtre `app_on_tout=is.true`),
  que lisent aussi les nombres de « Tout » ; ne pas refiltrer `hide_from_home` en TS ni en Dart. `events.category`
  est toujours l'id d'une catégorie (trigger `events_normalize_category`, qui convertit un nom écrit) ; le paramètre
  `category` des fonctions accepte encore l'id ou le nom.
- Genre, pour qui, réservation d'un événement (`../live/docs/chantiers/pour-toi.md`, « Des fiches plus riches ») : des
  listes fermées, `events.genre_ids` (`event_genres` de sa catégorie, tenus dans Réglages), `audience`, `min_age`,
  `booking` ; valeurs et libellés dans `lib/events/event-details.ts`. Le trigger `events_sync_details` garde les genres
  de la catégorie et recalcule `is_young_audience` depuis `audience` (`family`, `teens`) : ne pas le recalculer en TS.
  La collecte les remplit quand la source les dit (rien n'est deviné), « lus, à confirmer » (`details_to_confirm`) ;
  ce qui manque ou attend : « Fiches à compléter » (`/admin/fiches`).
- Attribution publique d'une proposition (« Proposé par … ») : `events.community_contributor_label` ne vient que de
  `public_contributor_label()`, jamais d'une adresse e-mail (contrainte `events_community_contributor_label_not_email`) ;
  l'auteur d'une demande sans nom se reconnaît par l'e-mail de son compte (`get_user_emails`), jamais public.
- Données d'un invité (session anonyme) recopiées sur le compte qui se connecte : `copy_guest_data()`
  (`security definer`, l'id de la session invitée sert de preuve ; `docs/API_APP.md`).
- Festivals (`../live/docs/fonctionnalites/festivals.md`) : une fiche de la catégorie Festival ; ses événements y sont rattachés
  par `events.festival_id` (pas de festival dans un festival : déclencheur `check_event_festival`), ses lieux dans
  `festival_locations` (le premier est le `location_id` de la fiche ; clé `id`, jamais `(festival_id,
  location_id)`, qui rendrait ambigus les `locations(…)` embarqués depuis `events`). `app_festival_events()` pour
  l'accueil de l'app ; sur « Tout », la fiche d'un festival qui y a un programme ne compte pas dans les nombres
  (`app_event_counts`, `app_zone_counts`, `app_cities`), ses événements si ; pas plus que sur les pages de lieu,
  d'organisateur et d'artiste (`app_organizer_counts`, `app_search_names`, `app_see_also`, `app_follows` ; un lieu
  ne compte pas non plus la fiche d'un festival dont il est un des lieux). Dans l'admin, le formulaire d'un
  événement (`event-festival-sections.tsx`, règles dans `lib/events/festivals.ts`) ; à l'import, le festival
  nommé est rattaché (`findFestivalForImport`). Les Multi-événements (`major_events`) sont abandonnés.
- Analyse d'affiche de l'app (`/api/mobile/events/extract-from-image`) : ouverte aux sessions invitées, plafonnée
  par jour par `take_poster_analysis()` (service role ; `lib/events/poster-analysis-quota.ts`).
- Mesure d'audience de l'app (U41) : `app_audience_add(day, counts)` additionne des compteurs quotidiens envoyés
  sans identité (clé publique seule) dans `app_audience_counts`, lisible par les admins (`/admin/audience`) ;
  conditions de la CNIL : `../live/docs/fonctionnalites/audience-et-plantages.md`, contrat dans `docs/API_APP.md`.
- Une nouvelle colonne sur `events` que l'app doit lire : migration ici, puis ajout dans
  `_eventColumns` côté app (`lib/services/event_service.dart`).
- Radio (Radio Campus, `../live/docs/fonctionnalites/radio.md`) : `radio_stations` (interrupteur `enabled`,
  faux tant que la radio n'a pas donné son accord écrit : la RLS cache alors tout), `radio_shows`, `radio_episodes`,
  `app_radio_day()` et `app_radio_shows()` pour l'app ; import horaire en lecture seule chez la radio
  (`/api/cron/radio-import`, lancé chaque heure par pg_cron : Vercel Hobby n'accepte qu'un cron par jour) ; « ce qui
  passe » : `GET /api/v1/radio/[stationId]/live` ; contrat dans `docs/API_APP.md`, « Radio ». Visuels gardés des
  émissions (à la place de la pochette que l'app dessine) : `radio_shows.image_url`, `lib/radio/show-images.ts`,
  posés par `scripts/radio-show-images.mjs` et le back-office.

## Structure

- `app/(admin)/admin/` back-office (`components/` = l'essentiel de l'UI), `app/(organizer)/` espace organisateurs.
- `app/api/` routes : `mobile/` et `notifications/` (appelées par l'app), `v1/` (API publique documentée,
  zod-to-openapi), `admin/`, `cron/`, `mcp/` (outils de l'agent de collecte).
- `lib/` logique serveur : `supabase/` (clients ; `service.ts` = service role, serveur uniquement),
  `api/` (`v1/` API publique, `app/` contrat de l'app), `events/`, `scraping/`, `agent/`, `collecte/`,
  `notifications/`, `image-cards/` (vignettes des affiches, `docs/EVENT_IMAGE_CARDS.md`),
  `school-holidays/` (vacances scolaires du calendrier de l'app, cron hebdomadaire), `radio/` (import des
  émissions de Radio Campus, « ce qui passe », fixtures du site de la radio).
- `.claude/skills/collecte/` : la routine de collecte d'événements.
- Textes importés : `lib/collecte/event-text.ts` (titre sans date ni lieu répété, capitales, guillemets ;
  description recollée), appliqué par `buildEventFormPrefillFromImport` et aux demandes ; titres restants dans
  l'admin, « Titres à revoir » ; données déjà en base : `scripts/clean-event-texts.mjs`. Noms de lieux,
  organisateurs, artistes et tags : triggers SQL (`format_entity_label`, `to_tag_title_case`), pas de règle en TS.

## Lien avec l'app Flutter

Contrat décrit route par route dans `docs/API_APP.md`, schémas zod dans `lib/api/app/schemas.ts`
(corps validés par `lib/api/app/http.ts`, réponses typées par `z.infer`).

- Appelées par l'app actuelle : `POST`/`DELETE /api/notifications/register-token`,
  `POST /api/notifications/admin/new-request` et `new-report`, `POST /api/user-requests`,
  `POST /api/mobile/events/extract-from-image`, `PATCH /api/admin/mobile/events/[id]` (actions rapides).
- Gardées pour les anciennes versions, à ne pas modifier : les autres `/api/admin/mobile/*`,
  `/api/notifications/send` et `send-test`, `/api/notifications/admin/new-feedback`, `/api/notion/resync`
  (sans effet depuis le retrait de Notion, 2026-10-20 : JWT admin vérifié, 200 sans rien faire).

Des builds de l'app sont publiés : une réponse peut gagner un champ, pas en perdre ni en renommer,
et un corps que l'app envoie doit rester accepté. Changer une forme : modifier les deux repos ensemble.

Alertes admin (`/api/notifications/admin/*`) : publiques, sans JWT. Leurs réponses, comme celle de
`/api/user-requests`, ne contiennent aucune donnée sur les admins (id, e-mail, token) : le détail
va dans les journaux du serveur (`sendNotificationToAdmins`). Le texte poussé vient de la ligne relue
en base, jamais du corps. Rejouer un id valide renvoie encore la notification (`docs/API_APP.md`,
incohérences, point 1).

## Secrets

`.env.local` (non versionné). La clé service role ne sort jamais du serveur (`lib/supabase/service.ts`).

## Plan en cours

`../live/docs/FEUILLE_DE_ROUTE.md` : tout ce qui reste à faire, avec les priorités choisies le 2026-10-24 ; les
chantiers en conception sont dans `../live/docs/chantiers/`. Avant de toucher à ce que l'app montre, lire la fiche de
sa fonctionnalité (`../live/docs/fonctionnalites/`) et, pour qui elle est faite, `../live/docs/PERSONAS.md`. Les
anciens documents (plans de refacto et de refonte, relevé des améliorations, conceptions des festivals, de la radio et
des villes) sont retirés : `../live/docs/HISTORIQUE.md`, « Retrouver un ancien document », dit où ils sont. Les
migrations et leur journal les citent encore : c'est leur histoire. Un renvoi vers une doc de l'app, dans le code ou
ici, cite la fiche et sa section par son nom (« Les pochettes »), pas par un numéro de § : les numéros changent.
