# Configuration Facebook pour l'importation d'événements (2025)

**Dernière mise à jour : Janvier 2025**

Ce guide explique comment configurer l'intégration Facebook pour récupérer les événements d'une page Facebook en 2025.

> **📌 Note importante** : Cette fonctionnalité supporte **à la fois** les pages que vous administrez ET les pages publiques qui ne vous appartiennent pas. Consultez [Guide pour les pages publiques](FACEBOOK_PUBLIC_PAGES.md) pour accéder aux événements de pages qui ne vous appartiennent pas.

## Problème courant : "You can only complete this action in Accounts Center"

Cette erreur se produit généralement lorsque vous essayez d'utiliser un **User Access Token** pour accéder aux événements d'une page. Pour récupérer les événements d'une page Facebook, vous devez utiliser un **Page Access Token**.

## Solution : Obtenir un Page Access Token de longue durée

### Option 1 : Via Graph API Explorer (méthode rapide)

1. **Aller sur Graph API Explorer** : https://developers.facebook.com/tools/explorer/
2. **Sélectionner votre application Facebook** (ou créer-en une)
3. **Obtenir un User Access Token** :
   - Cliquez sur "Get Token" → "Get User Access Token"
   - Sélectionnez les permissions :
     - `pages_read_engagement` - ⭐ **OBLIGATOIRE** : Pour lire les événements de la page
     - `pages_show_list` - Pour lister vos pages
     - `pages_read_user_content` - ⭐ **Important** : Nécessaire pour les pages publiques qui ne vous appartiennent pas
   - Cliquez sur "Generate Access Token"
   - **⚠️ IMPORTANT** : Acceptez **TOUTES** les demandes dans le popup Facebook
   - **⚠️ VÉRIFICATION** : Si vous voyez une erreur "pages_read_engagement permission required", c'est que vous n'avez pas accepté la permission dans le popup

4. **Vérifier les permissions du User Access Token** (RECOMMANDÉ) :
   - Avant d'obtenir le Page Access Token, vérifiez que les permissions sont bien accordées :
   ```
   GET /me/permissions?access_token={votre-user-token}
   ```
   - Vous devriez voir `pages_read_engagement` avec `status: "granted"`
   - Si la permission n'est pas `granted`, régénérez le User Access Token et acceptez toutes les demandes

