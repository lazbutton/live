# Interface d'Administration

Interface d'administration pour gérer les événements, lieux, organisateurs et demandes d'utilisateurs.

## Configuration

### Variables d'environnement

Créez un fichier `.env.local` à la racine du projet avec les variables suivantes :

```env
NEXT_PUBLIC_SUPABASE_URL=votre_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_clé_anon_supabase
SUPABASE_SERVICE_ROLE_KEY=votre_clé_service_role
FACEBOOK_ACCESS_TOKEN=votre_token_acces_facebook
RESEND_API_KEY=votre_clé_api_resend (optionnel, pour les emails d'invitation)
RESEND_FROM_EMAIL=noreply@votredomaine.com (optionnel, pour les emails d'invitation)
```

**Note:** `SUPABASE_SERVICE_ROLE_KEY` est requise pour :
- Créer des utilisateurs automatiquement confirmés (sans email de confirmation)
- Accéder aux données admin depuis les API routes

⚠️ **Important** : `SUPABASE_SERVICE_ROLE_KEY` donne un accès complet à votre base de données. Ne l'exposez jamais côté client et ne la commitez jamais dans Git.

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

1. **Appliquer les migrations** : Exécutez uniquement les migrations situées directement dans `supabase/migrations/` (hors `archives/`) via le dashboard Supabase ou la CLI :

```bash
supabase db push
```

⚠️ **Important** : le dossier `supabase/migrations/archives/` est **historique** et ne doit plus être pris en compte.

Migrations actives :
- `20251212120000_baseline.sql` : baseline (schéma final) du projet

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

- **Visualiser** : Liste des demandes d'ajout d'événements (et demandes depuis URL)
- **Éditer puis créer** : Conversion d'une demande en événement (créé en `pending`)
- **Rejeter** : Rejet d'une demande
- **Converti** : La demande est marquée `converted` une fois l'événement créé

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







