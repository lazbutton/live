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
  dans le schéma `extensions`), `app_organizer_counts()` (fiche), table `school_holidays`, `event_like_counts()`
  (favoris de « Mes suggestions » ; les lignes de `event_likes` ne sont lisibles que par leur auteur une fois
  `20261020181000` appliquée) ; contrat dans `docs/API_APP.md`, tests SQL dans `supabase/tests/`. Genre de prix
  (« Gratuit », prix libre, non renseigné) : colonne générée
  `events.price_kind`, lue par `formatGenericPriceLabel` ; ne pas le recalculer en TS ni en Dart.
- Données d'un invité (session anonyme) recopiées sur le compte qui se connecte : `copy_guest_data()`
  (`security definer`, l'id de la session invitée sert de preuve ; `docs/API_APP.md`).
- Une nouvelle colonne sur `events` que l'app doit lire : migration ici, puis ajout dans
  `_eventColumns` côté app (`lib/services/event_service.dart`).

## Structure

- `app/(admin)/admin/` back-office (`components/` = l'essentiel de l'UI), `app/(organizer)/` espace organisateurs.
- `app/api/` routes : `mobile/` et `notifications/` (appelées par l'app), `v1/` (API publique documentée,
  zod-to-openapi), `admin/`, `cron/`, `notion/`, `mcp/` (outils de l'agent de collecte).
- `lib/` logique serveur : `supabase/` (clients ; `service.ts` = service role, serveur uniquement),
  `api/` (`v1/` API publique, `app/` contrat de l'app), `events/`, `scraping/`, `agent/`, `collecte/`,
  `notifications/`, `notion/`, `image-cards/` (vignettes des affiches, `docs/EVENT_IMAGE_CARDS.md`),
  `school-holidays/` (vacances scolaires du calendrier de l'app, cron hebdomadaire).
- `.claude/skills/collecte/` : la routine de collecte d'événements.

## Lien avec l'app Flutter

Contrat décrit route par route dans `docs/API_APP.md`, schémas zod dans `lib/api/app/schemas.ts`
(corps validés par `lib/api/app/http.ts`, réponses typées par `z.infer`).

- Appelées par l'app actuelle : `POST`/`DELETE /api/notifications/register-token`,
  `POST /api/notifications/admin/new-request` et `new-report`, `POST /api/user-requests`,
  `POST /api/mobile/events/extract-from-image`, `PATCH /api/admin/mobile/events/[id]` (actions rapides).
- Gardées pour les anciennes versions, à ne pas modifier : les autres `/api/admin/mobile/*`,
  `/api/notifications/send` et `send-test`, `/api/notifications/admin/new-feedback`, `/api/notion/resync`.

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

`../live/docs/PLAN_REFACTO.md`.
