# Notifications Push Automatiques pour les Admins - Nouvelles Demandes

> **Obsolète (2026-10-19).** Le trigger pg_net de l'option A n'a jamais rien envoyé (corps `text`,
> pg_net attend du `jsonb`) : il est retiré par
> `supabase/migrations/20261019200000_drop_notify_admins_triggers.sql`. Les admins sont notifiés par
> le code : `/api/user-requests`, et l'app appelle `new-request` quand elle insère la demande
> elle-même. Contrat à jour : `API_APP.md`.

Ce document explique comment configurer les notifications push automatiques pour les admins lorsqu'une nouvelle demande est créée.

## Vue d'ensemble

Lorsqu'un utilisateur crée une nouvelle demande d'événement (via l'app mobile), tous les administrateurs reçoivent automatiquement une notification push sur leur appareil.

## Architecture

1. **Création d'une demande** : Un utilisateur crée une demande via l'app mobile
2. **Déclenchement** : Un webhook Supabase ou un appel direct à l'API
3. **Notification** : L'API envoie une notification push à tous les admins ayant un token enregistré

## Configuration

### Option 1: Database Webhook Supabase (Recommandé)

> 📚 Pour plus de détails sur la configuration générale des webhooks Supabase, consultez [SUPABASE_WEBHOOKS_CONFIG.md](./SUPABASE_WEBHOOKS_CONFIG.md)

1. Allez dans le **Supabase Dashboard** > **Database** > **Webhooks**
2. Cliquez sur **Create a new webhook**
3. Configurez le webhook :
   - **Name** : `notify_admins_new_request`
   - **Table** : `user_requests`
   - **Events** : Cochez `INSERT`
   - **Type** : `HTTP Request`
   - **Method** : `POST`
   - **URL** : `https://votre-domaine.com/api/notifications/admin/new-request`
   - **HTTP Headers** :
     ```
     Content-Type: application/json
     ```
   - **HTTP Request Body** - ⚠️ **IMPORTANT** : Supabase Database Webhooks **n'interpole PAS** les variables `{{ $1.id }}` dans le body JSON. Les variables sont envoyées littéralement.
   
     **Option A : Utiliser un trigger PostgreSQL (Recommandé)** :
     
     Une migration SQL est déjà disponible : `supabase/migrations/20250120000002_trigger_notify_admins_new_request.sql`
     
     Pour l'activer :
     
     1. **Vérifier que l'extension `pg_net` est activée** :
        ```sql
        SELECT * FROM pg_available_extensions WHERE name = 'pg_net';
        CREATE EXTENSION IF NOT EXISTS pg_net;
        ```
     
     2. **Appliquer la migration** :
        - Via Supabase CLI : `supabase migration up`
        - Via Supabase Dashboard : SQL Editor > Exécuter le contenu de la migration
     
     3. **Configurer l'URL de l'API** (optionnel) :
        ```sql
        -- Définir l'URL de l'API comme variable de session (temporaire)
        SET app.api_url = 'https://votre-domaine.com/api/notifications/admin/new-request';
        
        -- Ou modifier directement la fonction dans la migration pour utiliser votre URL
        ```
     
     > 💡 **Avantage** : Les données sont envoyées directement sans variables non interpolées. Le trigger s'exécute automatiquement à chaque insertion dans `user_requests`.
   
     **Option B : Query Parameters (Simple mais limité)** :
     
     Dans le webhook Supabase, laissez le **HTTP Request Body vide** et utilisez l'URL avec des query parameters :
     
     ```
     URL: https://votre-domaine.com/api/notifications/admin/new-request?requestId={{ $1.id }}&requestType={{ $1.request_type }}
     ```
     
     > ⚠️ **Limitation** : Les query parameters peuvent être interpolés, mais vous ne pouvez passer que l'ID et le type. L'API récupérera les données complètes depuis la base de données.
   
     **Option C : Appel Direct depuis le Code (Recommandé si vous créez les demandes depuis votre code)** :
     
     Voir la section "Option 2" ci-dessous.

4. Cliquez sur **Save**

### Option 2: Appel Direct depuis le Code

Si vous créez des demandes depuis votre code (par exemple dans une API route), vous pouvez appeler directement l'API après l'insertion :

```typescript
// Après avoir créé une demande dans user_requests
const { data: newRequest, error } = await supabase
  .from("user_requests")
  .insert({ ... })
  .select()
  .single();

if (!error && newRequest) {
  // Appeler l'API de notification
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notifications/admin/new-request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestId: newRequest.id,
      requestType: newRequest.request_type,
      eventTitle: newRequest.event_data?.title,
      sourceUrl: newRequest.source_url,
    }),
  });
}
```

## Enregistrement des Tokens Push pour les Admins

Pour recevoir les notifications, les admins doivent enregistrer leur token push dans l'app mobile :

1. L'admin se connecte à l'app mobile avec son compte admin
2. L'app enregistre automatiquement le token push via `/api/notifications/register-token`
3. Le token est associé à l'utilisateur admin dans la table `user_push_tokens`

**Important** : Les admins doivent avoir le rôle `"admin"` dans leurs `user_metadata` dans Supabase Auth.

## Format de la Notification

Les admins reçoivent une notification avec :
- **Titre** : "📋 Nouvelle demande"
- **Corps** : "Nouvelle demande [type]: [titre de l'événement]"
- **Données** :
  ```json
  {
    "type": "new_request",
    "request_id": "uuid",
    "request_type": "event_creation" | "event_from_url",
    "event_title": "Titre de l'événement",
    "source_url": "URL source (si disponible)"
  }
  ```

## Test

Pour tester le système :

1. Créez une demande depuis l'app mobile (ou via une API route)
2. Vérifiez les logs du serveur Next.js pour voir si l'API est appelée
3. Vérifiez que les admins reçoivent bien la notification push

## Dépannage

### Les admins ne reçoivent pas de notifications

1. **Vérifier que les tokens sont enregistrés** :
   ```sql
   SELECT u.id, u.email, u.raw_user_meta_data->>'role' as role, t.token, t.platform
   FROM auth.users u
   LEFT JOIN user_push_tokens t ON t.user_id = u.id
   WHERE u.raw_user_meta_data->>'role' = 'admin';
   ```

2. **Vérifier que le webhook est configuré** :
   - Allez dans Supabase Dashboard > Database > Webhooks
   - Vérifiez que le webhook est actif et qu'il n'y a pas d'erreurs

3. **Vérifier les logs** :
   - Vérifiez les logs du serveur Next.js pour voir si l'API est appelée
   - Vérifiez les logs Supabase pour voir si le webhook est déclenché

4. **Tester l'API manuellement** :
   ```bash
   curl -X POST https://votre-domaine.com/api/notifications/admin/new-request \
     -H "Content-Type: application/json" \
     -d '{
       "requestId": "test-id",
       "requestType": "event_creation",
       "eventTitle": "Test Event"
     }'
   ```

### Erreurs courantes

- **"Aucun token trouvé"** : Les admins n'ont pas enregistré de token push. Ils doivent ouvrir l'app mobile et se connecter.
- **"Aucun utilisateur admin trouvé"** : Vérifiez que les utilisateurs ont bien le rôle `"admin"` dans leurs `user_metadata`.
- **"Token invalide"** : Le token push est invalide ou expiré. Il sera automatiquement supprimé de la base de données.

## Sécurité

- L'API `/api/notifications/admin/new-request` est publique mais ne fait qu'envoyer des notifications
- Les notifications sont envoyées uniquement aux utilisateurs avec le rôle `"admin"`
- Les tokens push sont associés aux utilisateurs et ne peuvent pas être utilisés par d'autres

