# Interface d'Administration

Interface d'administration pour gérer les événements, lieux, organisateurs et demandes d'utilisateurs.

## Configuration

### Variables d'environnement

Créez un fichier `.env.local` à la racine du projet avec les variables suivantes :

```env
NEXT_PUBLIC_SUPABASE_URL=votre_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_clé_anon_supabase
FACEBOOK_ACCESS_TOKEN=votre_token_acces_facebook
```

**Note:** `FACEBOOK_ACCESS_TOKEN` est requis pour importer les événements depuis Facebook. 

⚠️ **Important** : Vous devez utiliser un **Page Access Token** ou **System User Token**, pas un User Access Token. Si vous obtenez l'erreur "You can only complete this action in Accounts Center", c'est que vous utilisez le mauvais type de token.

**Pour récupérer les événements de pages publiques** : Utilisez un token avec la permission `pages_read_user_content`. Voir [Guide pages publiques](docs/FACEBOOK_PUBLIC_PAGES.md).

Voir le guide complet : [Configuration Facebook](docs/FACEBOOK_SETUP.md)

**Méthode rapide** :
1. Allez sur [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Obtenez un User Access Token avec les permissions `pages_read_engagement`, `pages_show_list`
3. Faites une requête `GET /me/accounts` pour obtenir le Page Access Token de votre page
4. Utilisez ce Page Access Token dans `FACEBOOK_ACCESS_TOKEN`

### Configuration Supabase

1. **Appliquer les migrations** : Exécutez les migrations dans le dossier `supabase/migrations/` via le dashboard Supabase ou la CLI :

```bash
supabase db push
```

Les migrations incluent :
- `001_initial_schema.sql` : Schéma initial (tables events, locations, organizers, event_organizers)
- `002_fix_rls_policies.sql` : Correction des politiques RLS
- `003_user_requests.sql` : Table pour les demandes de création d'utilisateurs
- `029_add_facebook_page_id_to_organizers.sql` : Ajout du champ `facebook_page_id` aux organisateurs pour l'importation depuis Facebook

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
- **Modifier** : Édition des informations d'un organisateur (incluant l'ID de page Facebook)
- **Supprimer** : Suppression d'un organisateur
- **Importer depuis Facebook** : Récupérer les événements Facebook d'un organisateur et les transformer en demandes d'événements

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







