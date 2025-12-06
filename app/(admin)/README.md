# Interface d'Administration

Interface d'administration pour gérer les événements, lieux, organisateurs et demandes d'utilisateurs.

## Configuration

### Variables d'environnement

Créez un fichier `.env.local` à la racine du projet avec les variables suivantes :

```env
NEXT_PUBLIC_SUPABASE_URL=votre_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_clé_anon_supabase
```

### Configuration Supabase

1. **Appliquer les migrations** : Exécutez les migrations dans le dossier `supabase/migrations/` via le dashboard Supabase ou la CLI :

```bash
supabase db push
```

Les migrations incluent :
- `001_initial_schema.sql` : Schéma initial (tables events, locations, organizers, event_organizers)
- `002_fix_rls_policies.sql` : Correction des politiques RLS
- `003_user_requests.sql` : Table pour les demandes de création d'utilisateurs

2. **Créer un utilisateur admin** : Dans le dashboard Supabase, allez dans Authentication > Users et modifiez les métadonnées d'un utilisateur pour ajouter :
```json
{
  "role": "admin"
}
```

## Utilisation

### Connexion

Accédez à `/admin/login` pour vous connecter avec vos identifiants administrateur.

### Gestion des événements

- **Visualiser** : Liste de tous les événements avec leur statut
- **Valider/Rejeter** : Boutons pour valider ou rejeter les événements en attente
- **Modifier** : Édition complète des informations d'un événement
- **Supprimer** : Suppression d'un événement

### Gestion des lieux

- **Créer** : Ajout de nouveaux lieux pour les événements
- **Modifier** : Édition des informations d'un lieu (nom, adresse, image)
- **Supprimer** : Suppression d'un lieu

### Gestion des organisateurs

- **Créer** : Ajout de nouveaux organisateurs/artistes
- **Modifier** : Édition des informations d'un organisateur
- **Supprimer** : Suppression d'un organisateur

### Gestion des demandes utilisateurs

- **Visualiser** : Liste de toutes les demandes de création de comptes
- **Approuver/Rejeter** : Validation ou rejet des demandes avec possibilité d'ajouter des notes
- **Détails** : Visualisation complète des informations d'une demande

## Sécurité

- Seuls les utilisateurs avec le rôle `admin` dans leurs métadonnées peuvent accéder à l'interface
- La vérification du rôle se fait côté client et serveur (via les politiques RLS de Supabase)
- Les données sensibles sont protégées par Row Level Security (RLS)

## Structure des fichiers

```
app/(admin)/
├── admin/
│   ├── page.tsx              # Page principale d'administration
│   └── components/
│       ├── events-management.tsx
│       ├── locations-management.tsx
│       ├── organizers-management.tsx
│       └── user-requests-management.tsx
└── admin/
    └── login/
        └── page.tsx          # Page de connexion
```




