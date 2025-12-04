# Log des Migrations Supabase

Ce fichier documente toutes les migrations appliquées à la base de données.

---

## Migration 001 - Schéma initial
**Date** : 2024-12-XX  
**Fichier** : `001_initial_schema.sql`  
**Statut** : ⏳ À appliquer

### Description
Création du schéma de base de données initial avec toutes les tables nécessaires.

### Tables créées
- `locations` - Lieux des événements
- `organizers` - Organisateurs/Artistes
- `events` - Événements
- `event_organizers` - Liaison many-to-many événements-organisateurs

### Fonctionnalités
- Row Level Security (RLS) activé sur toutes les tables
- Politiques de sécurité configurées
- Triggers pour `updated_at`
- Index pour les performances

### Commandes SQL
Voir le guide `SUPABASE_SETUP_GUIDE.md` section **Étape 2.2**

---

## Migration 002 - Correction des politiques RLS
**Date** : 2024-12-XX  
**Fichier** : `002_fix_rls_policies.sql`  
**Statut** : ✅ Appliquée

### Description
Correction des politiques RLS qui tentaient d'accéder à auth.users de manière incorrecte.

---

## Migration 003 - Table des demandes utilisateurs
**Date** : 2024-12-XX  
**Fichier** : `003_user_requests.sql`  
**Statut** : ✅ Appliquée

### Description
Création de la table `user_requests` pour gérer les demandes de création de comptes utilisateurs avec validation admin.

### Tables créées
- `user_requests` - Demandes de création de comptes

---

## Migration 004 - Fonction pour créer un admin
**Date** : 2024-12-XX  
**Fichier** : `004_create_admin_function.sql`  
**Statut** : ⏳ À appliquer

### Description
Création d'une fonction helper `make_user_admin()` pour promouvoir un utilisateur en admin via ses métadonnées.

### Fonctions créées
- `make_user_admin(user_email TEXT)` - Promouvoir un utilisateur en admin

---

## Migration 005 - Correction des politiques RLS pour user_requests
**Date** : 2024-12-XX  
**Fichier** : `005_fix_user_requests_rls.sql`  
**Statut** : ⏳ À appliquer

### Description
Correction des politiques RLS pour la table `user_requests` qui utilisaient une méthode incompatible avec Supabase. Utilisation d'une fonction helper `is_user_admin()` pour vérifier le rôle admin.

### Fonctions créées
- `is_user_admin()` - Vérifier si l'utilisateur connecté est admin

### Politiques modifiées
- `Authenticated admins can view user requests` - Pour SELECT
- `Authenticated admins can manage user requests` - Pour INSERT, UPDATE, DELETE

---

## 📝 Notes

- Utiliser ce fichier pour documenter chaque migration
- Mettre à jour le statut : ⏳ À appliquer / ✅ Appliquée / ❌ Échouée
- Inclure la date d'application en production

