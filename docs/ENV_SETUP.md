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

#### iOS (APNs)
```env
APNS_KEY_PATH=./secrets/AuthKey_XXXXXXXXXX.p8
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=XXXXXXXXXX
APNS_BUNDLE_ID=com.lazbutton.live
```

#### Android (FCM)
```env
FCM_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json
# OU
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

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


