# Guide de dépannage

## Erreur "Non authentifié" lors de l'importation Facebook

### Symptôme
Vous obtenez l'erreur "Non authentifié" (401) lors de l'importation d'événements Facebook.

### Causes possibles

1. **Session expirée**
   - Votre session Supabase a expiré
   - Les cookies d'authentification ne sont plus valides

2. **Cookies non envoyés**
   - Les cookies d'authentification ne sont pas envoyés avec la requête
   - Problème de configuration CORS ou SameSite

3. **Variables d'environnement**
   - `NEXT_PUBLIC_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` manquantes ou incorrectes

### Solutions

#### Solution 1 : Vérifier la session

1. Vérifiez que vous êtes connecté :
   - Allez sur `/admin/login`
   - Connectez-vous avec vos identifiants admin
   - Vérifiez que vous êtes redirigé vers `/admin`

2. Vérifiez les cookies :
   - Ouvrez les outils de développement (F12)
   - Allez dans l'onglet "Application" (Chrome) ou "Stockage" (Firefox)
   - Vérifiez que les cookies Supabase sont présents (nom commençant par `sb-`)

#### Solution 2 : Vérifier les variables d'environnement

1. Vérifiez que `.env.local` existe à la racine du projet :
   ```bash
   ls -la .env.local
   ```

2. Vérifiez le contenu de `.env.local` :
   ```bash
   cat .env.local
   ```

   Vous devriez voir :
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_clé_anon
   FACEBOOK_ACCESS_TOKEN=votre_token_facebook
   ```

3. **Important** : Après avoir modifié `.env.local`, redémarrez le serveur de développement :
   ```bash
   # Arrêtez le serveur (Ctrl+C) et relancez :
   npm run dev
   ```

#### Solution 3 : Vérifier la configuration Supabase

1. Vérifiez que les URLs Supabase sont correctes dans `.env.local`
2. Vérifiez que votre utilisateur a bien le rôle "admin" dans Supabase :
   - Allez dans le dashboard Supabase
   - Authentication > Users
   - Modifiez les métadonnées de l'utilisateur pour ajouter :
     ```json
     {
       "role": "admin"
     }
     ```

#### Solution 4 : Nettoyer les cookies et se reconnecter

1. Déconnectez-vous de l'application admin
2. Supprimez tous les cookies du site dans les outils de développement
3. Reconnectez-vous avec vos identifiants admin
4. Réessayez l'importation Facebook

#### Solution 5 : Vérifier les logs serveur

Si vous exécutez le serveur de développement (`npm run dev`), vérifiez la console :
- Les erreurs d'authentification sont loggées avec des détails
- Les logs indiquent si les cookies sont présents ou absents

### Vérification rapide

Pour vérifier rapidement si le problème vient de l'authentification ou du token Facebook :

1. Testez d'abord l'authentification :
   - Allez sur `/admin`
   - Si vous êtes redirigé vers `/admin/login`, le problème vient de l'authentification
   - Si vous voyez le dashboard admin, l'authentification fonctionne

2. Vérifiez le token Facebook :
   - Ouvrez la console du navigateur (F12)
   - Regardez les erreurs dans l'onglet "Console"
   - Si l'erreur est "Token d'accès Facebook non configuré", c'est un problème de variable d'environnement

### Note sur les variables d'environnement

- **`.env.local`** est automatiquement chargé par Next.js
- Les variables `NEXT_PUBLIC_*` sont disponibles côté client ET serveur
- Les variables sans `NEXT_PUBLIC_` (comme `FACEBOOK_ACCESS_TOKEN`) sont **uniquement côté serveur**
- **Après modification de `.env.local`, redémarrez toujours le serveur**

### Besoin d'aide supplémentaire ?

Si le problème persiste :
1. Vérifiez les logs du serveur (console où vous avez lancé `npm run dev`)
2. Vérifiez les logs du navigateur (console F12)
3. Vérifiez que toutes les migrations Supabase ont été appliquées
4. Vérifiez que votre compte Supabase est actif

