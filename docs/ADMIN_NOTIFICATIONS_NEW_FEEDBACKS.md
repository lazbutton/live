# Notifications Push Automatiques pour les Admins - Nouveaux Feedbacks

Ce document explique comment configurer les notifications push automatiques pour les admins lorsqu'un nouveau feedback est créé.

## Vue d'ensemble

Lorsqu'un utilisateur soumet un nouveau feedback (via l'app mobile), tous les administrateurs reçoivent automatiquement une notification push sur leur appareil.

## Architecture

1. **Création d'un feedback** : Un utilisateur soumet un feedback via l'app mobile
2. **Déclenchement** : Un webhook Supabase ou un appel direct à l'API
3. **Notification** : L'API envoie une notification push à tous les admins ayant un token enregistré

## Configuration

### Option 1: Database Webhook Supabase (Recommandé)

> 📚 Pour plus de détails sur la configuration générale des webhooks Supabase, consultez [SUPABASE_WEBHOOKS_CONFIG.md](./SUPABASE_WEBHOOKS_CONFIG.md)

1. Allez dans le **Supabase Dashboard** > **Database** > **Webhooks**
2. Cliquez sur **Create a new webhook**
3. Configurez le webhook :
   - **Name** : `notify_admins_new_feedback`
   - **Table** : `feedbacks`
   - **Events** : Cochez `INSERT`
   - **Type** : `HTTP Request`
   - **Method** : `POST`
   - **URL** : `https://votre-domaine.com/api/notifications/admin/new-feedback`
   - **HTTP Headers** :
     ```
     Content-Type: application/json
     ```
   - **HTTP Request Body** - ⚠️ **IMPORTANT** : Supabase Database Webhooks **n'interpole PAS** les variables `{{ $1.id }}` dans le body JSON. Les variables sont envoyées littéralement.
   
     **Option A : Utiliser un trigger PostgreSQL (Recommandé)** :
     
     Une migration SQL est déjà disponible : `supabase/migrations/20250120000003_trigger_notify_admins_new_feedback.sql`
     
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
        SET app.api_url = 'https://votre-domaine.com/api/notifications/admin/new-feedback';
        
        -- Ou modifier directement la fonction dans la migration pour utiliser votre URL
        ```
     
     > 💡 **Avantage** : Les données sont envoyées directement sans variables non interpolées. Le trigger s'exécute automatiquement à chaque insertion dans `feedbacks`.
   
     **Option B : Query Parameters (Simple mais limité)** :
     
     Dans le webhook Supabase, laissez le **HTTP Request Body vide** et utilisez l'URL avec des query parameters :
     
     ```
     URL: https://votre-domaine.com/api/notifications/admin/new-feedback?feedbackId={{ $1.id }}
     ```
     
     > ⚠️ **Limitation** : Les query parameters peuvent être interpolés, mais vous ne pouvez passer que l'ID. L'API récupérera les données complètes depuis la base de données.
   
     **Option C : Appel Direct depuis le Code (Recommandé si vous créez les feedbacks depuis votre code)** :
     
     Voir la section "Option 2" ci-dessous.

4. Cliquez sur **Save**

### Option 2: Appel Direct depuis le Code

Si vous créez des feedbacks depuis votre code (par exemple dans une API route), vous pouvez appeler directement l'API après l'insertion :

```typescript
// Après avoir créé un feedback dans feedbacks
const { data: newFeedback, error } = await supabase
  .from("feedbacks")
  .insert({ ... })
  .select()
  .single();

if (!error && newFeedback) {
  // Appeler l'API de notification
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notifications/admin/new-feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      feedbackId: newFeedback.id,
      message: newFeedback.description,
      userId: newFeedback.user_id,
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
- **Titre** : "💬 Nouveau feedback"
- **Corps** : "[type]: [description tronquée]"
- **Données** :
  ```json
  {
    "type": "new_feedback",
    "feedback_id": "uuid",
    "feedback_type": "Type de feedback (si disponible)",
    "message": "Description du feedback (tronquée à 100 caractères)",
    "user_id": "ID de l'utilisateur qui a créé le feedback",
    "feedback_object_id": "ID de l'objet concerné (si disponible)"
  }
  ```

## Test

Pour tester le système :

1. Créez un feedback depuis l'app mobile (ou via une API route)
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
   curl -X POST https://votre-domaine.com/api/notifications/admin/new-feedback \
     -H "Content-Type: application/json" \
     -d '{
       "feedbackId": "test-id",
       "message": "Test feedback message"
     }'
   ```

### Erreurs courantes

- **"Aucun token trouvé"** : Les admins n'ont pas enregistré de token push. Ils doivent ouvrir l'app mobile et se connecter.
- **"Aucun utilisateur admin trouvé"** : Vérifiez que les utilisateurs ont bien le rôle `"admin"` dans leurs `user_metadata`.
- **"Token invalide"** : Le token push est invalide ou expiré. Il sera automatiquement supprimé de la base de données.

## Sécurité

- L'API `/api/notifications/admin/new-feedback` est publique mais ne fait qu'envoyer des notifications
- Les notifications sont envoyées uniquement aux utilisateurs avec le rôle `"admin"`
- Les tokens push sont associés aux utilisateurs et ne peuvent pas être utilisés par d'autres

