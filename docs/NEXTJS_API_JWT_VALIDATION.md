# Configuration API Next.js pour valider les JWT Supabase

## ⚠️ Problèmes courants

### Problème 1 : Erreur 405 (Method Not Allowed)
L'endpoint `/api/notifications/send-test` n'existe pas ou n'accepte pas POST.

### Problème 2 : Erreur 500 "Provider APNs non initialisé" ✅ ACTUEL
L'endpoint existe et fonctionne, mais le provider APNs n'est pas configuré dans Firebase Admin ou via node-apn.

## Solution : Créer l'endpoint `/api/notifications/send-test`

L'application mobile envoie des notifications de test en utilisant le token JWT Supabase dans le header `Authorization: Bearer <token>`. Vous devez créer un endpoint qui :

1. Valide correctement les tokens JWT Supabase
2. Accepte les requêtes POST
3. Envoie les notifications via Firebase/APNs

## Solution : Créer un endpoint qui accepte les JWT

Créez un endpoint `/api/notifications/send-test` dans votre projet Next.js qui accepte les tokens JWT Supabase :

### Fichier : `app/api/notifications/send-test/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';

// Initialiser Firebase Admin (une seule fois)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    console.log('✅ Firebase Admin initialisé');
  } catch (error) {
    console.error('❌ Erreur initialisation Firebase Admin:', error);
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: NextRequest) {
  try {
    // Récupérer le token JWT depuis le header Authorization
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Token d\'authentification manquant' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Créer un client Supabase pour valider le token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // Valider le token en récupérant l'utilisateur
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('❌ Erreur validation token:', authError);
      return NextResponse.json(
        { error: 'Token invalide ou expiré', details: authError?.message },
        { status: 401 }
      );
    }

    console.log('✅ Utilisateur authentifié:', user.id, user.email);

    // Récupérer le body de la requête
    const body = await request.json();
    const { title, body: messageBody, test } = body;

    if (!title || !messageBody) {
      return NextResponse.json(
        { error: 'title et body sont requis' },
        { status: 400 }
      );
    }

    // Récupérer les tokens push de l'utilisateur connecté
    const { data: tokens, error: tokensError } = await supabase
      .from('user_push_tokens')
      .select('token, platform')
      .eq('user_id', user.id);

    if (tokensError) {
      console.error('Erreur récupération tokens:', tokensError);
      return NextResponse.json(
        { error: 'Erreur lors de la récupération des tokens' },
        { status: 500 }
      );
    }

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({
        error: 'Aucun token push trouvé pour cet utilisateur',
        sent: 0,
      });
    }

    // Séparer les tokens par plateforme
    const androidTokens = tokens.filter((t) => t.platform === 'android');
    const iosTokens = tokens.filter((t) => t.platform === 'ios');

    let totalSent = 0;
    let totalFailed = 0;

    // Envoyer les notifications Android via Firebase
    if (androidTokens.length > 0) {
      const androidMessages: admin.messaging.Message[] = androidTokens.map((tokenData) => ({
        token: tokenData.token,
        notification: {
          title: title,
          body: messageBody,
        },
        data: test ? { test: 'true' } : {},
        android: {
          priority: 'high' as const,
          notification: {
            channelId: 'push_notifications',
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
      }));

      try {
        const androidResponse = await admin.messaging().sendAll(androidMessages);
        totalSent += androidResponse.responses.filter((r) => r.success).length;
        totalFailed += androidResponse.responses.filter((r) => !r.success).length;
      } catch (error) {
        console.error('❌ Erreur envoi Android:', error);
        totalFailed += androidTokens.length;
      }
    }

    // Envoyer les notifications iOS via APNs
    if (iosTokens.length > 0) {
      // Filtrer les vrais tokens APNs (ignorer les identifiants "ios_user_")
      const realIosTokens = iosTokens.filter(
        (t) => !t.token.startsWith('ios_user_')
      );

      if (realIosTokens.length === 0) {
        console.warn(
          '⚠️ Aucun vrai token APNs trouvé. ' +
          'Les tokens iOS sont au format "ios_user_${userId}" (identifiants, pas de vrais tokens APNs). ' +
          'Vous devez obtenir les vrais tokens APNs depuis l\'app mobile.'
        );
        return NextResponse.json({
          success: false,
          error:
            'Aucun token APNs valide trouvé. ' +
            'Les tokens iOS enregistrés sont des identifiants, pas de vrais tokens APNs. ' +
            'Voir la documentation pour obtenir les vrais tokens APNs.',
          sent: totalSent,
          failed: iosTokens.length,
        });
      }

      // Option 1 : Utiliser Firebase Admin (si APNs est configuré dans Firebase)
      // Option 2 : Utiliser node-apn directement (recommandé pour iOS)
      
      // Pour l'instant, utiliser Firebase Admin avec configuration APNs
      const iosMessages: admin.messaging.Message[] = realIosTokens.map((tokenData) => ({
        token: tokenData.token,
        notification: {
          title: title,
          body: messageBody,
        },
        data: test ? { test: 'true' } : {},
        apns: {
          payload: {
            aps: {
              alert: {
                title: title,
                body: messageBody,
              },
              sound: 'default',
              badge: 1,
              'content-available': 1,
            },
          },
          headers: {
            'apns-priority': '10',
          },
        },
      }));

      try {
        const iosResponse = await admin.messaging().sendAll(iosMessages);
        totalSent += iosResponse.responses.filter((r) => r.success).length;
        totalFailed += iosResponse.responses.filter((r) => !r.success).length;
        
        // Logger les erreurs détaillées
        iosResponse.responses.forEach((response, index) => {
          if (!response.success) {
            console.error(
              `❌ Échec envoi iOS token ${index}:`,
              response.error
            );
          }
        });
      } catch (error: any) {
        console.error('❌ Erreur envoi iOS:', error);
        // Si c'est une erreur d'APNs non initialisé, donner un message plus clair
        if (
          error.message?.includes('APNs') ||
          error.message?.includes('apns') ||
          error.message?.includes('APNS')
        ) {
          throw new Error(
            'Provider APNs non initialisé. ' +
            'Vérifiez que Firebase Admin est configuré avec les certificats APNs dans Firebase Console, ' +
            'ou utilisez node-apn directement pour iOS. ' +
            'Voir la section "Solution" ci-dessus pour plus d\'informations.'
          );
        }
        totalFailed += realIosTokens.length;
      }
    }

    console.log(`✅ Notifications envoyées: ${totalSent} réussies, ${totalFailed} échouées`);

    return NextResponse.json({
      success: true,
      message: 'Notification de test envoyée',
      sent: totalSent,
      failed: totalFailed,
    });
  } catch (error: any) {
    console.error('❌ Erreur lors de l\'envoi de la notification:', error);
    return NextResponse.json(
      { error: error.message || 'Erreur serveur', details: error.toString() },
      { status: 500 }
    );
  }
}
```

## Alternative : Modifier l'endpoint existant

Si vous préférez modifier l'endpoint `/api/notifications/send` existant pour accepter les JWT, ajoutez cette logique :

```typescript
export async function POST(request: NextRequest) {
  try {
    // Vérifier si c'est une requête avec JWT ou avec clé API
    const authHeader = request.headers.get('authorization');
    const apiKey = request.headers.get('x-api-key');

    let userId: string;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Mode JWT (depuis l'app mobile)
      const token = authHeader.replace('Bearer ', '');
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        return NextResponse.json(
          { error: 'Token invalide ou expiré' },
          { status: 401 }
        );
      }
      
      userId = user.id;
    } else if (apiKey === process.env.CRON_API_KEY) {
      // Mode clé API (depuis le cron)
      const body = await request.json();
      userId = body.userId;
      
      if (!userId) {
        return NextResponse.json(
          { error: 'userId requis' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Authentification requise' },
        { status: 401 }
      );
    }

    // ... reste du code pour envoyer les notifications
  } catch (error) {
    // ...
  }
}
```

## Variables d'environnement requises

Assurez-vous d'avoir dans votre `.env.local` Next.js :

```env
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre-clé-anon

# Firebase Admin (pour Android et optionnellement iOS)
FIREBASE_PROJECT_ID=votre-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

# APNs pour iOS (si vous utilisez node-apn au lieu de Firebase)
APNS_KEY_PATH=./path/to/AuthKey_XXXXXXXXXX.p8
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=XXXXXXXXXX
APNS_BUNDLE_ID=com.lazbutton.live
```

## ⚠️ Problème : "Provider APNs non initialisé"

Si vous recevez l'erreur **"Provider APNs non initialisé"**, c'est que Firebase Admin n'a pas les certificats APNs configurés pour iOS.

### Solution 1 : Configurer APNs dans Firebase (Recommandé)

1. Allez dans [Firebase Console](https://console.firebase.google.com/)
2. Sélectionnez votre projet
3. Allez dans **Project Settings** > **Cloud Messaging**
4. Dans la section **Apple app configuration**, téléchargez votre clé APNs (.p8)
5. Ajoutez votre **Key ID** et **Team ID**

Firebase Admin utilisera automatiquement ces certificats pour envoyer des notifications iOS.

### Solution 2 : Utiliser node-apn directement (Alternative)

Si vous préférez ne pas utiliser Firebase pour iOS, installez `node-apn` :

```bash
npm install apn
```

Puis modifiez votre endpoint pour utiliser `node-apn` pour iOS :

```typescript
import apn from 'apn';

// Initialiser le provider APNs (une seule fois, en dehors de la fonction)
let apnProvider: apn.Provider | null = null;

function getApnProvider() {
  if (!apnProvider) {
    apnProvider = new apn.Provider({
      token: {
        key: process.env.APNS_KEY_PATH!,
        keyId: process.env.APNS_KEY_ID!,
        teamId: process.env.APNS_TEAM_ID!,
      },
      production: process.env.NODE_ENV === 'production',
    });
  }
  return apnProvider;
}

// Dans votre endpoint, pour les tokens iOS :
if (iosTokens.length > 0) {
  const provider = getApnProvider();
  
  for (const tokenData of iosTokens) {
    // Ignorer les tokens qui commencent par "ios_user_" (identifiants, pas de vrais tokens)
    if (tokenData.token.startsWith('ios_user_')) {
      console.warn(`⚠️ Token iOS invalide (identifiant): ${tokenData.token}`);
      continue;
    }
    
    const notification = new apn.Notification();
    notification.alert = {
      title: title,
      body: messageBody,
    };
    notification.topic = process.env.APNS_BUNDLE_ID || 'com.lazbutton.live';
    notification.badge = 1;
    notification.sound = 'default';
    
    try {
      const result = await provider.send(notification, tokenData.token);
      if (result.sent.length > 0) {
        totalSent++;
      } else {
        totalFailed++;
        console.error('❌ Échec envoi iOS:', result.failed);
      }
    } catch (error) {
      console.error('❌ Erreur envoi iOS:', error);
      totalFailed++;
    }
  }
}
```

### Solution 3 : Utiliser un service tiers (OneSignal, Pusher, etc.)

Pour simplifier, vous pouvez utiliser un service tiers qui gère APNs automatiquement :
- **OneSignal** (gratuit jusqu'à 10k notifications/mois)
- **Pusher Beams**
- **Expo Push Notifications**

## Test

Pour tester depuis l'app mobile, l'endpoint sera appelé automatiquement avec :
- **URL**: `https://www.live-orleans.fr/api/notifications/send-test`
- **Méthode**: `POST`
- **Header**: `Authorization: Bearer <jwt_token>`
- **Header**: `Content-Type: application/json`
- **Body**: 
  ```json
  {
    "title": "Notification de test",
    "body": "Ceci est une notification de test...",
    "test": true
  }
  ```

## Comportement de l'application mobile

L'application essaie d'abord `/api/notifications/send-test`. Si cet endpoint retourne 404 ou 405, elle essaie automatiquement `/api/notifications/send` (mais celui-ci nécessite une clé API, donc cela échouera probablement).

**Recommandation** : Créez l'endpoint `/api/notifications/send-test` pour que les notifications de test fonctionnent depuis l'app mobile.

## ⚠️ Note importante : Format des tokens iOS

L'application mobile enregistre actuellement des tokens iOS au format `ios_user_${userId}` au lieu de vrais tokens APNs. Cela signifie que :

1. **Le token stocké n'est pas un vrai token APNs** - c'est un identifiant utilisateur
2. **Votre API doit récupérer le vrai token APNs** depuis une autre source, ou
3. **Vous devez modifier l'app mobile** pour obtenir et enregistrer le vrai token APNs

### Option A : Modifier l'API pour gérer les identifiants iOS

Si vous gardez le format `ios_user_${userId}`, votre API doit :
- Détecter ce format
- Extraire l'ID utilisateur
- Récupérer le vrai token APNs depuis une autre table ou source
- Envoyer la notification avec le vrai token

### Option B : Obtenir le vrai token APNs dans l'app (Recommandé)

Modifiez l'app mobile pour obtenir le vrai token APNs. Sur iOS, vous pouvez utiliser un package comme `flutter_apns` ou obtenir le token via les notifications locales.

## Dépannage

### Erreur "Session expirée"
1. **Vérifiez les logs Next.js** pour voir l'erreur exacte
2. **Vérifiez que le token JWT est bien reçu** dans les logs
3. **Vérifiez que `NEXT_PUBLIC_SUPABASE_ANON_KEY` est correct**
4. **Vérifiez que le token n'est pas vraiment expiré** (les tokens Supabase expirent après 1 heure)

### Erreur "Provider APNs non initialisé"
1. **Vérifiez que Firebase Admin a les certificats APNs configurés** (Solution 1 ci-dessus)
2. **OU installez et configurez `node-apn`** (Solution 2 ci-dessus)
3. **OU utilisez un service tiers** comme OneSignal (Solution 3 ci-dessus)
4. **Vérifiez que les variables d'environnement APNs sont correctes** si vous utilisez node-apn

