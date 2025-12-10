# Configuration d'une URL de développement publique

Pour tester les notifications depuis votre application mobile en développement, vous avez besoin d'une URL publique accessible depuis Internet. Voici plusieurs solutions :

## Solution 1 : ngrok (Recommandé pour tests rapides)

### Installation

```bash
# Installer ngrok
brew install ngrok  # macOS
# ou télécharger depuis https://ngrok.com/download

# S'inscrire et obtenir votre token
ngrok config add-authtoken <votre-token>
```

### Utilisation

1. **Démarrer votre serveur Next.js en local** :
   ```bash
   npm run dev
   ```
   Le serveur démarre sur `http://localhost:3000`

2. **Créer un tunnel ngrok** :
   ```bash
   ngrok http 3000
   ```

3. **Copier l'URL fournie** (ex: `https://abc123.ngrok.io`)

4. **Configurer votre application mobile** pour utiliser cette URL :
   ```
   https://abc123.ngrok.io/api/notifications/send-test
   ```

⚠️ **Note** : L'URL ngrok change à chaque démarrage (gratuit). Pour une URL fixe, utilisez un plan payant ou la Solution 2.

### Configuration Next.js

Si vous voyez un avertissement concernant les requêtes cross-origin depuis ngrok, la configuration est déjà ajoutée dans `next.config.ts` avec `allowedDevOrigins`. Si vous utilisez un nouveau domaine ngrok, ajoutez-le à la liste dans `next.config.ts`.

### Variables d'environnement

Pendant que ngrok est actif, votre `.env.local` peut contenir :
```env
APNS_PRODUCTION=false  # Mode sandbox pour les tests
```

## Solution 2 : Cloudflare Tunnel (Gratuit, URL fixe)

### Installation

```bash
# Installer cloudflared
brew install cloudflare/cloudflare/cloudflared  # macOS
# ou télécharger depuis https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
```

### Utilisation

1. **Authentifier** (première fois seulement) :
   ```bash
   cloudflared tunnel login
   ```

2. **Créer un tunnel** :
   ```bash
   cloudflared tunnel create dev-tunnel
   ```

3. **Créer un fichier de configuration** `~/.cloudflared/config.yml` :
   ```yaml
   tunnel: <tunnel-id>
   credentials-file: ~/.cloudflared/<tunnel-id>.json

   ingress:
     - hostname: dev-votre-projet.youraccount.workers.dev
       service: http://localhost:3000
     - service: http_status:404
   ```

4. **Lancer le tunnel** :
   ```bash
   cloudflared tunnel run dev-tunnel
   ```

5. **Utiliser l'URL** : `https://dev-votre-projet.youraccount.workers.dev`

## Solution 3 : Vercel Preview Deploy (Recommandé pour CI/CD)

### Configuration

1. **Créer une branch de développement** :
   ```bash
   git checkout -b dev
   git push origin dev
   ```

2. **Vercel crée automatiquement une preview URL** :
   - Format : `https://live-admin-git-dev-votre-username.vercel.app`
   - L'URL est fixe pour cette branch

3. **Configurer les variables d'environnement sur Vercel** :
   - Aller dans **Project Settings > Environment Variables**
   - Ajouter `APNS_PRODUCTION=false` pour la branch `dev`
   - Ajouter toutes les autres variables nécessaires

### Variables d'environnement sur Vercel

Pour la branch `dev` :
```env
APNS_PRODUCTION=false
APNS_KEY_CONTENT="votre-clé.p8"
APNS_KEY_ID=...
APNS_TEAM_ID=...
APNS_BUNDLE_ID=com.lazbutton.live
```

## Solution 4 : localtunnel (Alternative gratuite)

### Installation

```bash
npm install -g localtunnel
```

### Utilisation

1. **Démarrer votre serveur** :
   ```bash
   npm run dev
   ```

2. **Créer un tunnel** :
   ```bash
   lt --port 3000 --subdomain votre-nom-unique
   ```

3. **Utiliser l'URL** : `https://votre-nom-unique.loca.lt`

## Recommandation

- **Pour tests rapides** : Utilisez **ngrok** (Solution 1)
- **Pour URL fixe gratuite** : Utilisez **Cloudflare Tunnel** (Solution 2)
- **Pour environnement de dev persistant** : Utilisez **Vercel Preview** (Solution 3)

## Important pour les notifications

⚠️ **Assurez-vous que `APNS_PRODUCTION=false`** dans vos variables d'environnement quand vous testez avec des builds Debug/Development de votre application mobile. Les tokens générés en mode Debug ne fonctionnent qu'avec le serveur sandbox d'APNs.

### Vérification

Vous pouvez vérifier le mode dans les logs :
```
✅ Provider APNs initialisé en mode: SANDBOX (Development)
```

ou

```
✅ Provider APNs initialisé en mode: PRODUCTION
```

