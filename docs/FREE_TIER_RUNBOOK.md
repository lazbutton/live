# Runbook Supabase Free et Vercel Hobby

Ce document maintient OutLive à 0 € par mois pour Supabase et Vercel pendant
la phase personnelle non commerciale. Les coûts du domaine, du compte Apple,
d'OpenAI, de Resend au-delà de son quota et des autres fournisseurs ne sont
pas couverts ici.

## Référence au 21 août 2026

- Projet Supabase de production : `Live`
- Référence : `tkyuiltgvqcgebnqdgmb`
- Taille DB après assainissement : 22 MB
- Storage après suppression des orphelins : 10 MB et 69 objets
- Projet Supabase supplémentaire : `Gabbler`
- Projets Vercel OutLive : `outlive` et `live-app`
- Domaine principal : `www.outlive.fr`

L'incident de volume initial provenait de 5,36 millions de lignes dans
`notion_sync_jobs` (2,83 GB). Une boucle Lieux/Organisateurs réécrivait des
valeurs identiques entre Notion et Supabase. La synchronisation Notion a
été retirée le 2026-10-20 (code, cron et tables `notion_*`).

## Seuils opérationnels

Déclencher une revue dès qu'un seuil d'alerte est atteint :

- Base Supabase : alerte à 400 MB, limite Free à 500 MB
- Storage Supabase : alerte à 800 MB, limite Free à 1 GB
- Egress Supabase : alerte à 4 GB, quota Free à 5 GB
- Utilisateurs actifs Supabase : alerte à 40 000, quota Free à 50 000
- Edge Functions Supabase : alerte à 400 000, quota Free à 500 000
- Fonctions Vercel : alerte à 800 000 invocations, quota Hobby à 1 million
- CPU Vercel : alerte à 3 heures, quota Hobby à 4 heures
- Transfert Vercel : alerte à 80 GB, quota Hobby à 100 GB

Les quotas officiels changent. Vérifier les pages Pricing avant chaque
revue trimestrielle ou avant une campagne d'acquisition.

## Sauvegarde

Pré-requis :

- Supabase CLI connecté et projet lié
- `pg_dump`, `psql` et `shasum`
- au moins 1 GB libre pour l'état normal de la base

Depuis `live-admin` :

```bash
./scripts/backup-supabase-free-tier.sh
```

Un dossier daté est créé par défaut dans
`~/Documents/Backups/outlive`. Il contient :

- `roles.sql`, `schema.sql` et `data.sql`
- les trois buckets Storage
- un inventaire de taille
- `SHA256SUMS`

Après chaque sauvegarde :

1. Exécuter `shasum -a 256 -c SHA256SUMS` dans le dossier.
2. Copier le dossier vers un volume chiffré hors de la machine.
3. Conserver la dernière sauvegarde mensuelle et celle qui précède chaque
   migration importante.
4. Supprimer les sauvegardes anciennes seulement après validation de la
   copie distante.

Une restauration locale complète de la pile Supabase requiert environ
15 GB d'espace libre pour les images Docker. Ne pas la lancer si le disque
est proche de la saturation.

## Restauration

Sur un projet Supabase vide ou une pile locale :

```bash
shasum -a 256 -c SHA256SUMS
psql "$DATABASE_URL" \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql
```

Restaurer ensuite les buckets depuis le dossier de sauvegarde :

```bash
supabase storage cp -r storage/event-images ss:///event-images --linked --experimental
supabase storage cp -r storage/locations-images ss:///locations-images --linked --experimental
supabase storage cp -r storage/organizers-images ss:///organizers-images --linked --experimental
```

Après restauration :

1. Redéployer `delete-user`.
2. Reconfigurer les secrets des Edge Functions.
3. Vérifier les fournisseurs Auth, URLs OAuth et SMTP Resend.
4. Vérifier les webhooks Supabase.
5. Tester auth, lecture, upload, CRUD admin, push et suppression de compte.

## Maintenance mensuelle

Le workflow `.github/workflows/free-tier-monthly-review.yml` ouvre
automatiquement une issue de suivi le premier de chaque mois à 08:00 UTC.
Il peut aussi être lancé manuellement depuis GitHub Actions et ne crée jamais
de doublon pour un même mois. Les issues doivent rester activées sur le dépôt.

