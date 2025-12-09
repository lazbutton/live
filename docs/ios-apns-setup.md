# Configuration APNs pour iOS (2025)

## Vue d'ensemble

Sur iOS, l'application utilise **APNs (Apple Push Notification Service) directement** via `flutter_local_notifications`, sans passer par Firebase. Cette approche moderne (2025) simplifie la configuration et évite les erreurs d'initialisation Firebase sur iOS.

## Architecture (2025)

- **iOS** : APNs directement via `flutter_local_notifications` (pas de Firebase)
- **Android** : Firebase Cloud Messaging (FCM)
- **Avantages** : Configuration plus simple, moins de dépendances, meilleures performances

## Configuration iOS

### 1. Activer Push Notifications dans Xcode

1. Ouvrez `ios/Runner.xcworkspace` dans Xcode
2. Sélectionnez le target "Runner"
3. Onglet **"Signing & Capabilities"**
4. Cliquez sur **"+ Capability"**
5. Ajoutez **"Push Notifications"**
6. Ajoutez **"Background Modes"** et cochez **"Remote notifications"**

### 2. Générer un Certificate Signing Request (CSR)

Pour créer un certificat APNs, vous devez d'abord générer un CSR depuis votre Mac :

#### Méthode 1 : Utiliser l'application Accès au trousseau (Keychain Access)

1. **Ouvrez l'application "Accès au trousseau"** (Keychain Access)
   - Cherchez "Accès au trousseau" dans Spotlight (⌘ + Espace)
   - Ou allez dans Applications > Utilitaires > Accès au trousseau

2. **Créer le CSR** :
   - Dans le menu : **Accès au trousseau** > **Assistant Certificat** > **Demander un certificat à une autorité de certification...**
   - **Note** : Si vous ne voyez pas ce menu, essayez :
     - **Keychain Access** > **Certificate Assistant** > **Request a Certificate From a Certificate Authority...** (version anglaise)
     - Ou utilisez directement le raccourci : **⌥⌘K** (Option + Commande + K)
   - **Alternative** : Menu **Édition** > **Créer un certificat...** (si disponible)

3. **Remplir le formulaire** :
   - **Adresse électronique de l'utilisateur** : Votre email Apple Developer
   - **Nom commun** : Votre nom ou le nom de votre organisation
   - **CA (Autorité de certification)** : Laissez vide
   - **Cocher** : "Enregistré sur le disque" ou "Saved to disk"
   - Cliquez sur **Continuer** ou **Continue**

4. **Enregistrer le fichier** :
   - Choisissez un emplacement (par exemple : Bureau ou Documents)
   - Nommez le fichier (par exemple : `CertificateSigningRequest.certSigningRequest`)
   - Cliquez sur **Enregistrer** ou **Save**

5. **Le fichier CSR est maintenant prêt** à être téléchargé sur Apple Developer Portal

**⚠️ Si vous ne trouvez pas l'option dans le menu** :
- Utilisez plutôt la **Méthode 2** (Terminal) qui fonctionne de la même manière sur tous les systèmes
- Ou utilisez directement la **Méthode Push Notification Key** (section 5) qui ne nécessite pas de CSR

#### Méthode 2 : Utiliser la ligne de commande (Terminal) - Recommandé si la Méthode 1 ne fonctionne pas ⭐

**Cette méthode fonctionne sur tous les systèmes et toutes les langues** - Utilisez-la si vous ne trouvez pas l'option dans Accès au trousseau :

```bash
# Créer un CSR avec OpenSSL
openssl req -new -newkey rsa:2048 -nodes \
  -keyout APNsAuthKey.key \
  -out CertificateSigningRequest.certSigningRequest \
  -subj "/emailAddress=votre-email@example.com/CN=Votre Nom/O=Votre Organisation"
```

**Note** : Cette méthode crée aussi une clé privée. Gardez-la en sécurité !

### 3. Créer le certificat APNs sur Apple Developer Portal

