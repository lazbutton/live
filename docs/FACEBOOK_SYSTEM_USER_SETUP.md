# Guide : Configuration d'un System User Token Facebook (Production) - 2025

**Dernière mise à jour : Janvier 2025**

Ce guide explique comment configurer un **System User Token** pour accéder aux événements Facebook de manière permanente, sans expiration. Cette méthode est recommandée pour les environnements de production en 2025.

## Avantages du System User Token

- ✅ Token qui ne expire pas (ou se renouvelle automatiquement)
- ✅ Plus sécurisé pour la production
- ✅ Accès permanent aux pages Facebook
- ✅ Ne nécessite pas de ré-authentification manuelle

## Prérequis

1. Un compte Facebook avec accès administrateur à la page concernée
2. Accès au [Facebook Business Manager](https://business.facebook.com/)
3. Un compte développeur Facebook (peut nécessiter la vérification dans Accounts Center)

---

## Étape 1 : Créer une Application Facebook

### 1.1 Créer l'application

1. Allez sur [Facebook Developers - Applications](https://developers.facebook.com/apps/)
2. Cliquez sur **"Créer une application"** (ou "Create App")
3. Si Facebook demande de vérifier votre compte via SMS :
   - Allez sur [Accounts Center](https://www.facebook.com/settings?tab=account_center)
   - Vérifiez votre numéro de téléphone
   - Retournez créer l'application

4. Choisissez **"Autre"** ou **"Entreprise"** comme type d'application (en 2025, Facebook peut recommander "Entreprise" pour les intégrations API)
5. Remplissez les informations :
   - **Nom de l'application** : Ex: "Live Admin Events"
   - **Email de contact** : Votre email
   - **Objectif commercial** : Laissez par défaut ou choisissez selon votre cas
6. Complétez la vérification de sécurité si demandée (SMS, email, etc.)
7. Cliquez sur **"Créer une application"**

**Note 2025** : Facebook peut demander une vérification supplémentaire lors de la création de l'application. Assurez-vous que votre compte est vérifié dans le Accounts Center avant de continuer.

### 1.2 Ajouter les produits nécessaires ⭐ IMPORTANT

Pour que les permissions de pages soient disponibles, vous devez ajouter des produits à votre application :

1. Dans votre application, allez dans **"Ajouter un produit"** (ou "Add Product") dans le menu de gauche
2. Recherchez et ajoutez les produits suivants :
   - **"Facebook Login"** (ou "Connexion Facebook") - Nécessaire pour obtenir des tokens
   - **"Pages"** (si disponible) - Pour les permissions de pages
   
3. Pour chaque produit ajouté :
   - Acceptez les conditions d'utilisation si demandé
   - Configurez les paramètres de base si nécessaire (vous pouvez laisser par défaut pour commencer)

**Note** : Si vous ne voyez pas "Pages" comme produit séparé, "Facebook Login" est généralement suffisant pour obtenir les permissions `pages_read_engagement` et `pages_read_user_content`.

### 1.3 Noter les identifiants

Une fois l'application créée et les produits ajoutés :

1. Allez dans **"Paramètres"** → **"Paramètres de base"**
2. Notez :
   - **ID de l'application** (App ID)
   - **Clé secrète de l'application** (App Secret) - cliquez sur "Afficher" pour la révéler

⚠️ **Important** : Gardez ces identifiants en sécurité, surtout la clé secrète !

---

## Étape 2 : Configurer Business Manager (si nécessaire)

Si vous n'avez pas encore de Business Manager :

1. Allez sur [Facebook Business Manager](https://business.facebook.com/)
2. Créez un compte Business Manager (si nécessaire)
3. Ajoutez votre page Facebook au Business Manager :
   - Allez dans **"Paramètres"** → **"Comptes"** → **"Pages"**
   - Cliquez sur **"Ajouter"** → **"Ajouter une page"**
   - Sélectionnez votre page

---

## Étape 3 : Créer un System User

### 3.1 Créer le System User dans Business Manager

1. Dans [Facebook Business Manager](https://business.facebook.com/), allez dans **"Paramètres"**
2. Dans le menu de gauche, allez dans **"Utilisateurs"** → **"Utilisateurs système"**
3. Cliquez sur **"Ajouter"** → **"Nouvel utilisateur système"**
4. Remplissez les informations :
   - **Nom de l'utilisateur système** : Ex: "Live Admin API User"
   - **Description** : Ex: "Utilisateur système pour récupérer les événements Facebook"
5. Cliquez sur **"Créer un utilisateur système"**

### 3.2 Générer un token pour le System User

1. Dans la liste des utilisateurs système, cliquez sur l'utilisateur que vous venez de créer
2. Cliquez sur **"Générer un nouveau token"** (ou "Generate New Token")
3. Sélectionnez votre **application Facebook** (créée à l'étape 1)

**⚠️ Problème : "No permissions available"**

Si vous voyez le message "No permissions available" ou "Aucune permission disponible" :

**Solution** :
1. Retournez dans votre application Facebook
2. Vérifiez que vous avez ajouté le produit **"Facebook Login"** (voir étape 1.2)
3. Allez dans **"Facebook Login"** → **"Paramètres"**
4. Vérifiez que l'application est bien configurée
5. Si nécessaire, allez dans **"Produits"** et ajoutez **"Facebook Login"** si ce n'est pas déjà fait
6. Retournez dans Business Manager et réessayez de générer le token

**Alternative** : Si les permissions ne s'affichent toujours pas :
- Attendez quelques minutes (la propagation peut prendre du temps)
- Vérifiez que votre application est en mode **"Développement"** ou **"Live"** (pas en mode "Hors ligne")
- Essayez de supprimer et recréer le System User

4. Une fois l'application sélectionnée, vous devriez voir les permissions disponibles. Sélectionnez les **permissions** nécessaires :
   - `pages_read_engagement` - Pour lire les événements des pages (requis)
   - `pages_show_list` - Pour lister les pages accessibles (requis)
   - `pages_read_user_content` - Pour lire le contenu public des pages (recommandé)
     - ⭐ **Important** : Nécessaire pour récupérer les événements de pages publiques qui ne vous appartiennent pas
   - `pages_manage_posts` - Seulement si vous prévoyez de publier (optionnel)
5. **Option "Le token n'expire jamais"** : Cochez cette option si disponible (recommandé pour la production)
6. Cliquez sur **"Générer un token"**
7. **⚠️ IMPORTANT** : Copiez immédiatement le token généré. Il ne sera affiché qu'une seule fois !

**Note 2025** : Facebook recommande maintenant de configurer le token pour qu'il n'expire jamais lors de sa création initiale. Si cette option n'est pas disponible, le token peut être configuré pour une longue durée (généralement 60 jours minimum).

### 3.3 Donner accès aux pages au System User

1. Dans Business Manager, allez dans **"Paramètres"** → **"Comptes"** → **"Pages"**
2. Sélectionnez la page pour laquelle vous voulez donner accès
3. Cliquez sur **"Affecter des personnes"** (ou "Assign People")
4. Dans la recherche, sélectionnez votre **System User** (pas votre compte personnel)
5. Donnez le rôle **"Administrateur"** ou **"Éditeur"**
6. Cliquez sur **"Affecter"**

**Note** : Répétez cette étape pour chaque page dont vous voulez récupérer les événements.

---

## Étape 4 : Configurer le token dans votre application

### 4.1 Ajouter le token dans les variables d'environnement

1. Ouvrez votre fichier `.env.local` (pour le développement) ou `.env.production` (pour la production)
2. Ajoutez le System User Token :

```env
# Token System User Facebook (2025)
FACEBOOK_ACCESS_TOKEN=votre_system_user_token_ici
```

⚠️ **Sécurité (2025)** : 
- Ne commitez jamais ce fichier dans Git ! Vérifiez qu'il est dans `.gitignore`
- Utilisez des secrets management pour la production (ex: Vercel Environment Variables, AWS Secrets Manager, etc.)
- Limitez l'accès aux tokens aux seules personnes qui en ont besoin

### 4.2 Vérifier que le token fonctionne

Vous pouvez tester le token avec curl ou directement dans votre navigateur :

```bash
# Remplacez {page-id} par l'ID de votre page Facebook
# Remplacez {your-token} par votre System User Token
# Note: Utilisez la dernière version de l'API Graph (v21.0 ou supérieure en 2025)
curl "https://graph.facebook.com/v21.0/{page-id}/events?access_token={your-token}&limit=10"
```

Ou testez dans le navigateur :
```
https://graph.facebook.com/v21.0/{page-id}/events?access_token={your-token}&limit=10
```

**Alternative : Utiliser Graph API Explorer (2025)**
1. Allez sur [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Sélectionnez votre application
3. Collez votre System User Token dans le champ "Access Token"
4. Testez la requête : `GET /{page-id}/events`

Si cela fonctionne, vous devriez voir une réponse JSON avec les événements de la page.

**Note 2025** : Facebook limite maintenant les résultats par défaut. Ajoutez le paramètre `limit` pour spécifier le nombre d'événements à récupérer.

---

## Étape 5 : Vérifier les permissions du token (optionnel)

Pour vérifier quelles permissions votre token a :

```
GET https://graph.facebook.com/v21.0/me/permissions?access_token={your-token}
```

Vous devriez voir les permissions que vous avez accordées, avec le statut "granted".

---

## ⚠️ ERREUR : "Page Public Content Access" ou "Page Public Metadata Access" feature required

Si vous obtenez cette erreur même avec un System User Token et les bonnes permissions, c'est que votre **application Facebook** doit activer une **Feature**.

### 🔴 PROBLÈME

Facebook a changé son système (2025). Pour accéder aux pages publiques qui ne sont pas dans votre app, vous devez :
1. ✅ Avoir un System User Token avec les permissions
2. ✅ **Activer une Feature dans votre application Facebook** : "Page Public Metadata Access" ou "Page Public Content Access"
3. ✅ Soumettre cette feature pour Review si nécessaire

### ✅ SOLUTION : Activer la Feature

#### Étape 1 : Activer "Page Public Metadata Access" (Recommandé)

**📍 OÙ TROUVER LA FEATURE (2025) :**

⚠️ **IMPORTANT** : Il n'y a PAS de section "Fonctionnalités" séparée dans le menu. La feature se trouve directement dans **"App Review"** / **"Révision de l'app"**.

1. **Allez sur** https://developers.facebook.com/apps
2. **Sélectionnez votre application Facebook**
3. **Dans le menu de gauche, cliquez sur** :
   - **"Révision de l'app"** (en français)
   - OU **"App Review"** (en anglais)
   
   ⚠️ **C'est la page principale où se trouvent TOUTES les features et permissions**

4. **Dans la page App Review / Révision de l'app** :
   - Vous verrez une liste complète de toutes les permissions et features disponibles
   - **Cherchez** dans cette liste : **"Page Public Metadata Access"**
   - Faites défiler si nécessaire - les features peuvent être organisées par catégories
   - OU utilisez la **barre de recherche** en haut de la page si disponible
   - OU cherchez dans les onglets/tabs de cette page s'il y en a (ex: "Permissions", "Features", etc.)

5. **Une fois trouvé** :
   - Cliquez sur **"Demander l'accès"** ou **"Request Access"** à côté de la feature
   - OU cliquez directement sur le nom de la feature pour voir les détails

6. **Si vous ne trouvez toujours pas la feature** :
   - Vérifiez que votre application est en mode **"Développement"** ou **"Live"** (pas en mode "Test" uniquement)
   - Certaines features peuvent ne pas être disponibles selon le type d'application
   - Essayez de rechercher directement via la documentation : https://developers.facebook.com/docs/apps/review/feature#page-public-metadata-access
   - Cette URL devrait vous donner un lien direct vers la feature dans votre app

#### Étape 2 : Soumettre pour Review (si nécessaire)

**📋 La Feature nécessite généralement une review :**

1. Une fois que vous avez trouvé **"Page Public Metadata Access"** dans App Review
2. Cliquez sur **"Demander l'accès"** ou **"Request Access"**
3. Remplissez le formulaire de demande :
   - **Justification d'utilisation** : 
     - Expliquez que votre application affiche les événements publics de pages Facebook
     - Décrivez comment les utilisateurs bénéficient de cette fonctionnalité
     - Mentionnez que vous respectez la vie privée (uniquement données publiques)
   
   - **Captures d'écran** :
     - Montrez votre interface admin où vous importez les événements
     - Montrez comment les événements sont affichés aux utilisateurs
     - Montrez le processus de sélection d'une page Facebook
   
   - **Démonstration** :
     - Fournissez une vidéo de démonstration si possible
     - Ou des instructions étape par étape pour tester
     - URL de test si votre application est accessible publiquement
   
   - **Données demandées** :
     - Sélectionnez les champs que vous souhaitez accéder (événements, informations de page, etc.)
   
4. Soumettez la demande et attendez l'approbation (peut prendre plusieurs jours/semaines)

**💡 Note** : Si vous ne trouvez toujours pas la feature, elle peut ne pas être disponible pour votre type d'application ou nécessiter que l'application soit en mode "Live".

#### Étape 3 : Attendre l'approbation

- Facebook peut prendre plusieurs jours/semaines pour approuver
- Une fois approuvé, votre System User Token pourra accéder aux pages publiques

### Alternative : "Page Public Content Access"

Si "Page Public Metadata Access" n'est pas disponible, essayez :
1. Même processus que ci-dessus
2. Cherchez **"Page Public Content Access"** au lieu de "Page Public Metadata Access"
3. Cette feature offre un accès plus large mais nécessite généralement plus de justification

### 📚 Documentation officielle

- [Page Public Metadata Access](https://developers.facebook.com/docs/apps/review/feature#page-public-metadata-access)
- [Page Public Content Access](https://developers.facebook.com/docs/apps/review/feature#reference-PAGES_ACCESS)

## ⚠️ Problème : J'ai les permissions mais ça ne fonctionne toujours pas (autre cause)

Si vous avez configuré le System User Token avec toutes les permissions mais que vous obtenez toujours l'erreur code 10, vérifiez :

### 1. Le token utilisé est bien le System User Token

**Test** : Dans Graph API Explorer, testez :
```
GET /me?access_token={votre-token}
```

- ✅ **Si ça retourne des infos sur un System User** → C'est le bon type de token
- ❌ **Si ça retourne vos infos personnelles** → C'est un User Token, pas un System User Token

### 2. Les permissions sont bien accordées

**Test** : Dans Graph API Explorer, testez :
```
GET /me/permissions?access_token={votre-token}
```

Vous devriez voir dans la réponse :
```json
{
  "data": [
    {
      "permission": "pages_read_engagement",
      "status": "granted"  ← Doit être "granted"
    },
    {
      "permission": "pages_read_user_content",
      "status": "granted"  ← Doit être "granted"
    }
  ]
}
```

Si le status est `declined` ou si la permission n'apparaît pas, régénérez le token.

### 3. L'application Facebook nécessite peut-être une review

**Certaines permissions nécessitent une review de Facebook**, notamment :
- `pages_read_user_content` - Pour accéder aux contenus publics des pages

**Vérifier** :
1. Allez sur [developers.facebook.com/apps](https://developers.facebook.com/apps)
2. Sélectionnez votre application
3. Allez dans **"Révision de l'app"** ou **"App Review"**
4. Vérifiez si `pages_read_user_content` nécessite une review

**Si une review est nécessaire** :
- Vous devrez soumettre votre application pour review
- Expliquer comment vous utilisez cette permission
- Fournir des captures d'écran et une démonstration
- Facebook validera ou rejettera la demande
- Cela peut prendre plusieurs jours/semaines

**Alternative si la review est bloquante** :
- Si possible, ajoutez la page à votre application Facebook
- Ou utilisez une page que vous administrez directement

### 4. Le token dans .env.local est à jour

- ✅ Vérifiez que le token dans `.env.local` est bien le System User Token récent
- ✅ Vérifiez qu'il n'y a pas d'espaces ou de guillemets autour du token
- ✅ Redémarrez le serveur après modification de `.env.local`

### 5. Régénérer le token

Parfois, régénérer complètement le token peut résoudre le problème :

1. Business Manager → Paramètres → Utilisateurs système
2. Supprimez l'ancien token
3. Générez un nouveau token avec toutes les permissions
4. Testez-le immédiatement dans Graph API Explorer :
   ```
   GET /{page-id}/events?access_token={nouveau-token}
   ```
5. Si ça fonctionne dans Graph API Explorer, mettez-le dans `.env.local`
6. Redémarrez le serveur

### 6. Tester l'accès à la page directement

Testez si le token peut accéder à la page :
```
GET /{page-id}?fields=id,name&access_token={votre-token}
```

- ✅ Si ça fonctionne → Le token a accès à la page
- ❌ Si ça ne fonctionne pas → Le problème vient de là (page privée, permissions insuffisantes, etc.)

## Étape 6 : Configurer le renouvellement automatique (optionnel mais recommandé)

Les System User Tokens peuvent expirer après une longue période. Pour éviter les problèmes, vous pouvez :

### Option A : Renouveler manuellement périodiquement (2025)

**Si le token est configuré pour ne jamais expirer** : Aucun renouvellement nécessaire ! ✅

**Si le token a une durée limitée** :
1. Vérifiez régulièrement (tous les 30-60 jours) dans Business Manager si le token est toujours valide
2. Si nécessaire, régénérez un nouveau token pour votre System User
3. Mettez à jour `FACEBOOK_ACCESS_TOKEN` dans vos variables d'environnement
4. Redémarrez votre application pour charger le nouveau token

### Option B : Créer un script de renouvellement automatique (Avancé)

Pour la production avec tokens à durée limitée, vous pouvez créer un script qui :

1. Vérifie périodiquement si le token est toujours valide en testant une requête API
2. Génère un nouveau token via l'API Business Manager (nécessite des permissions spéciales et l'App Secret)
3. Met à jour automatiquement la variable d'environnement ou le service de secrets

**Exemple de vérification de token (2025)** :
```javascript
async function checkTokenValidity(token) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/me?access_token=${token}`
    );
    return response.ok;
  } catch {
    return false;
  }
}
```

**Note 2025** : Cette option avancée nécessite l'utilisation de l'API Business Manager et des tokens de service supplémentaires. Pour la plupart des cas, un token configuré pour ne jamais expirer est suffisant.

---

## Configuration dans le projet

### 1. Ajouter l'ID de page dans les organisateurs

Dans l'interface admin de votre application :

1. Allez dans **"Gestion des organisateurs"**
2. Éditez ou créez un organisateur
3. Remplissez le champ **"ID de page Facebook"** avec l'ID numérique de la page
4. Sauvegardez

### 2. Tester l'importation

1. Dans l'interface admin, allez dans **"Gestion des organisateurs"**
2. Cliquez sur **"Importer depuis Facebook"**
3. Sélectionnez un organisateur avec un `facebook_page_id` configuré
4. Cliquez sur **"Récupérer les événements Facebook"**

Si tout fonctionne, vous devriez voir la liste des événements de la page.

---

## Dépannage

### Erreur : "No permissions available" lors de la génération du token

**Symptôme** : Lors de la création d'un token pour le System User, vous voyez le message "No permissions available" ou "Aucune permission disponible" et ne pouvez pas continuer.

**Causes possibles** :
1. L'application Facebook n'a pas les produits nécessaires activés (⭐ **Cause la plus fréquente**)
2. L'application est en mode "Hors ligne" ou non configurée
3. Les permissions n'ont pas encore été propagées (délai Facebook)

**Solutions** :

#### Solution 1 : Ajouter le produit Facebook Login ⭐ RECOMMANDÉ

1. Retournez dans votre application Facebook sur [developers.facebook.com/apps](https://developers.facebook.com/apps/)
2. Sélectionnez votre application
3. Dans le menu de gauche, cliquez sur **"Ajouter un produit"** (ou "Add Product")
4. Recherchez **"Facebook Login"** (ou "Connexion Facebook")
5. Cliquez sur **"Configurer"** ou **"Set Up"**
6. Acceptez les conditions d'utilisation si demandé
7. Les paramètres de base peuvent être laissés par défaut pour commencer
8. Retournez dans Business Manager et réessayez de générer le token

#### Solution 2 : Vérifier l'état de l'application

1. Dans votre application Facebook, allez dans **"Paramètres"** → **"Paramètres de base"**
2. Vérifiez que l'application est en mode **"Développement"** ou **"Live"** (pas "Hors ligne")
3. Si l'application est "Hors ligne", passez-la en mode "Développement"

#### Solution 3 : Attendre la propagation

1. Après avoir ajouté Facebook Login, attendez 5-10 minutes
2. Rafraîchissez la page dans Business Manager
3. Réessayez de générer le token

#### Solution 4 : Vérifier le mode de l'application

1. Dans votre application Facebook, vérifiez le mode dans le bandeau en haut
2. Si l'application est en mode "Développement", assurez-vous que vous êtes bien connecté avec un compte développeur
3. Les permissions peuvent ne pas être disponibles si l'application n'est pas correctement configurée

**Note** : Une fois Facebook Login ajouté, les permissions suivantes devraient être disponibles :
- `pages_read_engagement`
- `pages_show_list`
- `pages_read_user_content`
- Et d'autres permissions liées aux pages

**Voir aussi** : Étape 1.2 pour plus de détails sur l'ajout des produits.

### Erreur : "Invalid OAuth 2.0 Access Token" (Code 190)

**Causes possibles (2025)** :
- Le token a expiré (rare avec System User Token configuré pour ne jamais expirer)
- Le token a été révoqué dans Business Manager
- Le token n'a pas les bonnes permissions
- Le token a été compromis et Facebook l'a désactivé

**Solution** :
1. Vérifiez dans Business Manager que le token existe toujours et est actif
2. Testez le token avec une requête simple : `GET /me?access_token={token}`
3. Si invalide, régénérez un nouveau token pour le System User
4. Vérifiez que le System User a toujours accès à la page avec les permissions nécessaires
5. Assurez-vous que votre application Facebook est toujours active et en mode "Live" si nécessaire

### Erreur : "Insufficient permissions"

**Cause** : Le System User n'a pas les permissions nécessaires sur la page ou dans l'application.

**Solution** :
1. Vérifiez que le System User a bien le rôle "Administrateur" ou "Éditeur" sur la page
2. Vérifiez que le token a été généré avec les bonnes permissions (`pages_read_engagement`, `pages_show_list`)
3. Régénérez le token avec les permissions complètes

### Erreur : "Page not found" ou "Page access denied"

**Cause** : Le System User n'a pas accès à la page ou l'ID de page est incorrect.

**Solution** :
1. Vérifiez que le System User est bien assigné à la page dans Business Manager
2. Vérifiez que l'ID de page est correct (il s'agit de l'ID numérique, pas du nom de la page)
3. Pour trouver l'ID de page : Allez dans les paramètres de la page Facebook → À propos → L'ID de la page est affiché en bas

### Le token ne fonctionne pas pour certaines pages

**Cause** : Le System User n'a accès qu'aux pages qui lui ont été explicitement assignées dans Business Manager.

**Solution (2025)** :
1. Dans Business Manager, allez dans **"Paramètres"** → **"Comptes"** → **"Pages"**
2. Pour chaque page nécessaire :
   - Cliquez sur la page
   - Allez dans **"Affecter des personnes"**
   - Ajoutez votre System User (pas votre compte personnel)
   - Donnez-lui au minimum le rôle **"Éditeur"** (ou "Administrateur" si vous avez besoin de permissions complètes)
3. Vérifiez que la page est bien liée au Business Manager (pas seulement au compte personnel)
4. Attendez quelques minutes pour que les changements se propagent

**Note 2025** : Facebook peut prendre jusqu'à 15 minutes pour propager les changements de permissions dans Business Manager.

---

## Sécurité et bonnes pratiques

### 🔒 Sécurité

1. **Ne commitez jamais le token** : Vérifiez que `.env.local` est dans `.gitignore`
2. **Utilisez des variables d'environnement** : Ne jamais hardcoder le token dans le code
3. **Limitez les permissions** : N'accordez au System User que les permissions strictement nécessaires
4. **Surveillez l'utilisation** : Vérifiez périodiquement dans Business Manager que le token n'a pas été compromis

### 📋 Bonnes pratiques (2025)

1. **Utilisez des tokens différents par environnement** : Un token pour le développement, un autre pour la production
2. **Configurez le token pour ne jamais expirer** : Lors de la génération, cochez l'option si disponible
3. **Documentez votre configuration** : Notez quel System User est utilisé pour quelle fonctionnalité
4. **Testez régulièrement** : Vérifiez que le token fonctionne encore avant chaque déploiement majeur
5. **Ayez un plan de secours** : Gardez un token de backup au cas où le principal serait révoqué
6. **Surveillez les changements de politique Facebook** : Facebook peut modifier les permissions ou les processus (abonnez-vous aux notifications développeur)
7. **Utilisez des services de secrets management** : En production, utilisez des outils comme Vercel Environment Variables, AWS Secrets Manager, ou équivalent

---

## Comparaison des méthodes

| Méthode | Durée de validité | Complexité | Recommandé pour | Note 2025 |
|---------|------------------|------------|-----------------|-----------|
| **User Access Token** | 1-2 heures | ⭐ Facile | Tests rapides | - |
| **Page Access Token (court terme)** | 1-2 heures | ⭐⭐ Facile | Tests | - |
| **Page Access Token (long terme)** | 60 jours | ⭐⭐ Facile | Développement | Nécessite renouvellement |
| **System User Token** | Indéfini (si configuré) | ⭐⭐⭐ Moyen | **Production** | **Recommandé pour 2025** |

**Note 2025** : Le System User Token peut maintenant être configuré pour ne jamais expirer lors de sa création, ce qui en fait la solution idéale pour la production.

---

## Ressources utiles (2025)

- [Facebook Business Manager](https://business.facebook.com/) - Gérer votre Business Manager
- [Facebook Developers - Applications](https://developers.facebook.com/apps/) - Gérer vos applications
- [Facebook Developers - System Users](https://developers.facebook.com/docs/marketing-api/system-users) - Documentation officielle
- [Facebook Business Manager - Utilisateurs système](https://business.facebook.com/settings/system-users) - Interface de gestion
- [Graph API Explorer](https://developers.facebook.com/tools/explorer/) - Tester l'API Graph
- [Documentation Facebook Graph API - Pages](https://developers.facebook.com/docs/graph-api/reference/page/) - API Pages
- [Documentation Facebook Graph API - Events](https://developers.facebook.com/docs/graph-api/reference/page/events/) - API Events
- [Facebook Developers - Access Tokens](https://developers.facebook.com/docs/facebook-login/access-tokens/) - Guide des tokens
- [Politiques Facebook pour les développeurs](https://developers.facebook.com/policy/) - Règles et politiques (2025)

---

## Checklist de configuration

- [ ] Application Facebook créée
- [ ] **Produit "Facebook Login" ajouté à l'application** ⭐
- [ ] App ID et App Secret notés en sécurité
- [ ] Business Manager configuré (si nécessaire)
- [ ] System User créé dans Business Manager
- [ ] **Permissions disponibles lors de la génération du token** (si "No permissions available", voir dépannage)
- [ ] Token généré pour le System User
- [ ] Permissions accordées (`pages_read_engagement`, `pages_show_list`, `pages_read_user_content`)
- [ ] System User assigné à la/les page(s) avec le bon rôle
- [ ] Token ajouté dans `.env.local`
- [ ] Token testé avec une requête API
- [ ] ID de page configuré dans les organisateurs
- [ ] Importation testée dans l'interface admin

Une fois toutes ces étapes complétées, vous devriez avoir un système robuste pour récupérer les événements Facebook en production ! 🎉

---

## Changements importants en 2025

### Nouveautés et mises à jour

- ✅ **Tokens sans expiration** : Les System User Tokens peuvent maintenant être configurés pour ne jamais expirer directement lors de la création
- ⚠️ **Vérification de compte renforcée** : Facebook demande plus souvent la vérification via Accounts Center lors de la création d'applications
- 📱 **Interface Business Manager améliorée** : La gestion des System Users est maintenant plus intuitive
- 🔒 **Sécurité renforcée** : Facebook recommande fortement l'utilisation de secrets management en production

### Versions d'API

- **API Graph v21.0** : Version recommandée en 2025
- Les anciennes versions (v12.0, etc.) continuent de fonctionner mais peuvent être dépréciées à l'avenir

### Notes importantes

- Les politiques Facebook peuvent changer. Vérifiez régulièrement la [documentation officielle](https://developers.facebook.com/docs/)
- Abonnez-vous aux notifications développeur pour être informé des changements majeurs
- Testez régulièrement votre intégration pour détecter les problèmes rapidement

