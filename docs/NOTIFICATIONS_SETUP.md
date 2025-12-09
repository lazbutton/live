# Configuration des Notifications Push

Ce document explique comment configurer et utiliser le système de notifications push pour iOS (APNs) et Android (FCM).

## Architecture

- **iOS** : APNs directement via `node-apn` (pas de Firebase)
- **Android** : Firebase Cloud Messaging (FCM)
- **Base de données** : Tables `user_push_tokens` et `notification_logs` dans Supabase

## Configuration

### 1. Variables d'environnement

Ajoutez les variables suivantes dans votre fichier `.env.local` :

#### Pour iOS (APNs) - Push Notification Key (.p8) - Recommandé en 2025

```env
# APNs Configuration
APNS_KEY_PATH=./secrets/AuthKey_XXXXXXXXXX.p8
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=XXXXXXXXXX
APNS_BUNDLE_ID=com.lazbutton.live

# Environnement
NODE_ENV=production  # ou 'development' pour sandbox
```

**Comment obtenir ces valeurs** :
1. Suivez le guide dans `docs/ios-apns-setup.md`
2. Créez une Push Notification Key sur [Apple Developer Portal](https://developer.apple.com/account/)
3. Téléchargez le fichier `.p8` et placez-le dans le dossier `secrets/`
4. Notez le Key ID et votre Team ID

#### Pour Android (FCM)

**Option 1 : Fichier service account JSON**

```env
FCM_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json
```

**Option 2 : JSON directement dans la variable d'environnement** (pour Vercel, etc.)

```env
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

**Comment obtenir le service account** :
1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionnez votre projet
3. Allez dans **Paramètres** > **Comptes de service**
4. Cliquez sur **Générer une nouvelle clé privée**
5. Téléchargez le fichier JSON et placez-le dans `secrets/`

#### Supabase Service Role Key

```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Cette clé est nécessaire pour que le backend puisse :
- Lire les tokens des utilisateurs
- Logger les notifications envoyées

⚠️ **Important** : Ne jamais exposer cette clé côté client !

### 2. Structure des dossiers

Créez un dossier `secrets/` à la racine du projet :

```
live-admin/
├── secrets/
│   ├── AuthKey_XXXXXXXXXX.p8  # Clé APNs (iOS)
│   └── firebase-service-account.json  # Service account FCM (Android)
├── .env.local
└── ...
```

Ajoutez `secrets/` à `.gitignore` (déjà fait).

## Utilisation

### Enregistrer un token push (depuis l'app mobile)

**Endpoint** : `POST /api/notifications/register-token`

**Headers** :
```
Authorization: Bearer <user_jwt_token>
```

**Body** :
```json
{
  "token": "device_push_token_here",
  "platform": "ios",  // ou "android" ou "web"
  "deviceId": "optional_device_id",
  "appVersion": "1.0.0"
}
```

**Réponse** :
```json
{
  "success": true,
  "message": "Token enregistré"
}
```

### Envoyer une notification (admin uniquement)

**Endpoint** : `POST /api/notifications/send`

**Headers** :
```
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json
```

**Body** :

**À un utilisateur spécifique** :
```json
{
  "userId": "user-uuid-here",
  "title": "Nouvel événement disponible",
  "body": "Un nouvel événement correspond à vos préférences",
  "data": {
    "event_id": "event-uuid-here",
    "type": "event"
  }
}
```

**À plusieurs utilisateurs** :
```json
{
  "userIds": ["user-uuid-1", "user-uuid-2"],
  "title": "Nouvel événement disponible",
  "body": "Un nouvel événement correspond à vos préférences",
  "data": {
    "event_ids": ["event-uuid-1", "event-uuid-2"],
    "type": "event"
  }
}
```

**À tous les utilisateurs** :
```json
{
  "title": "Nouvel événement disponible",
  "body": "Un nouvel événement correspond à vos préférences",
  "data": {
    "type": "announcement"
  }
}
```

**Réponse** :
```json
{
  "success": true,
  "sent": 5,
  "failed": 0,
  "errors": []
}
```

### Supprimer un token (depuis l'app mobile)

**Endpoint** : `DELETE /api/notifications/register-token`

**Headers** :
```
Authorization: Bearer <user_jwt_token>
```

**Body** :
```json
{
  "token": "device_push_token_here"
}
```

## Utilisation dans le code

### Envoyer une notification depuis le backend

```typescript
import { sendNotificationToUser, sendNotificationToUsers } from "@/lib/notifications";

// À un utilisateur
const result = await sendNotificationToUser(userId, {
  title: "Nouvel événement",
  body: "Un nouvel événement est disponible",
  data: {
    event_id: "123",
    type: "event"
  }
});

// À plusieurs utilisateurs
const result = await sendNotificationToUsers([userId1, userId2], {
  title: "Nouvel événement",
  body: "Un nouvel événement est disponible",
  data: {
    event_ids: ["123", "456"],
    type: "event"
  }
});
```

## Gestion automatique des tokens invalides

Le système détecte automatiquement les tokens invalides et les supprime de la base de données. Les erreurs suivantes déclenchent la suppression :

- **iOS** : `BadDeviceToken`, `Unregistered`
- **Android** : `messaging/invalid-registration-token`, `messaging/registration-token-not-registered`

## Logs des notifications

Toutes les notifications envoyées avec succès sont automatiquement loggées dans la table `notification_logs` avec :
- `user_id` : ID de l'utilisateur
- `title` : Titre de la notification
- `body` : Corps de la notification
- `event_ids` : Tableau des IDs des événements concernés (si applicable)
- `sent_at` : Date et heure d'envoi

## Dépannage

### iOS - Erreur "Provider APNs non initialisé"

1. Vérifiez que toutes les variables d'environnement APNs sont définies
2. Vérifiez que le fichier `.p8` existe et est lisible
3. Vérifiez que le Key ID et Team ID sont corrects

### iOS - Erreur "BadDeviceToken"

- Le token est invalide ou a expiré
- L'app a peut-être été réinstallée
- Solution : L'app doit réenregistrer son token

### Android - Erreur "Firebase Admin SDK non initialisé"

1. Vérifiez que `FCM_SERVICE_ACCOUNT_PATH` ou `FCM_SERVICE_ACCOUNT_JSON` est défini
2. Vérifiez que le fichier JSON existe et est valide
3. Vérifiez que le service account a les permissions nécessaires

### Notifications non reçues

1. Vérifiez que les permissions sont accordées dans les paramètres de l'appareil
2. Vérifiez que le token est correctement stocké en base de données
3. Vérifiez les logs du serveur pour les erreurs
4. Pour iOS : Vérifiez que `NODE_ENV` correspond à l'environnement (sandbox vs production)

## Sécurité

- ⚠️ Ne jamais commiter les fichiers `.p8`, `.p12` ou `firebase-service-account.json` dans Git
- ⚠️ Ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY` côté client
- ⚠️ Utiliser un gestionnaire de secrets (Vercel Secrets, AWS Secrets Manager, etc.) en production
- ⚠️ Les notifications ne peuvent être envoyées que par des admins authentifiés

## Documentation complémentaire

- **iOS** : Voir `docs/ios-apns-setup.md` pour la configuration complète APNs
- **Base de données** : Voir les migrations `047_create_notification_logs.sql` et `048_create_push_tokens_table.sql`


