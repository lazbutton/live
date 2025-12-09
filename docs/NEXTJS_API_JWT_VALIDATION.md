# Configuration API Next.js pour valider les JWT Supabase

## ⚠️ Problème actuel

L'application mobile essaie d'appeler `/api/notifications/send-test` mais reçoit une erreur **405 (Method Not Allowed)**.

Cela signifie que :
- L'endpoint `/api/notifications/send-test` n'existe pas encore dans votre API Next.js
- OU l'endpoint existe mais n'accepte pas la méthode POST

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

    // Préparer les messages pour chaque token
    const messages: admin.messaging.Message[] = tokens.map((tokenData) => {
      const message: admin.messaging.Message = {
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
      };
      return message;
    });

    // Envoyer les notifications
    const batchResponse = await admin.messaging().sendAll(messages);

    const totalSent = batchResponse.responses.filter((r) => r.success).length;
    const totalFailed = batchResponse.responses.filter((r) => !r.success).length;

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
```

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

## Dépannage

Si vous avez toujours l'erreur "Session expirée" :

1. **Vérifiez les logs Next.js** pour voir l'erreur exacte
2. **Vérifiez que le token JWT est bien reçu** dans les logs
3. **Vérifiez que `NEXT_PUBLIC_SUPABASE_ANON_KEY` est correct**
4. **Vérifiez que le token n'est pas vraiment expiré** (les tokens Supabase expirent après 1 heure)

