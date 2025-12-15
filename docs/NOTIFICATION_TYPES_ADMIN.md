# Types de Notifications Disponibles pour les Utilisateurs

## Vue d'ensemble

Les utilisateurs de l'application peuvent recevoir différents types de notifications selon leurs préférences et leurs interactions avec les événements. Ce document décrit tous les types de notifications disponibles et comment ils fonctionnent.

---

## 1. Notifications de Rappel d'Événements (Event Reminders)

### Description
Notifications locales programmées par l'utilisateur pour se rappeler d'événements spécifiques.

### Caractéristiques
- **Type** : Notifications locales (programmées sur l'appareil de l'utilisateur)
- **Contrôle** : Géré individuellement par l'utilisateur pour chaque événement
- **Activation** : Via le menu contextuel d'un événement (icône de notification)
- **Désactivation** : Via le même menu contextuel

### Options de Timing Disponibles
L'utilisateur peut choisir parmi 3 options pour recevoir un rappel :

1. **1 jour avant l'événement**
   - Disponible uniquement si l'événement a lieu dans plus de 24 heures
   - Message : "L'événement a lieu demain à [lieu]"

2. **3 heures avant l'événement**
   - Disponible si l'événement a lieu dans plus de 3 heures
   - Message : "L'événement a lieu dans 3h à [lieu]"

3. **1 heure avant l'événement**
   - Disponible si l'événement a lieu dans plus de 1 heure
   - Message : "L'événement a lieu dans 1h à [lieu]"

### Comportement
- Les options non disponibles (selon la date de l'événement) sont automatiquement masquées
- L'utilisateur peut changer le timing à tout moment en réactivant la notification
- Les notifications sont automatiquement annulées si l'événement est supprimé ou modifié
- Format du message : "Rappel : [Titre de l'événement]" + "L'événement a lieu [timing] à [lieu]"

---

## 2. Notifications Push (Notifications Système)

### Description
Notifications push envoyées par l'administrateur pour informer les utilisateurs des nouveaux événements ou des mises à jour importantes.

### Caractéristiques
- **Type** : Notifications push (FCM pour Android, APNs pour iOS)
- **Contrôle** : Géré par l'administrateur via l'écran "Paramètres de notifications"
- **Activation** : L'utilisateur doit activer les notifications dans ses préférences
- **Permissions** : Nécessite l'autorisation système de l'appareil

### Configuration Utilisateur

#### Fréquence de Réception
L'utilisateur peut choisir la fréquence à laquelle il souhaite recevoir les notifications push :

1. **Tous les jours** (`daily`)
   - L'utilisateur reçoit des notifications quotidiennement selon l'heure configurée par l'admin

2. **Début de semaine** (`weekly`)
   - L'utilisateur reçoit des notifications une fois par semaine (début de semaine)

3. **Jamais** (`never`)
   - L'utilisateur ne reçoit aucune notification push (mais peut toujours activer les rappels d'événements)

#### Filtrage par Catégories
L'utilisateur peut sélectionner les catégories d'événements pour lesquelles il souhaite recevoir des notifications :
- Les catégories sélectionnées déterminent quels événements déclenchent une notification
- Si aucune catégorie n'est sélectionnée, l'utilisateur ne reçoit pas de notifications push

### Configuration Administrateur

#### Activation Globale
- L'administrateur peut activer/désactiver l'envoi de notifications pour tous les utilisateurs
- Si désactivé, aucun utilisateur ne recevra de notifications push (même s'ils ont activé les notifications)

#### Heure d'Envoi
- L'administrateur peut configurer l'heure à laquelle les notifications sont envoyées
- Format : HH:MM (ex: 09:00)
- Cette heure s'applique à tous les utilisateurs qui ont choisi la fréquence "Tous les jours"

#### Notification de Test
- L'administrateur peut envoyer une notification de test à son propre appareil
- Utile pour vérifier que le système de notifications fonctionne correctement

---

## 3. Notifications de Test

### Description
Notifications envoyées par l'administrateur pour tester le système de notifications.

### Caractéristiques
- **Type** : Notification push de test
- **Contrôle** : Uniquement par l'administrateur
- **Destinataire** : L'administrateur qui envoie le test
- **Format** : "Notification de test" + message personnalisé

### Utilisation
- Accessible via l'écran "Paramètres de notifications" (admin uniquement)
- Permet de vérifier que les permissions système sont correctement configurées
- Permet de tester le format et l'affichage des notifications

---

## Résumé des Contrôles Utilisateur

| Type de Notification | Contrôle Utilisateur | Contrôle Admin | Permissions Système Requises |
|---------------------|---------------------|----------------|------------------------------|
| Rappels d'événements | ✅ Par événement | ❌ | ✅ |
| Notifications push | ✅ Préférences globales | ✅ Activation globale | ✅ |
| Notifications de test | ❌ | ✅ | ✅ |

---

## Notes Importantes pour l'Administrateur

1. **Permissions Système** : Tous les types de notifications nécessitent que l'utilisateur ait accordé les permissions système sur son appareil.

2. **Activation Globale** : Si vous désactivez les notifications push dans les paramètres admin, aucun utilisateur ne recevra de notifications push, même s'ils ont activé les notifications dans leurs préférences.

3. **Fréquence et Catégories** : Les utilisateurs peuvent personnaliser leur expérience en choisissant la fréquence et les catégories d'événements qui les intéressent.

4. **Rappels d'Événements** : Ces notifications sont entièrement gérées par l'utilisateur et ne peuvent pas être désactivées par l'administrateur. Elles sont programmées localement sur l'appareil de l'utilisateur.

5. **Compatibilité** : Les notifications push ne sont pas supportées sur le web. Seules les notifications locales (rappels d'événements) fonctionnent sur toutes les plateformes.

---

## Messages de Notification

### Rappels d'Événements
- **Titre** : "Rappel : [Titre de l'événement]"
- **Corps** : "L'événement a lieu [timing] à [lieu]"
  - Exemples :
    - "L'événement a lieu demain à Salle de concert"
    - "L'événement a lieu dans 3h à Parc central"
    - "L'événement a lieu dans 1h à Théâtre municipal"

### Notifications Push
- **Titre** : Configuré par l'administrateur
- **Corps** : Configuré par l'administrateur
- **Timing** : Selon la fréquence choisie par l'utilisateur et l'heure configurée par l'admin

---

## Dépannage

### Si un utilisateur ne reçoit pas de notifications :
1. Vérifier que les permissions système sont accordées
2. Vérifier que les notifications sont activées dans les préférences utilisateur
3. Vérifier que l'activation globale est activée (admin)
4. Vérifier que l'utilisateur a sélectionné au moins une catégorie (pour les notifications push)
5. Vérifier que la fréquence choisie correspond à l'heure d'envoi configurée

### Si les rappels d'événements ne fonctionnent pas :
1. Vérifier que l'événement a lieu dans le futur
2. Vérifier que le timing choisi est disponible (ex: "1 jour avant" nécessite > 24h)
3. Vérifier que les permissions système sont accordées

