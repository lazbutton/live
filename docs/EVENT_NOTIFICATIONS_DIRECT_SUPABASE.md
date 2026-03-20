# Utilisation directe de Supabase pour les notifications d'événements

> Attention
>
> Ce document decrit un ancien flux de rappels individuels par evenement.
> Ce systeme est desormais obsolete et ne doit plus etre utilise pour le produit courant.
> Les envois actifs reposent uniquement sur les notifications par categories suivies en `daily` et `weekly`.

## Vue d'ensemble

L'application mobile peut utiliser directement le client Supabase pour gérer les notifications d'événements, sans passer par l'API Next.js. Cela fonctionne grâce aux **RLS policies** (Row Level Security) de Supabase qui permettent aux utilisateurs de gérer leurs propres notifications.

## Avantages

✅ **Plus simple** : Pas besoin de faire des appels HTTP, utilisation directe du client Supabase  
✅ **Plus rapide** : Pas de latence réseau supplémentaire  
✅ **Calcul automatique** : Un trigger PostgreSQL calcule automatiquement `notification_scheduled_at`  
✅ **Sécurisé** : Les RLS policies garantissent que chaque utilisateur ne peut modifier que ses propres notifications

## Calcul automatique de `notification_scheduled_at`

⚠️ **Important** : Un **trigger PostgreSQL** calcule automatiquement `notification_scheduled_at` lors de l'insertion ou de la mise à jour. Vous n'avez **pas besoin** de le calculer vous-même côté client.

Le trigger s'active automatiquement quand :
- Vous insérez une nouvelle notification avec `reminder_timing`
- Vous mettez à jour `reminder_timing` ou `event_id` d'une notification existante

## Exemples d'utilisation (Flutter/Dart)

### Activer une notification avec rappel

```dart
import 'package:supabase_flutter/supabase_flutter.dart';

final supabase = Supabase.instance.client;

// Activer une notification avec rappel 1 jour avant
final response = await supabase
  .from('event_notifications')
  .upsert({
    'event_id': eventId,
    'user_id': supabase.auth.currentUser!.id,
    'reminder_timing': '1_day',  // ou '3_hours' ou '1_hour'
    'is_enabled': true,
    // ⚠️ NE PAS inclure notification_scheduled_at, il sera calculé automatiquement
  }, onConflict: 'event_id,user_id');

if (response.error == null) {
  print('✅ Notification activée');
} else {
  print('❌ Erreur: ${response.error?.message}');
}
```

### Vérifier si une notification existe

```dart
final response = await supabase
  .from('event_notifications')
  .select()
  .eq('event_id', eventId)
  .eq('user_id', supabase.auth.currentUser!.id)
  .maybeSingle();

if (response.data != null) {
  final notification = response.data;
  print('Notification existante: ${notification['reminder_timing']}');
  print('Programmée pour: ${notification['notification_scheduled_at']}');
} else {
  print('Aucune notification pour cet événement');
}
```

### Mettre à jour le timing d'une notification

```dart
// Changer le timing à 3 heures avant
final response = await supabase
  .from('event_notifications')
  .update({
    'reminder_timing': '3_hours',
    // ⚠️ NE PAS mettre notification_scheduled_at, il sera recalculé automatiquement
  })
  .eq('event_id', eventId)
  .eq('user_id', supabase.auth.currentUser!.id);

if (response.error == null) {
  print('✅ Timing mis à jour');
}
```

### Désactiver une notification (sans supprimer)

```dart
final response = await supabase
  .from('event_notifications')
  .update({
    'is_enabled': false,
  })
  .eq('event_id', eventId)
  .eq('user_id', supabase.auth.currentUser!.id);

if (response.error == null) {
  print('✅ Notification désactivée');
}
```

### Supprimer une notification

```dart
final response = await supabase
  .from('event_notifications')
  .delete()
  .eq('event_id', eventId)
  .eq('user_id', supabase.auth.currentUser!.id);

if (response.error == null) {
  print('✅ Notification supprimée');
}
```

### Récupérer toutes les notifications actives de l'utilisateur

```dart
final response = await supabase
  .from('event_notifications')
  .select('''
    *,
    event:events!inner(
      id,
      title,
      date,
      category
    )
  ''')
  .eq('user_id', supabase.auth.currentUser!.id)
  .eq('is_enabled', true)
  .gte('event.date', DateTime.now().toIso8601String());

if (response.error == null) {
  final notifications = response.data as List;
  print('${notifications.length} notifications actives');
}
```

## Valeurs possibles pour `reminder_timing`

- `"1_day"` : Rappel 1 jour (24 heures) avant l'événement
- `"3_hours"` : Rappel 3 heures avant l'événement
- `"1_hour"` : Rappel 1 heure avant l'événement
- `null` : Pas de rappel programmé (peut être utilisé pour désactiver temporairement)

## Validation côté client (optionnel mais recommandé)

