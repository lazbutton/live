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

---

## 3. Gérer les notifications d'événements (Rappels)

### Activer une notification pour un événement

**Endpoint** : `POST /api/events/[eventId]/notifications`

**Headers** :
```
Authorization: Bearer <user_jwt_token>
Content-Type: application/json
```

**Body** :
```json
{
  "reminder_timing": "1_day",  // ou "3_hours" ou "1_hour"
  "is_enabled": true
}
```

**Réponse** :
```json
{
  "success": true,
  "notification": {
    "id": "uuid",
    "event_id": "uuid",
    "user_id": "uuid",
    "reminder_timing": "1_day",
    "notification_scheduled_at": "2025-01-17T09:00:00Z",
    "is_enabled": true,
    "created_at": "2025-01-16T10:00:00Z",
    "updated_at": "2025-01-16T10:00:00Z"
  }
}
```

**Options pour `reminder_timing`** :
- `"1_day"` : Rappel 1 jour avant l'événement
- `"3_hours"` : Rappel 3 heures avant l'événement
- `"1_hour"` : Rappel 1 heure avant l'événement

**Exemple Flutter/Dart** :
```dart
// Activer une notification avec rappel 1 jour avant
final response = await http.post(
  Uri.parse('$apiUrl/api/events/$eventId/notifications'),
  headers: {
    'Authorization': 'Bearer ${session.accessToken}',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({
    'reminder_timing': '1_day',  // ou '3_hours' ou '1_hour'
    'is_enabled': true,
  }),
);

if (response.statusCode == 200) {
  final data = jsonDecode(response.body);
  print('✅ Notification activée: ${data['notification']['id']}');
} else {
  final errorData = jsonDecode(response.body);
  throw Exception('Erreur: ${errorData['error']}');
}
```

### Récupérer la notification d'un événement

**Endpoint** : `GET /api/events/[eventId]/notifications`

**Headers** :
```
Authorization: Bearer <user_jwt_token>
```

**Réponse** :
```json
{
  "notification": {
    "id": "uuid",
    "event_id": "uuid",
    "user_id": "uuid",
    "reminder_timing": "1_day",
    "notification_scheduled_at": "2025-01-17T09:00:00Z",
    "is_enabled": true,
    "created_at": "2025-01-16T10:00:00Z",
    "updated_at": "2025-01-16T10:00:00Z"
  }
}
```

Si aucune notification n'existe :
```json
{
  "notification": null
}
```

**Exemple Flutter/Dart** :
```dart
final response = await http.get(
  Uri.parse('$apiUrl/api/events/$eventId/notifications'),
  headers: {
    'Authorization': 'Bearer ${session.accessToken}',
  },
);

if (response.statusCode == 200) {
  final data = jsonDecode(response.body);
  if (data['notification'] != null) {
    print('Notification existante: ${data['notification']['reminder_timing']}');
  } else {
    print('Aucune notification pour cet événement');
  }
}
```

### Mettre à jour une notification existante

**Endpoint** : `POST /api/events/[eventId]/notifications`

Utilisez le même endpoint que pour créer, mais avec les champs à mettre à jour :

```dart
// Changer le timing à 3 heures avant
final response = await http.post(
  Uri.parse('$apiUrl/api/events/$eventId/notifications'),
  headers: {
    'Authorization': 'Bearer ${session.accessToken}',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({
    'reminder_timing': '3_hours',  // Change le timing
    'is_enabled': true,
  }),
);
```

### Désactiver une notification

**Endpoint** : `POST /api/events/[eventId]/notifications`

```dart
// Désactiver sans supprimer
final response = await http.post(
  Uri.parse('$apiUrl/api/events/$eventId/notifications'),
  headers: {
    'Authorization': 'Bearer ${session.accessToken}',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({
    'is_enabled': false,  // Désactive la notification
  }),
);
```

### Supprimer une notification

**Endpoint** : `DELETE /api/events/[eventId]/notifications`

**Headers** :
```
Authorization: Bearer <user_jwt_token>
```

**Réponse** :
```json
{
  "success": true
}
```

**Exemple Flutter/Dart** :
```dart
final response = await http.delete(
  Uri.parse('$apiUrl/api/events/$eventId/notifications'),
  headers: {
    'Authorization': 'Bearer ${session.accessToken}',
  },
);

if (response.statusCode == 200) {
  print('✅ Notification supprimée');
}
```

### Gestion des erreurs

L'API retourne les codes HTTP suivants :
- **200** : Succès
- **400** : Requête invalide (timing non disponible, événement dans le passé, etc.)
- **401** : Non autorisé (token JWT invalide ou expiré)
- **404** : Événement non trouvé
- **500** : Erreur serveur

**Messages d'erreur possibles** :
- `"L'événement a lieu dans moins de 24 heures. Le rappel '1 jour avant' n'est plus disponible."`
- `"L'événement a lieu dans moins de 3 heures. Le rappel '3 heures avant' n'est plus disponible."`
- `"L'événement a lieu dans moins d'1 heure. Le rappel '1 heure avant' n'est plus disponible."`

### Notes importantes

1. **Calcul automatique** : L'API calcule automatiquement `notification_scheduled_at` en fonction de `reminder_timing` et de la date de l'événement.

2. **Validation** : L'API vérifie que le timing choisi est toujours disponible. Si l'événement a lieu dans moins de temps que le timing choisi, une erreur 400 est retournée.

3. **Upsert** : Si une notification existe déjà pour cet événement et cet utilisateur, elle sera mise à jour au lieu d'être créée.

4. **Timing recommandé** :
   - **1 jour avant** : Pour les événements importants ou qui nécessitent une préparation
   - **3 heures avant** : Pour les événements du même jour
   - **1 heure avant** : Pour les événements qui commencent bientôt

5. **Rappels automatiques** : Les rappels sont envoyés automatiquement par un cron job toutes les heures. Aucune action supplémentaire n'est nécessaire après avoir activé la notification.









