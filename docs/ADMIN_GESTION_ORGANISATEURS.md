# Guide : Gérer les organisateurs depuis l'interface admin

Ce guide explique comment gérer les organisateurs et inviter des utilisateurs depuis l'interface d'administration.

## 📍 Accès

Allez dans **Admin** > **Organisateurs** (`/admin/organizers`)

## 🔧 Fonctionnalités disponibles

### 1. Créer un organisateur

1. Cliquez sur le bouton **"Ajouter"** en haut à droite
2. Remplissez le formulaire :
   - **Nom** (obligatoire)
   - Description
   - Logo (upload d'image)
   - Liens sociaux (Instagram, Facebook, TikTok)
   - ID Page Facebook (pour l'import automatique)
   - Site web
   - URL d'exemple scraping
3. Cliquez sur **"Créer"**

### 2. Modifier un organisateur

1. Cliquez sur un organisateur dans la grille
2. Le formulaire d'édition s'ouvre
3. Modifiez les champs souhaités
4. Cliquez sur **"Enregistrer"**

### 3. Supprimer un organisateur

1. Cliquez sur l'icône **✏️ (Modifier)** d'un organisateur
2. Dans le menu déroulant, cliquez sur **"Supprimer"**
3. Confirmez la suppression

⚠️ **Attention** : La suppression est définitive. Les événements liés à cet organisateur ne seront pas supprimés, mais l'organisateur ne sera plus associé.

### 4. Inviter un utilisateur par email ✨

La méthode recommandée pour ajouter un utilisateur à un organisateur :

1. Cliquez sur un organisateur pour le modifier
2. Dans la section **"Utilisateurs associés"**, cliquez sur **"Ajouter un utilisateur"**
3. Saisissez l'**email** de l'utilisateur
4. Sélectionnez le **rôle** (Owner, Editor, ou Viewer)
5. Cliquez sur **"Envoyer l'invitation"**

**Ce qui se passe ensuite** :
- Une invitation est créée dans la base de données
- Un email est envoyé à l'utilisateur avec un lien unique
- L'utilisateur clique sur le lien dans l'email
- Il crée son compte (ou se connecte s'il existe déjà)
- Il est automatiquement lié à l'organisateur
- Il est redirigé vers son interface organisateur

📧 **Note** : En développement, l'URL d'invitation est loggée dans la console serveur. En production, configurez un service d'email (voir [Guide des invitations](INVITATIONS_ORGANISATEURS.md)).

### 5. Gérer les utilisateurs existants

Pour les utilisateurs déjà liés :

- **Voir la liste** : Tous les utilisateurs associés sont affichés avec leur email et leur rôle
- **Modifier le rôle** : Utilisez le dropdown pour changer le rôle (Owner, Editor, Viewer)
- **Retirer un utilisateur** : Cliquez sur l'icône ➖ pour retirer l'utilisateur

## 📊 Rôles disponibles

- **Owner (Propriétaire)** : Permissions maximales
  - Créer/modifier/supprimer des événements
  - Modifier le profil de l'organisateur
  - Gérer les membres (ajouter/retirer, modifier les rôles)
  
- **Editor (Éditeur)** : Permissions d'édition
  - Créer/modifier/supprimer des événements
  - Ne peut pas modifier le profil de l'organisateur
  - Ne peut pas gérer les membres
  
- **Viewer (Visualiseur)** : Lecture seule
  - Peut seulement voir les événements
  - Ne peut pas créer/modifier/supprimer

## 🔍 Recherche et filtres

- Utilisez la barre de recherche pour filtrer les organisateurs par nom ou description
- Les organisateurs sont affichés dans une grille avec leur logo, nom et liens sociaux

## 🔗 Actions rapides

Depuis la carte d'un organisateur :
- **🔗 (Lien externe)** : Voir les événements de cet organisateur dans la page événements
- **💻 (Code)** : Configurer le scraping pour cet organisateur (si URL d'exemple configurée)

## 📝 Notes importantes

1. **Un utilisateur peut être associé à plusieurs organisateurs** avec des rôles différents pour chacun
2. **Un organisateur peut avoir plusieurs utilisateurs** associés
3. **Les rôles sont spécifiques à chaque organisateur** (un utilisateur peut être owner d'un organisateur et editor d'un autre)
4. **Seuls les admins peuvent créer/modifier/supprimer les liaisons** utilisateur-organisateur
5. **Les invitations expirent après 7 jours** si elles ne sont pas acceptées
6. **L'admin peut renvoyer une invitation** si elle expire

## 🔄 Workflow d'invitation

```
Admin → Saisit email → Envoie invitation
         ↓
Utilisateur → Reçoit email → Clique sur le lien
         ↓
Page d'invitation → Crée compte/se connecte → Accepte invitation
         ↓
Redirection → Interface organisateur
```

## 🚀 Configuration email (Production)

Pour envoyer de vrais emails en production, consultez le [Guide des invitations](INVITATIONS_ORGANISATEURS.md) qui explique comment intégrer un service d'email comme Resend.

## 🐛 Dépannage

### L'invitation n'arrive pas

1. En développement : Vérifiez les logs de la console serveur
2. En production : Vérifiez la configuration du service d'email
3. L'URL d'invitation est toujours loggée même si l'email échoue

### L'utilisateur ne peut pas accepter l'invitation

- Vérifiez que l'invitation n'est pas expirée (7 jours)
- Vérifiez que l'invitation n'a pas déjà été acceptée
- Vérifiez que l'email correspond à celui de l'invitation

### Besoin de renvoyer une invitation

- L'admin peut simplement créer une nouvelle invitation avec le même email
- Si une invitation non acceptée existe déjà, elle sera réutilisée (même token)