Bien que le trigger PostgreSQL garantisse le calcul correct, vous pouvez valider côté client pour améliorer l'expérience utilisateur :

```dart
bool isReminderTimingAvailable(String eventDateStr, String reminderTiming) {
  final eventDate = DateTime.parse(eventDateStr);
  final now = DateTime.now();
  final timeUntilEvent = eventDate.difference(now);

  switch (reminderTiming) {
    case '1_day':
      return timeUntilEvent.inHours >= 24;
    case '3_hours':
      return timeUntilEvent.inHours >= 3;
    case '1_hour':
      return timeUntilEvent.inMinutes >= 60;
    default:
      return false;
  }
}

// Utilisation
if (isReminderTimingAvailable(event.date, '1_day')) {
  // Afficher l'option "1 jour avant"
} else {
  // Masquer l'option "1 jour avant" (trop tard)
}
```

## Gestion des erreurs

Les erreurs RLS peuvent se produire si :
- L'utilisateur n'est pas authentifié
- L'utilisateur essaie de modifier la notification d'un autre utilisateur
- L'événement n'existe pas

```dart
try {
  final response = await supabase
    .from('event_notifications')
    .upsert({...});

  if (response.error != null) {
    // Erreur RLS ou autre erreur
    if (response.error!.code == 'PGRST301') {
      print('Non autorisé (RLS)');
    } else {
      print('Erreur: ${response.error!.message}');
    }
  }
} catch (e) {
  print('Exception: $e');
}
```

## Différences avec l'API Next.js

| Aspect | Supabase direct | API Next.js |
|--------|----------------|-------------|
| **Complexité** | Simple (client Supabase) | Plus complexe (appels HTTP) |
| **Latence** | Plus rapide | Légèrement plus lent |
| **Calcul de `notification_scheduled_at`** | Automatique (trigger) | Automatique (API) |
| **Validation métier** | Optionnelle côté client | Obligatoire côté serveur |
| **Messages d'erreur** | Génériques (RLS) | Personnalisés et détaillés |
| **Fonctionnalités** | De base | Avancées (vérifications supplémentaires) |

## Recommandation

✅ **Utilisez Supabase directement** si :
- Vous voulez une intégration simple et rapide
- Vous faites confiance aux RLS policies pour la sécurité
- Vous validez côté client les timings disponibles

✅ **Utilisez l'API Next.js** si :
- Vous voulez des messages d'erreur plus détaillés
- Vous voulez une validation métier centralisée
- Vous préférez une couche d'abstraction supplémentaire

## Notes importantes

1. ⚠️ **Ne calculez JAMAIS `notification_scheduled_at` côté client**. Le trigger PostgreSQL s'en charge automatiquement.

2. ✅ **Le trigger fonctionne aussi si vous utilisez l'API Next.js**, donc les deux approches sont compatibles.

3. 🔒 **Sécurité** : Les RLS policies garantissent que :
   - Les utilisateurs ne peuvent créer que leurs propres notifications
   - Les utilisateurs ne peuvent modifier/supprimer que leurs propres notifications
   - Les utilisateurs ne peuvent voir que leurs propres notifications

4. 🚀 **Performance** : Le calcul est fait directement dans PostgreSQL, donc très rapide.

## Exemple complet : Gérer une notification d'événement

```dart
class EventNotificationService {
  final SupabaseClient supabase;

  EventNotificationService(this.supabase);

  /// Active ou met à jour une notification pour un événement
  Future<void> enableNotification({
    required String eventId,
    required String reminderTiming, // '1_day', '3_hours', ou '1_hour'
  }) async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) {
      throw Exception('Utilisateur non authentifié');
    }

    final response = await supabase
      .from('event_notifications')
      .upsert({
        'event_id': eventId,
        'user_id': userId,
        'reminder_timing': reminderTiming,
        'is_enabled': true,
      }, onConflict: 'event_id,user_id');

    if (response.error != null) {
      throw Exception('Erreur: ${response.error!.message}');
    }
  }

  /// Désactive une notification
  Future<void> disableNotification(String eventId) async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) {
      throw Exception('Utilisateur non authentifié');
    }

    final response = await supabase
      .from('event_notifications')
      .update({'is_enabled': false})
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (response.error != null) {
      throw Exception('Erreur: ${response.error!.message}');
    }
  }

  /// Supprime une notification
  Future<void> deleteNotification(String eventId) async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) {
      throw Exception('Utilisateur non authentifié');
    }

    final response = await supabase
      .from('event_notifications')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (response.error != null) {
      throw Exception('Erreur: ${response.error!.message}');
    }
  }

  /// Récupère la notification d'un événement
  Future<Map<String, dynamic>?> getNotification(String eventId) async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) {
      throw Exception('Utilisateur non authentifié');
    }

    final response = await supabase
      .from('event_notifications')
      .select()
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle();

    if (response.error != null) {
      throw Exception('Erreur: ${response.error!.message}');
    }

    return response.data;
  }
}
```





