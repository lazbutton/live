## Live Admin

Interface d'administration (Next.js) pour gérer les événements, lieux, organisateurs, demandes et notifications.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Base de données (Supabase) — migrations

- **Migrations actives** : uniquement les fichiers SQL situés directement dans `supabase/migrations/`.
- **Migrations archivées** : `supabase/migrations/archives/` est historique et **ne doit plus être appliqué**.
- **Baseline** : `supabase/migrations/20251212120000_baseline.sql`.

Voir `supabase/migrations/README.md` et `supabase/migrations/MIGRATIONS_LOG.md`.

## Synchro Notion

L’intégration Notion vit côté `live-admin`:

- Webhook entrant: `POST /api/notion/webhook`
- Bootstrap initial: `POST /api/notion/bootstrap`
- Resync manuel / dry-run: `POST /api/notion/resync`
- Drain de queue: `GET /api/cron/notion-sync`

Variables d’environnement minimales:

- `NOTION_SYNC_ENABLED`
- `NOTION_API_KEY`
- `NOTION_API_VERSION`
- `NOTION_WEBHOOK_VERIFICATION_TOKEN`
- `NOTION_EVENTS_DATA_SOURCE_ID`
- `NOTION_REQUESTS_DATA_SOURCE_ID`
- `NOTION_LOCATIONS_DATA_SOURCE_ID`
- `NOTION_ORGANIZERS_DATA_SOURCE_ID`
- `NOTION_SYNC_ACTOR_USER_ID`
- `CRON_SECRET`

La synchro repose sur:

- Des tables `notion_*` dans Supabase pour les liens, jobs, erreurs et checkpoints
- Des triggers DB pour pousser les mutations live vers la queue
- Des webhooks Notion pour pousser les mutations Notion vers la même queue
- Une résolution de conflit `last_write_wins` complétée par un `sync_hash` pour éviter les boucles

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