1. Allez sur [Apple Developer Portal](https://developer.apple.com/account/)
2. Connectez-vous avec votre compte Apple Developer
3. Allez dans **Certificates, Identifiers & Profiles**
4. Cliquez sur **Certificates** > **+** (bouton plus)
5. Sélectionnez **Apple Push Notification service SSL (Sandbox & Production)**
6. Sélectionnez votre **App ID** (ex: `com.lazbutton.live`)
7. **Téléchargez votre CSR** :
   - Cliquez sur **Choisir un fichier**
   - Sélectionnez le fichier `.certSigningRequest` que vous avez créé
8. Cliquez sur **Continuer** puis **Télécharger**
9. **Téléchargez le certificat** (fichier `.cer`)

### 4. Convertir le certificat en format utilisable

Le certificat téléchargé (`.cer`) doit être converti en format `.p12` ou `.pem` pour être utilisé avec votre backend :

#### Option A : Utiliser Accès au trousseau (recommandé)

1. **Double-cliquez** sur le fichier `.cer` téléchargé
   - Il s'ouvrira dans Accès au trousseau
   - Le certificat sera ajouté à votre trousseau

2. **Exporter en .p12** :
   - Dans Accès au trousseau, trouvez votre certificat APNs
   - **Sélectionnez-le** et faites un clic droit > **Exporter**
   - Choisissez le format **Personal Information Exchange (.p12)**
   - Entrez un **mot de passe** (notez-le, vous en aurez besoin)
   - Enregistrez le fichier (ex: `APNs_Certificate.p12`)

#### Option B : Utiliser la ligne de commande

```bash
# Convertir .cer en .pem
openssl x509 -inform DER -in aps_development.cer -out aps_development.pem

# Si vous avez aussi la clé privée, créez un fichier .p12
openssl pkcs12 -export \
  -out APNs_Certificate.p12 \
  -inkey APNsAuthKey.key \
  -in aps_development.pem \
  -name "APNs Certificate"
```

### 5. Utiliser une Push Notification Key (Recommandé en 2025) ⭐

**C'est la méthode recommandée en 2025** - Plus simple, plus moderne, et plus flexible :

**🎯 Si vous ne trouvez pas l'option dans Accès au trousseau, utilisez cette méthode !**

**Avantages** :
- ✅ **Pas besoin de CSR** - Vous pouvez **SAUTER complètement les étapes 2-4** !
- ✅ Pas besoin d'Accès au trousseau
- ✅ Fonctionne sur tous les systèmes
- ✅ Plus simple à gérer
- ✅ Pas de problèmes de langue d'interface

**Étapes** :

1. Allez sur [Apple Developer Portal](https://developer.apple.com/account/)
2. Connectez-vous avec votre compte Apple Developer
3. Allez dans **Certificates, Identifiers & Profiles** (ou **Certificats, Identifiants et Profils**)
4. Cliquez sur **Keys** (ou **Clés**) dans le menu de gauche
5. Cliquez sur **+** (bouton plus) en haut à droite
6. Donnez un nom à votre clé (ex: "APNs Key 2025")
7. Cochez **Apple Push Notifications service (APNs)**
8. Cliquez sur **Continue** (ou **Continuer**) puis **Register** (ou **Enregistrer**)
9. **Téléchargez la clé** (fichier `.p8`) - ⚠️ **Vous ne pourrez la télécharger qu'une seule fois !**
   - **Important** : Sauvegardez ce fichier dans un endroit sûr (1Password, Bitwarden, etc.)
   - Le fichier sera nommé quelque chose comme `AuthKey_XXXXXXXXXX.p8`
10. Notez le **Key ID** affiché (ex: `ABC123DEF4`) - vous en aurez besoin plus tard

**Avantages de la Push Notification Key (2025)** :
- ✅ Plus simple à gérer (pas besoin de CSR)
- ✅ Fonctionne pour tous vos App IDs (pas besoin d'un certificat par app)
- ✅ Pas d'expiration (contrairement aux certificats qui expirent)
- ✅ Méthode recommandée par Apple depuis 2016
- ✅ Supporte à la fois Sandbox et Production
- ✅ Plus sécurisé (token-based authentication)

### 6. Configuration pour l'envoi depuis Next.js (2025)

Pour envoyer des notifications APNs depuis votre backend Next.js, vous avez plusieurs options modernes :

#### Option A : Utiliser directement APNs avec `node-apn` (Recommandé en 2025) ⭐

**C'est la méthode la plus directe et la plus performante en 2025** :

```bash
npm install apn
```

**Avantages** :
- ✅ Contrôle total sur l'envoi
- ✅ Pas de dépendance à un service tiers
- ✅ Gratuit et illimité
- ✅ Meilleures performances
- ✅ Supporte toutes les fonctionnalités APNs

#### Option B : Utiliser un service tiers (Alternative)

Si vous préférez une solution gérée, utilisez un service comme :
- **OneSignal** (gratuit jusqu'à 10k notifications/mois, puis payant)
- **Pusher Beams** (payant)
- **Firebase Cloud Messaging** (gratuit, mais nécessite Firebase)
- **Expo Push Notifications** (gratuit pour Expo)

**Quand utiliser un service tiers** :
- Si vous voulez une solution "plug-and-play"
- Si vous avez besoin d'analytics avancées
- Si vous gérez plusieurs plateformes (iOS + Android + Web)

```bash
npm install apn
```

**Exemple d'envoi avec Push Notification Key (.p8) - 2025** :
```typescript
import apn from 'apn';
import fs from 'fs';
import path from 'path';

// Configuration du provider APNs (2025)
const apnProvider = new apn.Provider({
  token: {
    key: fs.readFileSync(path.resolve(process.env.APNS_KEY_PATH!)),
    keyId: process.env.APNS_KEY_ID!,
    teamId: process.env.APNS_TEAM_ID!,
  },
  production: process.env.NODE_ENV === 'production', // true pour production, false pour sandbox
});

// Fonction pour envoyer une notification
async function sendAPNsNotification(
  deviceToken: string,
  title: string,
  body: string,
  data?: Record<string, any>
) {
  const notification = new apn.Notification();
  
  // Configuration de base (2025)
  notification.alert = {
    title: title,
    body: body,
  };
  notification.topic = process.env.APNS_BUNDLE_ID!; // com.lazbutton.live
  notification.badge = 1;
  notification.sound = 'default';
  
  // Données personnalisées (pour la navigation dans l'app)
  if (data) {
    notification.payload = data;
  }
  
  // Options modernes (2025)
  notification.pushType = 'alert'; // 'alert' ou 'background'
  notification.priority = 10; // 10 = high priority, 5 = low priority
  notification.expiry = Math.floor(Date.now() / 1000) + 3600; // Expire dans 1 heure
  
  // Envoyer la notification
  try {
    const result = await apnProvider.send(notification, deviceToken);
    
    if (result.sent.length > 0) {
      console.log('✅ Notification envoyée avec succès');
    }
    
    if (result.failed.length > 0) {
      console.error('❌ Échecs:', result.failed);
      // Gérer les erreurs (token invalide, etc.)
      result.failed.forEach((failure) => {
        if (failure.error) {
          console.error(`Erreur: ${failure.error.reason}`);
        }
      });
    }
    
    return result;
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi:', error);
    throw error;
  }
}

// Exemple d'utilisation
await sendAPNsNotification(
  'device_token_here',
  'Nouvel événement disponible',
  'Un nouvel événement correspond à vos préférences',
  { event_id: '123', type: 'event' }
);
```

**Exemple d'envoi avec certificat (.p12) - Méthode legacy** :
```typescript
import apn from 'apn';
import fs from 'fs';
import path from 'path';

// ⚠️ Note : Cette méthode est legacy. Utilisez plutôt Push Notification Key (.p8)
// Lire le certificat .p12
const p12Buffer = fs.readFileSync(path.resolve(process.env.APNS_CERT_PATH!));
const p12Password = process.env.APNS_CERT_PASSWORD || '';

const apnProvider = new apn.Provider({
  pfx: p12Buffer,
  passphrase: p12Password,
  production: process.env.NODE_ENV === 'production',
});

// Même code d'envoi que ci-dessus
```

## Variables d'environnement Next.js (2025)

**Pour Push Notification Key (.p8) - Recommandé en 2025** ⭐ :
```env
# APNs Configuration (Push Notification Key) - 2025
APNS_KEY_PATH=./secrets/AuthKey_XXXXXXXXXX.p8
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=XXXXXXXXXX
APNS_BUNDLE_ID=com.lazbutton.live

# Environnement
NODE_ENV=production  # ou 'development' pour sandbox
```

**Pour certificat (.p12) - Legacy** :
```env
# APNs Configuration (Certificat) - Legacy (non recommandé)
APNS_CERT_PATH=./secrets/APNs_Certificate.p12
APNS_CERT_PASSWORD=votre-mot-de-passe
APNS_BUNDLE_ID=com.lazbutton.live
NODE_ENV=production
```

**⚠️ Sécurité (2025)** :
- Ne commitez JAMAIS les fichiers `.p8` ou `.p12` dans Git
- Utilisez un gestionnaire de secrets (Vercel Secrets, AWS Secrets Manager, etc.)
- Stockez les fichiers dans un dossier `secrets/` et ajoutez-le à `.gitignore`

## Trouver votre Team ID

Pour trouver votre **Team ID** :
1. Allez sur [Apple Developer Portal](https://developer.apple.com/account/)
2. Cliquez sur votre nom en haut à droite
3. Votre **Team ID** est affiché (ex: `ABC123DEF4`)

## Comment ça fonctionne (2025)

1. **Sur iOS** : L'app demande les permissions via `flutter_local_notifications`
2. **Token APNs** : Le système iOS génère automatiquement un token APNs unique par appareil
3. **Stockage** : Le token est stocké dans `user_push_tokens` avec `platform: 'ios'`
4. **Envoi** : Votre backend Next.js envoie les notifications via APNs en utilisant :
   - Le token de l'appareil (stocké en base de données)
   - La Push Notification Key (.p8) pour s'authentifier auprès d'Apple
5. **Réception** : iOS reçoit la notification et l'affiche à l'utilisateur

## Avantages (2025)

- ✅ Pas besoin de Firebase sur iOS (configuration plus simple)
- ✅ Pas d'erreurs d'initialisation Firebase
- ✅ Utilise directement les services Apple (meilleures performances)
- ✅ Push Notification Key : plus moderne et flexible que les certificats
- ✅ Supporte les notifications silencieuses (background)
- ✅ Supporte les notifications riches (images, actions)

## Notes importantes (2025)

- **Token APNs** : Géré automatiquement par iOS, change si l'app est réinstallée
- **Push Notification Key** : Ne peut être téléchargée qu'une seule fois - sauvegardez-la !
- **Sandbox vs Production** : Utilisez `production: false` pour le développement, `true` pour la production
- **Limites** : APNs peut envoyer jusqu'à 500 notifications/seconde par connexion
- **Sécurité** : Les tokens APNs sont spécifiques à l'app et à l'appareil
- **Notifications locales** : Fonctionnent même sans configuration APNs (pour les notifications programmées)

## Dépannage (2025)

### Erreur : "Invalid token"
- Le token a peut-être expiré ou l'app a été réinstallée
- Solution : Récupérer un nouveau token depuis l'app et le mettre à jour en base

### Erreur : "BadDeviceToken"
- Le token n'est pas valide pour cet environnement (sandbox vs production)
- Solution : Vérifier que `production` correspond à l'environnement du token

### Erreur : "TopicDisallowed"
- Le Bundle ID ne correspond pas
- Solution : Vérifier que `APNS_BUNDLE_ID` correspond au Bundle ID de l'app

### Notifications non reçues
1. Vérifier que les permissions sont accordées dans les paramètres iOS
2. Vérifier que le token est correctement stocké en base de données
3. Vérifier les logs du serveur pour les erreurs APNs
4. Tester avec un outil comme [Pusher](https://github.com/noodlewerk/NWPusher) ou [Knuff](https://github.com/KnuffApp/Knuff)

