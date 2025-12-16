# Configuration des Webhooks Supabase

Ce document explique comment configurer les webhooks Supabase pour envoyer automatiquement des notifications ou déclencher des actions lorsque des événements se produisent dans la base de données.

## Vue d'ensemble

Les webhooks Supabase Database permettent de déclencher des requêtes HTTP lorsqu'un événement (INSERT, UPDATE, DELETE) se produit sur une table. Les données de la ligne concernée peuvent être envoyées directement dans le body de la requête HTTP.

## Avantages du format "données de la ligne directement"

Lorsque vous configurez un webhook pour envoyer les données de la ligne directement dans le body :

✅ **Performance** : Pas besoin de requête supplémentaire à la base de données  
✅ **Simplicité** : Les données sont immédiatement disponibles dans l'API  
✅ **Fiabilité** : Moins de points de défaillance (pas de risque d'échec de la requête de récupération)  
✅ **Données complètes** : Tous les champs de la ligne sont disponibles

## Configuration dans Supabase Dashboard

### Étapes générales

1. Allez dans le **Supabase Dashboard** > **Database** > **Webhooks**
2. Cliquez sur **Create a new webhook**
3. Configurez le webhook :
   - **Name** : Nom descriptif du webhook
   - **Table** : Sélectionnez la table à surveiller
   - **Events** : Cochez les événements à surveiller (généralement `INSERT`)
   - **Type** : `HTTP Request`
   - **Method** : `POST`
   - **URL** : L'URL de votre endpoint API (ex: `https://votre-domaine.com/api/notifications/admin/new-request`)
   - **HTTP Headers** :
     ```
     Content-Type: application/json
     ```
   - **HTTP Request Body** : Configurez le body selon l'une des options ci-dessous

### Format du Body : Données de la ligne directement (Recommandé)

Pour envoyer les données de la ligne directement dans le body, utilisez les variables de template Supabase :

```json
{
  "id": "{{ $1.id }}",
  "champ1": "{{ $1.champ1 }}",
  "champ2": "{{ $1.champ2 }}",
  "champ3": "{{ $1.champ3 }}",
  "created_at": "{{ $1.created_at }}"
}
```

**Comment ça fonctionne** :
- `$1` représente la ligne insérée/mise à jour/supprimée
- `{{ $1.champ }}` est interpolé avec la valeur du champ au moment du déclenchement
- Pour les objets JSON, utilisez `{{ $1.champ }}` (Supabase les sérialisera automatiquement)

**Exemple pour une table `feedbacks`** :
```json
{
  "id": "{{ $1.id }}",
  "description": "{{ $1.description }}",
  "user_id": "{{ $1.user_id }}",
  "status": "{{ $1.status }}",
  "feedback_object_id": "{{ $1.feedback_object_id }}",
  "created_at": "{{ $1.created_at }}"
}
```

**Exemple pour une table `user_requests` avec un champ JSON** :
```json
{
  "id": "{{ $1.id }}",
  "request_type": "{{ $1.request_type }}",
  "event_data": {{ $1.event_data }},
  "source_url": "{{ $1.source_url }}",
  "requested_at": "{{ $1.requested_at }}"
}
```

> ⚠️ **Note importante** : Pour les champs de type JSON/JSONB, n'utilisez pas de guillemets autour de `{{ $1.champ }}`, sinon ils seront traités comme une chaîne de caractères.

### Format alternatif : Champs spécifiques

Si vous préférez envoyer seulement certains champs, vous pouvez créer un objet JSON personnalisé :

```json
{
  "requestId": "{{ $1.id }}",
  "requestType": "{{ $1.request_type }}",
  "eventTitle": "{{ $1.event_data.title }}"
}
```

Dans ce cas, votre API devra récupérer les données complètes depuis la base de données si nécessaire.

## Comment l'API détecte le format

Les API routes sont conçues pour détecter automatiquement le format utilisé :

1. **Format "données de la ligne"** : Si le body contient un champ `id` (ou autre champ clé primaire) qui correspond aux champs de la table, l'API utilise directement ces données
2. **Format "champs spécifiques"** : Si le body contient des champs comme `requestId`, `feedbackId`, etc., l'API récupère les données depuis la base de données

## Exemples concrets

### Webhook pour notifications de nouvelles demandes

Consultez [ADMIN_NOTIFICATIONS_NEW_REQUESTS.md](./ADMIN_NOTIFICATIONS_NEW_REQUESTS.md) pour un exemple complet.

### Webhook pour notifications de nouveaux feedbacks

Consultez [ADMIN_NOTIFICATIONS_NEW_FEEDBACKS.md](./ADMIN_NOTIFICATIONS_NEW_FEEDBACKS.md) pour un exemple complet.

## Dépannage

### Le webhook ne se déclenche pas

1. Vérifiez que le webhook est actif dans Supabase Dashboard
2. Vérifiez les logs Supabase pour voir si le webhook est déclenché
3. Vérifiez que l'URL est correcte et accessible
4. Vérifiez que les événements sélectionnés (INSERT, UPDATE, DELETE) correspondent aux actions que vous testez

### Les variables ne sont pas interpolées

- Assurez-vous d'utiliser la syntaxe correcte : `{{ $1.champ }}`
- Vérifiez que le nom du champ correspond exactement aux colonnes de la table
- Pour les champs JSON, ne mettez pas de guillemets : `{{ $1.event_data }}` et non `"{{ $1.event_data }}"`

### Erreur 400 : Variables non interpolées

Si vous recevez une erreur indiquant que les variables ne sont pas interpolées :

1. Vérifiez que vous utilisez bien la syntaxe `{{ $1.champ }}`
2. Si vous utilisez des données directement, assurez-vous que tous les champs nécessaires sont présents dans le body
3. Consultez les logs de votre API pour voir le format exact du body reçu

## Bonnes pratiques

1. **Utilisez le format "données de la ligne directement"** quand c'est possible pour de meilleures performances
2. **Incluez tous les champs nécessaires** dans le body du webhook pour éviter les requêtes supplémentaires
3. **Testez le webhook** après la configuration en créant un enregistrement de test
4. **Configurez des headers appropriés** (Content-Type: application/json)
5. **Utilisez HTTPS** pour les URLs de production pour garantir la sécurité des données


