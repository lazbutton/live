# 📦 Migrations Supabase

Ce dossier contient toutes les migrations de base de données pour le projet.

## 📋 Structure

```
supabase/migrations/
├── README.md                    # Ce fichier
├── MIGRATIONS_LOG.md            # Log de toutes les migrations
├── TEMPLATE.sql                 # Template pour créer une nouvelle migration
├── 001_initial_schema.sql       # Migration initiale
└── 00X_xxx.sql                  # Futures migrations
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
- [ ] Modèle Flutter mis à jour si nécessaire
- [ ] Services Flutter mis à jour si nécessaire
- [ ] Documentée dans `MIGRATIONS_LOG.md`
- [ ] Backup de la base de données (pour production)

## 🔍 Vérifier l'état actuel

Consulter `MIGRATIONS_LOG.md` pour voir :
- Quelles migrations ont été appliquées
- Leur statut (⏳ À appliquer / ✅ Appliquée)
- Les dates d'application

## 📚 Documentation complète

Voir `MIGRATIONS_GUIDE.md` à la racine du projet pour :
- Guide complet des migrations
- Exemples de migrations courantes
- Bonnes pratiques
- Système de rollback

