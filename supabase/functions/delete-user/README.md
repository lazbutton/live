# Edge Function : delete-user

Cette Edge Function permet de supprimer un compte utilisateur avec les permissions admin nécessaires.

## 🔒 Sécurité

- ✅ Vérifie que l'utilisateur est authentifié
- ✅ Vérifie que l'utilisateur demande la suppression de son propre compte (sauf si admin)
- ✅ Utilise la `SUPABASE_SERVICE_ROLE_KEY` pour les permissions admin
- ✅ Gère les erreurs CORS

## 📋 Prérequis

1. **Service Role Key** : Vous devez avoir la `SUPABASE_SERVICE_ROLE_KEY` configurée dans les secrets de votre projet Supabase.

2. **Configuration des secrets** :
   ```bash
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

## 🚀 Déploiement

```bash
# Depuis la racine du projet
supabase functions deploy delete-user
```

## 📡 Utilisation depuis Flutter

```dart
final response = await SupabaseService.client.functions.invoke(
  'delete-user',
  body: {'userId': userId}, // Optionnel, utilise l'utilisateur authentifié par défaut
  headers: {
    'Authorization': 'Bearer ${SupabaseService.client.auth.currentSession?.accessToken}',
  },
);
```

## 🔄 Webhook (Optionnel)

Cette fonction peut aussi être appelée via un webhook Supabase qui écoute les événements de suppression.