5. **Obtenir le Page Access Token** :
   - Une fois le User Access Token obtenu ET vérifié, utilisez cette requête dans Graph API Explorer :
   ```
   GET /me/accounts?access_token={votre-user-token}
   ```
   - Cette requête retournera la liste de vos pages avec leurs tokens d'accès
   - **⚠️ IMPORTANT** : Copiez le `access_token` dans la réponse (c'est le Page Access Token)
   - Ne copiez PAS le User Access Token que vous avez utilisé pour cette requête

5. **Convertir en Long-Lived Token** (recommandé pour les tests) :
   - Utilisez l'endpoint suivant avec votre User Access Token :
   ```
   GET /oauth/access_token?
     grant_type=fb_exchange_token&
     client_id={app-id}&
     client_secret={app-secret}&
     fb_exchange_token={short-lived-token}
   ```
   - Remplacez `{app-id}` et `{app-secret}` par les valeurs de votre application Facebook
   - Remplacez `{short-lived-token}` par le Page Access Token obtenu à l'étape 4
   - Le token résultant sera valide pour 60 jours

**Note 2025** : Pour la production, préférez l'Option 3 (System User Token) qui peut être configuré pour ne jamais expirer.

## Trouver l'ID d'une page Facebook

L'ID de page Facebook est un **nombre** (ex: `123456789012345`), pas un nom d'utilisateur (ex: `@nompage`).

### Méthode 1 : Via la page Facebook (le plus simple)

1. Allez sur la page Facebook concernée
2. Cliquez sur "À propos" (dans le menu de gauche)
3. Faites défiler jusqu'à trouver "ID de page" ou "Page ID"
4. Copiez le numéro affiché

### Méthode 2 : Via l'outil Facebook

1. Allez sur : https://www.facebook.com/help/contact/571927962365970
2. Entrez le nom ou l'URL de la page
3. L'outil vous donnera l'ID numérique

### Méthode 3 : Via l'API Graph (si vous avez un token)

Si vous avez déjà un User Access Token, vous pouvez utiliser :

```
GET /me/accounts
```

Cela retournera la liste de vos pages avec leurs IDs et leurs tokens.

### Méthode 4 : Via le code source de la page

1. Allez sur la page Facebook
2. Cliquez droit → "Afficher le code source de la page"
3. Recherchez `"page_id":"` ou `"entity_id":`
4. L'ID se trouve juste après

### ⚠️ Erreur courante : "does not exist" ou "cannot be loaded"

Cette erreur peut se produire si :

1. **L'ID est incorrect** : Vérifiez que vous utilisez bien l'ID numérique, pas le nom d'utilisateur
2. **Le token n'a pas accès** : Le token doit avoir les permissions `pages_read_engagement` et `pages_show_list`
3. **C'est une page publique** : Pour les pages qui ne vous appartiennent pas, ajoutez la permission `pages_read_user_content`
4. **Le token n'est pas un Page Access Token** : Vous devez utiliser un Page Access Token spécifique à la page, pas un User Access Token

### Option 2 : Créer une application Facebook (méthode recommandée pour la production)

1. **Créer une application Facebook** :
   - Allez sur https://developers.facebook.com/apps/
   - Cliquez sur "Créer une application"
   - Choisissez "Autre" comme type d'application
   - Suivez les étapes de configuration

   **⚠️ Note sur la vérification du compte** :
   - Facebook peut demander de vérifier votre compte via SMS dans le Accounts Center
   - Si vous voyez le message "You can only complete this action in Accounts Center" :
     1. Allez sur https://www.facebook.com/settings?tab=account_center (Accounts Center)
     2. Vérifiez votre numéro de téléphone ou ajoutez-en un
     3. Confirmez votre compte via SMS si demandé
     4. Retournez sur https://developers.facebook.com/apps/ pour créer l'application
   
   **Alternative si la vérification SMS bloque** :
   - Vous pouvez utiliser l'**Option 1** (Graph API Explorer) qui ne nécessite pas de créer une application
   - Ou créer l'application plus tard une fois la vérification terminée

2. **Ajouter le produit Facebook Login** :
   - Dans le tableau de bord de votre application, allez dans "Ajouter un produit"
   - Ajoutez "Facebook Login"

3. **Obtenir l'App ID et l'App Secret** :
   - Dans les paramètres de base de votre application, notez votre `App ID` et `App Secret`

4. **Obtenir un Page Access Token** :
   - Utilisez le [Graph API Explorer](https://developers.facebook.com/tools/explorer/) avec votre application
   - Suivez les étapes de l'Option 1 pour obtenir un Page Access Token

5. **Créer un token de longue durée** :
   - Le Page Access Token peut être converti en token de longue durée (60 jours)
   - Utilisez l'endpoint décrit dans l'Option 1, étape 5

### Option 3 : Utiliser un System User Token (pour la production) ⭐ RECOMMANDÉ POUR LA PRODUCTION

Cette méthode utilise un **System User** dans Facebook Business Manager pour obtenir un token qui ne expire pas (ou se renouvelle facilement). C'est la solution recommandée pour les environnements de production.

**Avantages** :
- ✅ Token qui ne expire pas (ou très long terme)
- ✅ Plus sécurisé pour la production
- ✅ Accès permanent aux pages
- ✅ Ne nécessite pas de ré-authentification manuelle

**Guide complet** : Voir [Configuration System User Token](FACEBOOK_SYSTEM_USER_SETUP.md) pour un guide pas à pas détaillé.

**Résumé rapide** :
1. Créer une application Facebook
2. Créer un System User dans Facebook Business Manager
3. Générer un token pour le System User avec les permissions nécessaires
4. Assigner le System User aux pages concernées
5. Utiliser ce token dans `FACEBOOK_ACCESS_TOKEN`

## Configuration dans le projet

Une fois que vous avez obtenu votre Page Access Token (ou Long-Lived Page Access Token) :

1. **Ajoutez-le dans votre `.env.local`** :
   ```env
   FACEBOOK_ACCESS_TOKEN=votre_page_access_token_ici
   ```

2. **Vérifiez que le token fonctionne** :
   - Testez avec l'endpoint suivant (remplacez `{page-id}` par l'ID de votre page) :
   ```
   GET https://graph.facebook.com/v21.0/{page-id}/events?access_token={votre-token}&limit=10
   ```
   - **Note 2025** : Ajoutez le paramètre `limit` pour spécifier le nombre d'événements (Facebook limite maintenant par défaut)

3. **Dans l'interface admin** :
   - Allez dans "Gestion des organisateurs"
   - Éditez un organisateur et ajoutez l'**ID numérique de la page Facebook** dans le champ "ID de page Facebook"
   - L'ID de la page peut être trouvé dans les paramètres de la page Facebook ou via l'API Graph

## Dépannage

### Erreur : "You can only complete this action in Accounts Center" lors de la création d'application

**Symptôme** : Lors de la création d'une application Facebook, vous voyez un message demandant d'aller dans le Accounts Center pour vérifier votre compte via SMS.

**Cause** : Facebook nécessite une vérification de compte pour créer des applications de développeur.

**Solution** :
1. Allez sur le [Accounts Center de Facebook](https://www.facebook.com/settings?tab=account_center)
2. Vérifiez que votre numéro de téléphone est confirmé
3. Si nécessaire, ajoutez un numéro de téléphone et confirmez-le via SMS
4. Retournez sur [Facebook Developers](https://developers.facebook.com/apps/) pour créer l'application

**Alternative** : Si la vérification SMS pose problème, vous pouvez utiliser l'**Option 1** (Graph API Explorer) qui ne nécessite pas de créer une application complète. Cette méthode est suffisante pour obtenir un Page Access Token et tester l'intégration.

### Erreur : "You can only complete this action in Accounts Center" lors de la récupération d'événements

**Cause** : Vous utilisez un User Access Token au lieu d'un Page Access Token

**Solution** : Obtenez un Page Access Token comme décrit dans l'Option 1 ci-dessus

### Erreur : "Invalid OAuth 2.0 Access Token"
- **Cause** : Le token a expiré ou est invalide
- **Solution** : Générez un nouveau Page Access Token et mettez à jour `FACEBOOK_ACCESS_TOKEN` dans `.env.local`

### Erreur : "Insufficient permissions"
- **Cause** : Le token n'a pas les permissions nécessaires
- **Solution** : Assurez-vous que le token a les permissions `pages_read_engagement` et `pages_show_list`

### Le token expire après quelques heures
- **Cause** : Vous utilisez un token de courte durée (Short-Lived Token)
- **Solution** : Convertissez-le en Long-Lived Token (60 jours) ou configurez un renouvellement automatique

## Ressources utiles

- [Graph API Explorer](https://developers.facebook.com/tools/explorer/) - Pour tester l'API et obtenir des tokens
- [Facebook Developers - Créer une application](https://developers.facebook.com/apps/)
- [Facebook Business Manager](https://business.facebook.com/) - Pour gérer les System Users
- [Accounts Center Facebook](https://www.facebook.com/settings?tab=account_center) - Pour vérifier votre compte
- [Documentation Facebook Graph API - Pages](https://developers.facebook.com/docs/graph-api/reference/page/)
- [Documentation Facebook Graph API - Access Tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/)
- [Documentation System Users](https://developers.facebook.com/docs/marketing-api/system-users)
- [Facebook App Dashboard](https://developers.facebook.com/apps/)

## Récupérer les événements de pages publiques

Si vous souhaitez récupérer les événements de pages Facebook **qui ne vous appartiennent pas**, consultez le [Guide pour pages publiques](FACEBOOK_PUBLIC_PAGES.md).

**Points importants** :
- ✅ C'est possible avec les bonnes permissions
- ✅ Utilisez la permission `pages_read_user_content` ⭐
- ✅ Seuls les événements publics sont accessibles

## Recommandation

### Pour tester rapidement (développement)
Utilisez l'**Option 1** (Graph API Explorer) qui ne nécessite pas de créer une application complète. Cette méthode permet d'obtenir un Page Access Token et de tester l'intégration immédiatement.

### Pour la production
Utilisez l'**Option 3** (System User Token) qui offre :
- Une stabilité à long terme
- Une meilleure sécurité
- Pas de renouvellement manuel régulier
- Accès aux événements de pages publiques (avec la permission `pages_read_user_content`)

Consultez le [guide complet System User Token](FACEBOOK_SYSTEM_USER_SETUP.md) pour les instructions détaillées.