Le premier jour ouvré du mois :

1. Lancer la sauvegarde.
2. Relever DB, Storage, egress, MAU et Edge Functions dans Supabase.
3. Relever invocations, CPU, mémoire et transfert dans Vercel.
4. Déclencher le nettoyage depuis l'admin ou appeler
   `cleanup_free_tier_technical_data()`.
5. Lancer l'audit Storage. La simulation liste les fichiers de plus de 30 jours
   qu'aucune des références de `bucketReferences` (dans le script) ne cite :

```bash
node --env-file=.env.local scripts/audit-storage.mjs --grace-days=30
```

6. Si le dry-run est validé et la sauvegarde existe :

```bash
node --env-file=.env.local scripts/audit-storage.mjs \
  --grace-days=30 \
  --delete \
  --confirm=tkyuiltgvqcgebnqdgmb
```

7. Contrôler le dernier passage de chaque cron.

## Planning Vercel Hobby

Les crons sont en UTC et leur précision est d'une heure :

- `cleanup` : tous les jours à 03:00 UTC
- `image-cards` : tous les jours à 04:00 UTC (vignettes d'affiches manquantes,
  voir `docs/EVENT_IMAGE_CARDS.md`)
- `school-holidays` : le lundi à 05:00 UTC (vacances scolaires du calendrier de l'app)
- `daily-events` : tous les jours à 08:00 UTC
- `weekly-summary` : le lundi à 08:00 UTC
- `radio-import` : tous les jours à 05:30 UTC (le filet). L'import de la radio doit tourner chaque heure :
  Hobby refuse un cron plus fréquent que quotidien (le déploiement échoue), c'est donc la base qui le lance,
  tâche pg_cron `radio-import` à :07 (migration `20261023143000_schedule_radio_import.sql`, secret
  `radio_import_cron_secret` dans Vault). Coût : 24 appels de fonction par jour, quelques secondes de CPU.

La route « ce qui passe » de la radio (`/api/v1/radio/[stationId]/live`) est gardée 10 s par le CDN : au plus
une exécution par 10 s et par région (~260 000 par mois si quelqu'un l'interroge sans arrêt), à condition que
l'app l'appelle sans en-tête `Authorization` (le CDN ne garde pas ces réponses-là).

## Pause Supabase

Un projet Free peu actif peut être pausé.

1. Ouvrir le projet dans le dashboard Supabase.
2. Cliquer sur Restore project.
3. Attendre le retour des APIs.
4. Tester une lecture publique et une authentification.
5. Exécuter manuellement les crons de notifications.
6. Consulter les logs dans la journée, leur rétention Free étant courte.

Le cron quotidien de nettoyage produit normalement une activité DB, mais il
ne constitue pas une garantie de disponibilité.

## Rétrogradation

Avant Supabase Pro vers Free :

1. Confirmer que `Live` et `Gabbler` sont les deux seuls projets actifs.
2. Vérifier que tous les seuils sont sous 80 %.
3. Créer une sauvegarde et valider ses sommes SHA.
4. Dans Billing, choisir Change subscription plan puis Free.
5. Contrôler l'éventuelle facture d'usage échue et le crédit non consommé.

Avant Vercel Pro vers Hobby :

1. Confirmer que le projet reste personnel et non commercial.
2. Vérifier que la production utilise le planning quotidien.
3. Inventorier domaines et variables des projets `outlive` et `live-app`.
4. Transférer domaines ou projets si l'assistant Vercel le demande.
5. Rétrograder l'équipe ; les autres membres Pro seront retirés.
6. Redéployer et exécuter les smoke tests.

## Retour au payant

Réactiver Pro si l'un des cas suivants devient durable :

- un seuil d'alerte est dépassé deux mois de suite ;
- une cadence sous-journalière ou un horaire précis redevient indispensable ;
- le projet devient commercial au sens des conditions Vercel ;
- les sauvegardes manuelles, la pause ou l'absence de SLA ne sont plus
  acceptables ;
- une campagne prévue risque de dépasser les quotas gratuits.
