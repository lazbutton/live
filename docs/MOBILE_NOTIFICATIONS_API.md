# API Notifications pour l'Application Mobile

Ce document explique comment l'application mobile doit appeler l'API Next.js pour envoyer des notifications, au lieu d'utiliser une Edge Function Supabase.

## Endpoints disponibles

### 1. Enregistrer un token push

**Endpoint** : `POST /api/notifications/register-token`

**URL complète** : `https://votre-domaine.com/api/notifications/register-token`

**Headers** :
```
Authorization: Bearer <user_jwt_token>
Content-Type: application/json
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

**Exemple Flutter/Dart** :
```dart
final supabase = Supabase.instance.client;
final session = supabase.auth.currentSession;

if (session == null) {
  throw Exception('Utilisateur non authentifié');
}

final response = await http.post(
  Uri.parse('https://votre-domaine.com/api/notifications/register-token'),
  headers: {
    'Authorization': 'Bearer ${session.accessToken}',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({
    'token': pushToken,
    'platform': Platform.isIOS ? 'ios' : 'android',
    'deviceId': deviceId,
    'appVersion': appVersion,
  }),
);

if (response.statusCode == 200) {
  print('Token enregistré avec succès');
} else {
  throw Exception('Erreur: ${response.body}');
}
```

### 2. Supprimer un token push

**Endpoint** : `DELETE /api/notifications/register-token`

**Headers** :
```
Authorization: Bearer <user_jwt_token>
Content-Type: application/json
```

**Body** :
```json
{
  "token": "device_push_token_here"
}
```

## Configuration dans l'app mobile

### Variables d'environnement

Dans votre app Flutter, vous devez configurer l'URL de l'API Next.js :

```dart
// Dans votre fichier de configuration
const String NEXTJS_API_URL = 'https://votre-domaine.com'; // ou http://localhost:3000 pour le dev
```

### Code d'exemple complet (Flutter)

```dart
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:io';

class NotificationService {
  static const String apiUrl = 'https://votre-domaine.com'; // ⚠️ À remplacer
  
  /// Enregistre un token push pour l'utilisateur connecté
  static Future<void> registerPushToken(String token) async {
    try {
      final supabase = Supabase.instance.client;
      final session = supabase.auth.currentSession;
      
      if (session == null) {
        throw Exception('Utilisateur non authentifié');
      }

      final response = await http.post(
        Uri.parse('$apiUrl/api/notifications/register-token'),
        headers: {
          'Authorization': 'Bearer ${session.accessToken}',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'token': token,
          'platform': Platform.isIOS ? 'ios' : 'android',
          'deviceId': await _getDeviceId(), // Implémenter cette fonction
          'appVersion': await _getAppVersion(), // Implémenter cette fonction
        }),
      );

      if (response.statusCode == 200) {
        print('✅ Token push enregistré avec succès');
      } else {
        final errorData = jsonDecode(response.body);
        throw Exception('Erreur: ${errorData['error'] ?? response.body}');
      }
    } catch (e) {
      print('❌ Erreur lors de l\'enregistrement du token: $e');
      rethrow;
    }
  }
  
  /// Supprime un token push
  static Future<void> unregisterPushToken(String token) async {
    try {
      final supabase = Supabase.instance.client;
      final session = supabase.auth.currentSession;
      
      if (session == null) {
        throw Exception('Utilisateur non authentifié');
      }

      final response = await http.delete(
        Uri.parse('$apiUrl/api/notifications/register-token'),
        headers: {
          'Authorization': 'Bearer ${session.accessToken}',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'token': token,
        }),
      );

      if (response.statusCode == 200) {
        print('✅ Token push supprimé avec succès');
      } else {
        final errorData = jsonDecode(response.body);
        throw Exception('Erreur: ${errorData['error'] ?? response.body}');
      }
    } catch (e) {
      print('❌ Erreur lors de la suppression du token: $e');
      rethrow;
    }
  }
}
```

### Intégration avec flutter_local_notifications

```dart
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

Future<void> initializeNotifications() async {
  final flutterLocalNotificationsPlugin = FlutterLocalNotificationsPlugin();
  
  // Configuration iOS
  const initializationSettingsIOS = DarwinInitializationSettings(
    requestAlertPermission: true,
    requestBadgePermission: true,
    requestSoundPermission: true,
  );

  // Configuration Android
  const initializationSettingsAndroid = AndroidInitializationSettings('@mipmap/ic_launcher');

  const initializationSettings = InitializationSettings(
    android: initializationSettingsAndroid,
    iOS: initializationSettingsIOS,
  );

  await flutterLocalNotificationsPlugin.initialize(initializationSettings);

  // Demander les permissions
  await flutterLocalNotificationsPlugin
      .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
      ?.requestPermissions(
        alert: true,
        badge: true,
        sound: true,
      );

  // Obtenir le token APNs (iOS) ou FCM (Android)
  // Pour iOS, le token est obtenu automatiquement par flutter_local_notifications
  // Pour Android, utilisez firebase_messaging pour obtenir le token FCM
  
  // Enregistrer le token
  final token = await getPushToken(); // À implémenter selon votre configuration
  if (token != null) {
    await NotificationService.registerPushToken(token);
  }
}
```

## Migration depuis Edge Function Supabase

### Avant (❌ Ne fonctionne pas)
```dart
// ❌ ANCIEN CODE - Ne plus utiliser
final response = await supabase.functions.invoke(
  'send-notification',
  body: {
    'token': pushToken,
    'platform': 'ios',
  },
);
```

### Après (✅ Nouveau code)
```dart
// ✅ NOUVEAU CODE - Utiliser l'API Next.js
final response = await http.post(
  Uri.parse('$apiUrl/api/notifications/register-token'),
  headers: {
    'Authorization': 'Bearer ${session.accessToken}',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({
    'token': pushToken,
    'platform': Platform.isIOS ? 'ios' : 'android',
  }),
);
```

## Gestion des erreurs

L'API retourne les codes HTTP suivants :
- **200** : Succès
- **400** : Requête invalide (champs manquants, format incorrect)
- **401** : Non autorisé (token JWT invalide ou expiré)
- **500** : Erreur serveur

**Exemple de gestion d'erreur** :
```dart
try {
  await NotificationService.registerPushToken(token);
} on http.ClientException catch (e) {
  print('Erreur réseau: $e');
  // Gérer l'erreur réseau (pas de connexion, timeout, etc.)
} on FormatException catch (e) {
  print('Erreur de format: $e');
  // Réponse mal formée
} catch (e) {
  print('Erreur inconnue: $e');
  // Autre erreur
}
```

## Sécurité

⚠️ **Important** :
- L'API utilise l'authentification JWT de Supabase
- Le token JWT doit être valide et non expiré
- Seuls les utilisateurs authentifiés peuvent enregistrer leurs tokens
- Les tokens sont associés à l'utilisateur connecté automatiquement

## URL de l'API

- **Développement** : `http://localhost:3000` (si vous testez en local)
- **Production** : `https://votre-domaine.com` (remplacez par votre domaine réel)

⚠️ Pour le développement local, vous devrez peut-être configurer votre appareil/émulateur pour qu'il puisse accéder à `localhost`. Utilisez l'IP locale de votre machine au lieu de `localhost`.






