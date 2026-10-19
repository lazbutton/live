# 📦 Migrations Supabase

Ce dossier contient toutes les migrations de base de données pour le projet.

## Source de vérité (depuis 2026-10-17)

- **Ce dossier est la seule source du schéma** pour l'admin *et* l'app Flutter (`../live`).
  L'app n'a plus de dossier `supabase/` : toute migration se crée ici.
- Les migrations actives sont les fichiers `YYYYMMDDHHMMSS_*.sql` à la racine de ce dossier,
  dans l'ordre des noms. `archives/` est historique (ne pas appliquer).
  Exception sur une base neuve : la baseline `20251212120000` passe en premier. Les fichiers
  `2025011x`/`2025012x`, commités avec elle le 2025-12-13, portent un nom antérieur mais modifient
  ses tables.
- Règles métier partagées avec l'app : en SQL. Exemple : `app_events()` définit les événements
  visibles dans l'app (approuvé, non archivé, `show_on_app`, non masqué par la modération).

### Vérifier ce qui est appliqué en prod (lecture seule, SQL Editor)

```sql
select version, name from supabase_migrations.schema_migrations order by version desc limit 20;

-- Les migrations passées par le SQL Editor n'apparaissent pas forcément ci-dessus :
select
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'events' and column_name = 'show_on_app') as show_on_app,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'events' and column_name = 'hide_from_home') as hide_from_home,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'events' and column_name = 'is_pay_what_you_want') as pay_what_you_want,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'app_events') as app_events;
```

`app_events()` dépend de `show_on_app` : appliquer `20260915120000_add_show_on_app_and_agenda_types.sql`
avant `20261017120000_create_app_events_function.sql`.

### Après une migration : régénérer les types

```bash
npm run db:types   # Docker Desktop doit tourner
```

Le script (`scripts/db-types.sh`) monte une base Supabase locale jetable, y applique toutes les
migrations (baseline d'abord), écrit `lib/supabase/database.types.ts` puis supprime la base.
Committer le fichier avec la migration. Si une migration échoue sur une base neuve, le script
s'arrête sur elle : c'est à corriger dans la migration.

Comparer avec la prod (lecture seule, Management API, après `supabase login`) :

```bash
supabase gen types typescript --project-id <ref> --schema public > /tmp/prod.types.ts
diff /tmp/prod.types.ts lib/supabase/database.types.ts
```

### Tests SQL

```bash
npm run db:test   # Docker Desktop doit tourner
```

`scripts/db-test.sh` monte une base Supabase locale jetable, y applique toutes les migrations et lance
chaque `supabase/tests/*.test.sql` (une transaction annulée par fichier ; chaque cas affiche
`ok …`, le premier échec arrête son fichier). Ces fichiers refusent de tourner sur une base qui a
déjà des événements : jamais en prod.

## 📋 Structure

```
supabase/migrations/
├── README.md                    # Ce fichier
├── MIGRATIONS_LOG.md            # Log (baseline + décisions)
├── TEMPLATE.sql                 # Template pour créer une nouvelle migration
├── 20251212120000_baseline.sql  # Migration unique (baseline)
└── archives/                    # Anciennes migrations (NE PAS APPLIQUER)
```

## 🚀 Comment utiliser

### Appliquer une migration

1. **Via Supabase Dashboard** (recommandé pour commencer)
   - Aller dans **SQL Editor**
   - Ouvrir le fichier de migration
   - Copier-coller le contenu
   - Exécuter

2. **Via Supabase CLI** (pour la production)
   ```bash
   supabase db push
   ```

⚠️ **Important** : 
- Le dossier `supabase/migrations/archives/` est **historique**. Les fichiers qui s'y trouvent ne sont **plus** pris en compte et ne doivent pas être appliqués.
- Si vous avez appliqué des migrations manuellement via SQL Editor et que vous voulez utiliser `supabase db push` ensuite, exécutez d'abord le script `_mark_migrations_as_applied.sql` dans le SQL Editor pour marquer ces migrations comme déjà appliquées.

### Créer une nouvelle migration

1. **Copier le template**
   ```bash
   cp TEMPLATE.sql 00X_description.sql
   ```

2. **Éditer le fichier**
   - Remplacer `XXX` par le numéro de migration
   - Remplacer `[Titre]` par une description courte
   - Écrire le SQL de migration

3. **Tester en local**
   - Appliquer via Supabase Dashboard
   - Vérifier que tout fonctionne

4. **Documenter**
   - Ajouter une entrée dans `MIGRATIONS_LOG.md`
   - Mettre à jour le statut

## 📝 Convention de nommage

```
{numero}_{description_courte}.sql
```

Exemples :
- `001_initial_schema.sql`
- `002_add_user_preferences.sql`
- `003_add_event_comments.sql`

## ✅ Checklist avant d'appliquer une migration

- [ ] Migration testée en local
- [ ] Types régénérés (`npm run db:types`) et committés avec la migration
- [ ] Modèle Flutter mis à jour si nécessaire
- [ ] Services Flutter mis à jour si nécessaire
- [ ] Documentée dans `MIGRATIONS_LOG.md`
- [ ] Backup de la base de données (pour production)

## 🔍 Vérifier l'état actuel

Consulter `MIGRATIONS_LOG.md` pour voir la stratégie actuelle (baseline + archives).

## 📚 Documentation complète

Voir `MIGRATIONS_GUIDE.md` à la racine du projet pour :
- Guide complet des migrations
- Exemples de migrations courantes
- Bonnes pratiques
- Système de rollback

