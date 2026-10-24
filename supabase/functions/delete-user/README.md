# Edge Function : delete-user

Cette Edge Function permet de supprimer un compte utilisateur avec les permissions admin nécessaires.

## 🔒 Sécurité

- ✅ Vérifie elle-même le jeton de l'utilisateur (`auth.getUser()`), d'où le déploiement sans « Verify JWT »
- ✅ Vérifie que l'utilisateur demande la suppression de son propre compte (sauf si admin)
- ✅ Utilise la clé secrète du projet pour les permissions admin
- ✅ Gère les erreurs CORS

## 📋 Les clés

Rien à configurer : Supabase injecte les clés dans l'environnement de la fonction. Elle prend la clé publishable et
la clé secrète nommées `default` (`SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`) dès qu'elles existent, sinon
les clés legacy (`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), qui cessent de marcher une fois désactivées dans
Settings → API Keys.

## 🚀 Déploiement

```bash
# Depuis la racine du projet
supabase functions deploy delete-user --no-verify-jwt
```

Sans `--no-verify-jwt`, la plateforme vérifie le jeton avant la fonction, et cette vérification casse le jour où le
projet passe aux « JWT Signing Keys » (doc de Supabase, « JWT Signing Keys », « Getting started »). La fonction
refuse d'elle-même une requête sans jeton valide (401).

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
