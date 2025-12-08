# Récupérer les événements de pages Facebook publiques (2025)

Ce guide explique comment récupérer les événements de pages Facebook publiques qui ne vous appartiennent pas.

## Limites et possibilités (2025)

Facebook a restreint l'accès aux données des pages publiques ces dernières années. Cependant, il est toujours possible de récupérer les **événements publics** d'une page avec les bonnes permissions et le bon type de token.

### Ce qui fonctionne ✅

- ✅ Récupérer les événements publics de pages Facebook
- ✅ Utiliser un System User Token avec les bonnes permissions ET la Feature activée
- ✅ Accéder aux informations publiques : nom, date, lieu, description, image de couverture

### Limitations ⚠️

- ⚠️ **Feature obligatoire** : L'application Facebook doit activer "Page Public Metadata Access" ou "Page Public Content Access"
- ⚠️ **Review nécessaire** : Cette feature peut nécessiter une review de Facebook (plusieurs jours/semaines)
- ⚠️ **Seuls les événements publics** sont accessibles (pas les événements privés)
- ⚠️ Certaines pages peuvent avoir des restrictions supplémentaires
- ⚠️ Le nombre d'événements récupérés peut être limité
- ⚠️ Certaines informations peuvent ne pas être disponibles selon les paramètres de confidentialité de la page

## Configuration requise

### 1. ⭐ FEATURE OBLIGATOIRE dans l'application Facebook

**🔴 CRUCIAL** : Pour accéder aux pages publiques qui ne sont pas dans votre application Facebook, vous devez activer une **Feature** dans votre app. Cette feature se trouve dans **"App Review"** / **"Révision de l'app"**, PAS dans une section "Fonctionnalités" séparée.

#### Option A : "Page Public Metadata Access" (Recommandé pour 2025)

**📍 OÙ TROUVER LA FEATURE (2025) - Instructions détaillées :**

1. **Allez sur** https://developers.facebook.com/apps
2. **Sélectionnez votre application Facebook**
3. **Dans le menu de gauche, cliquez sur** :
   - **"Révision de l'app"** (en français)
   - OU **"App Review"** (en anglais)
   - ⚠️ **C'est ICI que se trouvent toutes les features**, pas dans une section "Fonctionnalités" séparée

4. **Dans la page App Review / Révision de l'app** :
   - Vous verrez une liste de toutes les permissions et features disponibles
   - **Cherchez** dans cette liste : **"Page Public Metadata Access"**
   - Utilisez la **barre de recherche** de la page si disponible
   - OU faites défiler pour trouver la section "Features" ou "Fonctionnalités" dans cette page

5. **Une fois trouvé** :
   - Cliquez sur **"Demander l'accès"** ou **"Request Access"** à côté de cette feature
   - OU cliquez directement sur le nom de la feature pour voir les détails

6. **Remplissez le formulaire de demande** :
   - **Justification** : Expliquez que vous affichez les événements publics de pages Facebook
   - **Captures d'écran** : Montrez votre interface admin et comment vous utilisez les données
   - **Démonstration** : Fournissez une vidéo ou instructions pour tester

💡 **Si vous ne voyez toujours pas la feature** :
- Vérifiez que votre application est en mode **"Développement"** ou **"Live"**
- Certaines features peuvent ne pas apparaître si l'app est en mode "Test" ou non active
- Essayez de chercher directement via la documentation : https://developers.facebook.com/docs/apps/review/feature#page-public-metadata-access

#### Option B : "Page Public Content Access" (Alternative)

1. **Même processus** : Allez dans **"Révision de l'app"** ou **"App Review"**
2. Cherchez **"Page Public Content Access"** dans la liste
3. Cette feature offre un accès plus large mais nécessite généralement plus de justification

⚠️ **REVIEW NÉCESSAIRE** : Ces features nécessitent généralement une **review de Facebook** qui peut prendre plusieurs jours/semaines.

