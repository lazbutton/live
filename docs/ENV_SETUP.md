# Configuration des Variables d'Environnement

## Variables Requises

### Supabase (Obligatoires)

```env
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_clé_anon
SUPABASE_SERVICE_ROLE_KEY=votre_clé_service_role
```

⚠️ **Important** : 
- `SUPABASE_SERVICE_ROLE_KEY` est **obligatoire** pour les fonctionnalités de notifications
- Cette clé est **secrète** et ne doit **jamais** être committée dans Git
- Elle doit être ajoutée dans `.env.local` (qui est dans `.gitignore`)

### Comment obtenir SUPABASE_SERVICE_ROLE_KEY

1. Allez sur [Supabase Dashboard](https://supabase.com/dashboard)
2. Sélectionnez votre projet
3. Allez dans **Settings** > **API**
4. Dans la section **Project API keys**, trouvez la clé **`service_role` secret**
5. Copiez cette clé et ajoutez-la dans votre `.env.local` :

```env
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Notifications (Optionnelles mais recommandées)

⚠️ **IMPORTANT** : Ces variables sont **requises** pour envoyer des notifications push iOS et Android.

#### iOS (APNs) - Utilise node-apn directement

Les variables suivantes sont **obligatoires** pour les notifications iOS :

**Option 1 : Fichier local (Développement local)**

```env
# Chemin vers le fichier de clé APNs (.p8)
# Placez le fichier dans le dossier secrets/ (ex: secrets/AuthKey_XXXXXXXXXX.p8)
APNS_KEY_PATH=./secrets/AuthKey_XXXXXXXXXX.p8

# Key ID de la clé APNs (trouvable sur Apple Developer Portal)
APNS_KEY_ID=XXXXXXXXXX

# Team ID Apple (votre Team ID depuis Apple Developer Portal)
APNS_TEAM_ID=XXXXXXXXXX

# Bundle ID de votre application iOS
APNS_BUNDLE_ID=com.lazbutton.live
```

**Option 2 : Variable d'environnement (Production/Vercel) - RECOMMANDÉ**

```env
# Contenu du fichier .p8 directement dans la variable (pour Vercel/production)
# Copiez tout le contenu du fichier .p8 (y compris les lignes -----BEGIN PRIVATE KEY----- et -----END PRIVATE KEY-----)
APNS_KEY_CONTENT="-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...\n-----END PRIVATE KEY-----"

# Key ID de la clé APNs (trouvable sur Apple Developer Portal)
APNS_KEY_ID=XXXXXXXXXX

# Team ID Apple (votre Team ID depuis Apple Developer Portal)
APNS_TEAM_ID=XXXXXXXXXX

# Bundle ID de votre application iOS
APNS_BUNDLE_ID=com.lazbutton.live
```

⚠️ **Important pour la production (Vercel)** :
- Utilisez `APNS_KEY_CONTENT` au lieu de `APNS_KEY_PATH`
- Les fichiers dans `secrets/` ne sont pas déployés sur Vercel
- Copiez tout le contenu du fichier `.p8` dans la variable `APNS_KEY_CONTENT`
- Les `\n` seront automatiquement convertis en sauts de ligne

**Environnement** :
```env
# Environnement: 'production' pour production, 'development' pour sandbox
# Par défaut, Next.js utilise 'production' en build, 'development' en dev
NODE_ENV=production
```

**Comment obtenir ces valeurs** :
1. Suivez le guide complet dans `docs/ios-apns-setup.md`
2. Créez une Push Notification Key sur [Apple Developer Portal](https://developer.apple.com/account/)
3. Téléchargez le fichier `.p8` et placez-le dans le dossier `secrets/`
4. Notez le Key ID et votre Team ID depuis le portal

**Structure des dossiers** :
```
live-admin/
├── secrets/
│   └── AuthKey_XXXXXXXXXX.p8  # Fichier APNs key
├── .env.local
└── ...
```

#### Android (FCM)

**Option 1 : Fichier service account JSON** (Recommandé pour développement)

```env
FCM_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json
```

**Option 2 : JSON directement dans la variable** (Pour Vercel, etc.)

```env
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

**Comment obtenir le service account** :
1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionnez votre projet
3. Allez dans **Paramètres** > **Comptes de service**
4. Cliquez sur **Générer une nouvelle clé privée**
5. Téléchargez le fichier JSON et placez-le dans `secrets/`

Voir `docs/NOTIFICATIONS_SETUP.md` pour plus de détails.

### Autres (Optionnelles)

```env
FACEBOOK_ACCESS_TOKEN=votre_token_facebook
OPENAI_API_KEY=votre_clé_openai
NODE_ENV=production
```

## Après modification de .env.local

**⚠️ IMPORTANT** : Après avoir modifié `.env.local`, vous **DEVEZ redémarrer le serveur de développement** :

```bash
# Arrêter le serveur (Ctrl+C)
# Puis redémarrer :
npm run dev
```

Les variables d'environnement sont chargées au démarrage du serveur. Si vous les modifiez sans redémarrer, les nouvelles valeurs ne seront pas prises en compte.

## Vérification

Pour vérifier que vos variables sont bien chargées, vous pouvez temporairement ajouter un log dans une API route (à retirer ensuite) :

```typescript
console.log("SUPABASE_SERVICE_ROLE_KEY exists:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
```

## Sécurité

- ⚠️ Ne jamais commiter `.env.local` dans Git
- ⚠️ `SUPABASE_SERVICE_ROLE_KEY` donne un accès complet à votre base de données - gardez-la secrète
- ⚠️ En production (Vercel, etc.), utilisez les "Environment Variables" du dashboard au lieu de `.env.local`


