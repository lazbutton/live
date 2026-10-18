# OutLive — admin & API (`live-admin`)

Next.js (App Router) + Supabase. Back-office éditorial, espace organisateurs, pages publiques
de partage, API consommée par l'app Flutter (`../live`) et par les partenaires.

## Commandes

```bash
npm run dev
npm run build            # vérifie aussi les types
npm run lint
node --test lib/**/*.test.mjs   # tests (node:test), sans dépendance
npm run db:types         # régénère lib/supabase/database.types.ts depuis les migrations (Docker)
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
  ni trier sur une colonne non sélectionnée.
- Une nouvelle colonne sur `events` que l'app doit lire : migration ici, puis ajout dans
  `_eventColumns` côté app (`lib/services/event_service.dart`).

## Structure

- `app/(admin)/admin/` back-office (`components/` = l'essentiel de l'UI), `app/(organizer)/` espace organisateurs.
- `app/api/` routes : `mobile/` et `notifications/` (appelées par l'app), `v1/` (API publique documentée,
  zod-to-openapi), `admin/`, `cron/`, `notion/`, `mcp/` (outils de l'agent de collecte).
- `lib/` logique serveur : `supabase/` (clients ; `service.ts` = service role, serveur uniquement),
  `events/`, `scraping/`, `agent/`, `collecte/`, `notifications/`, `notion/`.
- `.claude/skills/collecte/` : la routine de collecte d'événements.

## Lien avec l'app Flutter

L'app appelle : `/api/notifications/*`, `/api/user-requests`, `/api/mobile/events/extract-from-image`,
`/api/admin/mobile/*`, `/api/notion/resync`. Changer la forme d'une réponse de ces routes casse
l'app : modifier les deux repos ensemble.

## Secrets

`.env.local` (non versionné). La clé service role ne sort jamais du serveur (`lib/supabase/service.ts`).

## Plan en cours

`../live/docs/PLAN_REFACTO.md`.