📚 Documentation Facebook :
- [Page Public Metadata Access](https://developers.facebook.com/docs/apps/review/feature#page-public-metadata-access)
- [Page Public Content Access](https://developers.facebook.com/docs/apps/review/feature#reference-PAGES_ACCESS)

### 2. Permissions nécessaires sur le token

Une fois la Feature activée (et approuvée si review nécessaire), votre System User Token doit avoir ces permissions :

- `pages_read_engagement` - **⭐ OBLIGATOIRE** : Pour lire les événements des pages
- `pages_read_user_content` - **Recommandé** : Peut aider selon la feature utilisée
- `pages_show_list` - **Recommandé** : Pour lister les pages accessibles

⚠️ **IMPORTANT** : Les permissions seules ne suffisent pas - la Feature doit être activée dans l'app !

### 3. Type de token

Vous pouvez utiliser :

- ✅ **System User Token** (recommandé pour la production) - Voir [Guide System User](FACEBOOK_SYSTEM_USER_SETUP.md)
- ✅ **Page Access Token** - Pour les pages que vous administrez
- ⚠️ **User Access Token** - Fonctionne pour les tests, mais limité en durée

**⚠️ IMPORTANT** : 
- **Pour les pages qui NE SONT PAS dans votre application Facebook** : Vous DEVEZ utiliser un **System User Token** avec `pages_read_user_content`. Un Page Access Token ne fonctionnera PAS pour ces pages.
- **Pour les pages qui SONT dans votre application Facebook** : Vous pouvez utiliser un Page Access Token ou un System User Token.

**Différence cruciale** :
- ❌ Page Access Token → Fonctionne UNIQUEMENT pour les pages liées à votre app
- ✅ System User Token → Fonctionne pour TOUTES les pages publiques (avec `pages_read_user_content`)

## Configuration dans le projet

### Méthode 1 : Utiliser un System User Token (⭐ OBLIGATOIRE pour pages hors de votre app)

**⚠️ IMPORTANT** : Si la page que vous voulez accéder **n'est pas dans votre application Facebook**, cette méthode est **OBLIGATOIRE**. Un Page Access Token ne fonctionnera pas.

1. Suivez le [Guide System User Token](FACEBOOK_SYSTEM_USER_SETUP.md) pour créer un System User Token
2. Lors de la génération du token, assurez-vous d'inclure les permissions :
   - `pages_read_engagement` (requis)
   - `pages_show_list` (requis)
   - `pages_read_user_content` ⭐ **OBLIGATOIRE pour les pages publiques/hors app**
3. Le System User Token peut accéder aux événements publics de **toutes les pages publiques**, même celles :
   - Que vous n'administrez pas
   - Qui ne sont pas dans votre application Facebook

### Méthode 2 : Obtenir un token via Graph API Explorer (Tests - UNIQUEMENT pour pages dans votre app)

**⚠️ LIMITATION** : Cette méthode fonctionne UNIQUEMENT pour les pages qui sont dans votre application Facebook.

1. Allez sur [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Créez ou sélectionnez votre application Facebook
3. Obtenez un User Access Token avec les permissions :
   - `pages_read_engagement`
   - `pages_show_list`
   - `pages_read_user_content` (pour pages publiques)
4. Faites une requête `GET /me/accounts` pour obtenir vos Page Access Tokens
5. Utilisez le Page Access Token de la page (si elle est dans votre app)

**🔴 Si vous obtenez l'erreur "Page Public Content Access" ou code 10, c'est que la page n'est pas dans votre app → Utilisez Méthode 1 (System User Token)**

## Utilisation

### Dans l'interface admin

1. Allez dans **"Gestion des organisateurs"**
2. Créez ou éditez un organisateur
3. Dans le champ **"ID de page Facebook"**, entrez l'ID de la page publique (qui ne vous appartient pas)
4. Sauvegardez
5. Cliquez sur **"Importer depuis Facebook"**
6. Sélectionnez l'organisateur avec l'ID de la page publique
7. Cliquez sur **"Récupérer les événements Facebook"**

### Via l'API directement

Vous pouvez tester directement avec curl :

```bash
# Remplacez {page-id-public} par l'ID de la page publique
# Remplacez {your-token} par votre token avec permissions pages_read_user_content
curl "https://graph.facebook.com/v21.0/{page-id-public}/events?fields=id,name,description,start_time,end_time,place&access_token={your-token}&limit=100"
```

## Trouver l'ID d'une page publique

### Méthode 1 : Via l'URL Facebook

L'ID de la page est souvent dans l'URL de la page :
- `https://www.facebook.com/username` → L'ID peut être trouvé via l'API
- `https://www.facebook.com/pages/Nom-de-la-page/123456789` → `123456789` est l'ID

### Méthode 2 : Via l'API Graph

```bash
# Utilisez le nom d'utilisateur ou l'URL de la page
curl "https://graph.facebook.com/v21.0/{page-username}?fields=id,name&access_token={your-token}"
```

### Méthode 3 : Dans les paramètres de la page (si vous y avez accès)

Si vous avez accès à la page :
1. Allez dans les **Paramètres** de la page
2. Faites défiler jusqu'à **"À propos"**
3. L'ID de la page est affiché en bas

### Méthode 4 : Outils en ligne

Vous pouvez utiliser des outils comme [findmyfbid.com](https://findmyfbid.com/) pour trouver l'ID d'une page Facebook.

## Gestion des erreurs

### Erreur : "Permissions insuffisantes" (Code 10)

**Cause** : Le token n'a pas la permission `pages_read_user_content`

**Solution** :
1. Régénérez votre System User Token ou Page Access Token
2. Assurez-vous d'inclure la permission `pages_read_user_content`
3. Pour les System Users : Allez dans Business Manager → Utilisateurs système → Modifiez le token avec les bonnes permissions

### Erreur : "Accès refusé" (Code 200 ou 803)

**Causes possibles** :
- La page est privée (pas publique)
- Les événements de la page sont privés
- Le token n'a pas accès à cette page spécifique
- La page a des restrictions géographiques ou autres

**Solution** :
1. Vérifiez que la page et ses événements sont publics
2. Essayez avec un autre token (System User Token plutôt qu'un Page Access Token)
3. Vérifiez que la permission `pages_read_user_content` est bien incluse

### Erreur : "Page not found" (Code 100)

**Cause** : L'ID de page est incorrect ou la page n'existe plus

**Solution** :
1. Vérifiez que l'ID de page est correct
2. Testez l'ID avec une requête simple : `GET /{page-id}?fields=id,name`
3. Assurez-vous que la page est toujours active

## Bonnes pratiques

### 🔒 Respect de la vie privée

1. **Respectez les paramètres de confidentialité** : Ne récupérez que les événements publics
2. **Conformité** : Respectez les [Conditions d'utilisation de Facebook](https://www.facebook.com/legal/terms)
3. **Données** : Ne stockez pas d'informations privées ou sensibles

### 📋 Limites et quotas

1. **Limite de requêtes** : Facebook limite le nombre de requêtes par heure selon votre type d'application
2. **Limite d'événements** : Utilisez le paramètre `limit` (max 100 par requête)
3. **Pagination** : Pour récupérer plus d'événements, utilisez la pagination avec `after` et `before`

### 🔄 Actualisation

1. **Fréquence** : Ne récupérez les événements que lorsque nécessaire (pas en continu)
2. **Cache** : Considérez la mise en cache pour éviter les requêtes répétées
3. **Mise à jour** : Les événements peuvent être créés, modifiés ou supprimés à tout moment

## Exemple complet

### Étape 1 : Configuration du token

```env
# .env.local
FACEBOOK_ACCESS_TOKEN=votre_system_user_token_avec_pages_read_user_content
```

### Étape 2 : Test dans l'interface admin

1. Créer un organisateur avec l'ID d'une page publique
2. Cliquer sur "Importer depuis Facebook"
3. Vérifier que les événements publics sont bien récupérés

### Étape 3 : Vérification

Les événements publics devraient apparaître avec :
- ✅ Nom de l'événement
- ✅ Date et heure de début/fin
- ✅ Lieu (si public)
- ✅ Description (si publique)
- ✅ Image de couverture (si publique)

## Résumé

Pour récupérer les événements de pages publiques qui ne vous appartiennent pas :

1. ✅ Utilisez un **System User Token** ou **Page Access Token**
2. ✅ Incluez la permission **`pages_read_user_content`** ⭐
3. ✅ Vérifiez que la page et ses événements sont **publics**
4. ✅ Utilisez l'ID correct de la page publique
5. ✅ Respectez les limites et quotas de l'API Facebook

---

## Ressources

- [Facebook Graph API - Pages Events](https://developers.facebook.com/docs/graph-api/reference/page/events/)
- [Facebook Graph API - Permissions](https://developers.facebook.com/docs/permissions/)
- [Politiques Facebook pour développeurs](https://developers.facebook.com/policy/)
- [Guide System User Token](FACEBOOK_SYSTEM_USER_SETUP.md)
- [Guide général Facebook](FACEBOOK_SETUP.md)

