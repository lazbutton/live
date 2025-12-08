# Instructions de Test pour la Review Facebook

## Instructions pour accéder et tester l'application

### Accès à l'Application

**URL de l'application :** `https://www.live-orleans.fr/admin/login`


**Note :** L'application doit être accessible publiquement pour la review. Si elle est en développement local uniquement, vous devrez la déployer temporairement (Vercel, Netlify, etc.).

---

## Navigation et Test de la Fonctionnalité Facebook

### 1. Connexion à l'interface d'administration

**Étape 1 : Accéder à la page de connexion**
- Ouvrez votre navigateur et allez à : `https://www.live-orleans.fr/admin/login`
- Vous verrez la page de connexion de l'interface d'administration

**Étape 2 : Se connecter**
- Utilisez un compte administrateur avec les identifiants suivants :
  - **Email :** test@admin.com
  - **Mot de passe :** y.pX8Jj4PVaS*.@
- Cliquez sur "Se connecter"
- Vous serez redirigé vers le tableau de bord administratif

---

### 2. Accéder à la fonctionnalité d'importation Facebook

**Étape 3 : Navigation vers la gestion des organisateurs**
- Dans le menu latéral (ou la navigation mobile), cliquez sur **"Organisateurs"**
- Vous verrez la liste des organisateurs enregistrés dans le système

**Étape 4 : Ouvrir l'importateur Facebook**
- Dans la liste des organisateurs, cherchez un organisateur qui a un **"ID de page Facebook"** configuré
- Cliquez sur le bouton **"Importer depuis Facebook"** à côté de cet organisateur
- OU cliquez sur le bouton **"Importer depuis Facebook"** dans la barre d'actions

**Alternative :** Si aucun organisateur n'a d'ID Facebook configuré :
- Créez un nouvel organisateur ou modifiez un existant
- Dans le formulaire, ajoutez un **"ID de page Facebook"** (par exemple : `100063662165255` ou un ID de page Facebook publique valide)
- Sauvegardez l'organisateur
- Retournez à la liste et cliquez sur **"Importer depuis Facebook"**

---

### 3. Tester l'importation d'événements Facebook

**Étape 5 : Sélectionner un organisateur**
- Dans le dialogue qui s'ouvre, vous verrez un sélecteur **"Sélectionner un organisateur"**
- Sélectionnez l'organisateur avec l'ID de page Facebook configuré
- La liste affichera les organisateurs avec leurs noms, et les lieux (qui peuvent aussi être organisateurs) seront marqués avec "(Lieu)"

**Étape 6 : Récupérer les événements Facebook**
- Cliquez sur le bouton **"Récupérer les événements Facebook"**
- L'application va appeler l'API Graph Facebook (`GET /{page-id}/events`) via notre route API `/api/facebook/events`
- Vous verrez un indicateur de chargement pendant la récupération

**Étape 7 : Examiner les événements récupérés**
- Une fois la récupération terminée, vous verrez une liste des événements publics récupérés
- Pour chaque événement, vous verrez :
  - **Nom de l'événement** (depuis `name`)
  - **Description** (depuis `description` - si publique)
  - **Date de début** (depuis `start_time`)
  - **Date de fin** (depuis `end_time` - si disponible)
  - **Lieu** (depuis `place` - nom et adresse publique)
  - **Image de couverture** (depuis `cover` - si publique)

**Vérifications importantes :**
- ✅ Seuls les **événements publics** sont affichés
- ✅ Les données correspondent aux informations publiques de la page Facebook
- ✅ Aucune donnée privée n'est visible

**Étape 8 : Sélectionner et créer des demandes**
- Cochez un ou plusieurs événements dans la liste
- Cliquez sur le bouton **"Créer des demandes d'événements"** (ou équivalent)
- Les événements sélectionnés seront transformés en "demandes d'événements" dans le système

---

### 4. Tester la validation manuelle

**Étape 9 : Accéder aux demandes**
- Dans le menu latéral, cliquez sur **"Demandes"** ou **"Gestion des demandes"**
- Vous verrez la liste des demandes créées, incluant celles issues de l'importation Facebook

**Étape 10 : Examiner une demande**
- Cliquez sur une demande pour voir ses détails
- Vérifiez que les informations de l'événement Facebook sont correctement importées :
  - Titre de l'événement
  - Description
  - Dates et horaires
  - Lieu et adresse
  - Image (si disponible)

**Étape 11 : Valider manuellement**
- En tant qu'administrateur, vous pouvez :
  - **Éditer** l'événement pour compléter ou corriger les informations
  - **Créer l'événement** pour le publier sur la plateforme
  - **Rejeter** la demande si elle n'est pas pertinente

**Point clé :** Aucun événement n'est publié automatiquement. Chaque événement importé doit être validé manuellement par un administrateur avant publication.

---

### 5. Vérifier la publication finale

**Étape 12 : Consulter les événements approuvés**
- Dans le menu, cliquez sur **"Événements"** ou **"Gestion des événements"**
- Vous verrez la liste des événements, incluant ceux créés depuis les demandes Facebook
- Vérifiez que les événements publiés conservent les liens vers les pages Facebook d'origine

---

## Informations d'Accès pour la Review

### Compte Administrateur de Test

Pour faciliter la review, un compte de test peut être créé avec les informations suivantes :

**Email de test :** `test@admin.com` (ou autre email que vous souhaitez)
**Mot de passe :** y.pX8Jj4PVaS*.@

**Instructions pour créer le compte :**
1. L'administrateur principal peut créer ce compte via l'interface
2. Ou le compte peut être créé directement dans Supabase avec le rôle admin

**Permissions nécessaires :**
- Accès complet à l'interface d'administration
- Possibilité d'importer des événements Facebook
- Possibilité de valider des demandes d'événements

---

### ID de Page Facebook pour Test

Pour tester la fonctionnalité, vous pouvez utiliser :

**Option 1 : Une page publique locale d'Orléans**
- Sélectionnez une page Facebook publique d'un organisateur local d'Orléans
- Assurez-vous que la page a des événements publics publiés

**Option 2 : Une page de test fournie**
- [À fournir - ID de page Facebook publique avec des événements publics pour test]

**Comment trouver un ID de page Facebook :**
1. Allez sur la page Facebook publique
2. Cliquez sur "À propos" → "Informations de la page"
3. Faites défiler jusqu'à "ID de page"
4. Copiez l'ID numérique (format : `123456789012345`)

---

## Confirmation : Utilisation de Facebook Login

### ❌ Facebook Login NON UTILISÉ

**Confirmation :** Notre application **n'utilise PAS Facebook Login** pour l'authentification.

**Authentification utilisée :**
- Nous utilisons **Supabase Auth** pour l'authentification des administrateurs
- Les utilisateurs se connectent avec email/mot de passe via notre interface de connexion personnalisée
- Aucune intégration avec Facebook Login n'est implémentée

**Pourquoi Facebook Login n'est pas utilisé :**
- Notre application est une interface d'administration pour les gestionnaires de la plateforme
- L'authentification email/mot de passe via Supabase est suffisante et sécurisée pour nos besoins
- Nous n'avons pas besoin de l'authentification sociale pour cette fonctionnalité
- Notre utilisation de l'API Facebook se limite exclusivement à la récupération de métadonnées publiques d'événements via l'API Graph

**API Facebook utilisée :**
- ✅ **API Graph Facebook** : Pour récupérer les événements publics des pages (`GET /{page-id}/events`)
- ❌ **Facebook Login** : Non utilisé
- ❌ **Permissions utilisateur Facebook** : Non utilisées (pas d'authentification Facebook)

**Résumé :**
Nous utilisons uniquement l'API Graph Facebook en lecture seule pour accéder aux métadonnées publiques d'événements. Aucune authentification Facebook, aucune permission utilisateur, et aucune intégration Facebook Login n'est utilisée dans notre application.

---

## Instructions Générales pour Tester

### Prérequis

1. **Accès à l'application déployée** (URL fournie ci-dessus)
2. **Compte administrateur** (identifiants fournis ci-dessus)
3. **Page Facebook publique avec événements publics** (pour tester l'importation)

### Checklist de Test

Pour que la review soit complète, veuillez tester :

- [ ] ✅ **Connexion** : Pouvoir se connecter à l'interface d'administration
- [ ] ✅ **Navigation** : Accéder à la gestion des organisateurs
- [ ] ✅ **Configuration** : Créer/modifier un organisateur avec un ID de page Facebook
- [ ] ✅ **Importation** : Ouvrir l'importateur Facebook et sélectionner un organisateur
- [ ] ✅ **Récupération** : Récupérer les événements publics depuis une page Facebook
- [ ] ✅ **Données publiques** : Vérifier que seules les données publiques sont récupérées
- [ ] ✅ **Création de demandes** : Créer des demandes d'événements depuis les événements Facebook
- [ ] ✅ **Validation** : Accéder aux demandes et examiner les informations importées
- [ ] ✅ **Validation manuelle** : Valider manuellement un événement importé
- [ ] ✅ **Publication** : Vérifier que l'événement validé apparaît dans la liste des événements

### Points Clés à Vérifier

1. **Respect de la vie privée :**
   - Seuls les événements publics sont accessibles
   - Aucune donnée privée n'est récupérée
   - Les informations correspondent aux données publiques de Facebook

2. **Validation humaine :**
   - Les événements importés ne sont pas publiés automatiquement
   - Une étape de validation manuelle est requise
   - L'administrateur peut éditer/compléter les informations avant publication

3. **Transparence :**
   - Les événements publiés créditent les pages Facebook d'origine
   - Les liens vers les pages Facebook sont préservés

---

## Support Technique

### En cas de problème

Si vous rencontrez des difficultés lors du test :

1. **Erreur d'authentification :**
   - Vérifiez que vous utilisez les identifiants fournis
   - Contactez-nous si le compte de test nécessite une création

2. **Erreur lors de l'importation Facebook :**
   - Vérifiez que l'ID de page Facebook est correct (format numérique uniquement)
   - Vérifiez que la page a des événements publics
   - Vérifiez que le token Facebook est configuré (côté serveur)

3. **Aucun événement récupéré :**
   - Vérifiez que la page Facebook a bien des événements publics publiés
   - Vérifiez que la page est accessible publiquement
   - Contactez-nous si le problème persiste

### Contact

**Email :** lazbutton@gmail.com
**Adresse :** 1 Av. du Champ de Mars, 45100 Orléans, France

Nous sommes disponibles pour fournir des informations complémentaires ou résoudre tout problème technique rencontré lors de la review.

---

## Informations Complémentaires

### Architecture Technique

**Backend :**
- Framework : Next.js 16 avec App Router
- API Routes : `/api/facebook/events` pour la récupération des événements
- Base de données : Supabase (PostgreSQL)
- Authentification : Supabase Auth (email/password)

**Frontend :**
- Framework : Next.js avec React
- Interface d'administration : Composants React avec shadcn/ui
- Routes protégées : Middleware Next.js pour vérifier l'authentification admin

**Intégration Facebook :**
- API utilisée : Facebook Graph API v21.0
- Endpoint : `GET /{page-id}/events?fields=name,description,start_time,end_time,place,cover`
- Token : System User Token avec permissions `pages_read_engagement` et `pages_read_user_content`
- Scope : Accès en lecture seule aux métadonnées publiques d'événements

### Sécurité

- Toutes les routes API sont protégées par authentification Supabase
- Seuls les administrateurs peuvent accéder à l'interface d'importation
- Le token Facebook est stocké côté serveur uniquement (variable d'environnement)
- Validation et sanitization des données avant stockage

---

## Résumé pour la Review

**Fonctionnalité testée :** Importation d'événements publics depuis des pages Facebook via l'API Graph

**Utilisation de Facebook Login :** ❌ Non utilisé

**API Facebook utilisée :** ✅ API Graph uniquement (métadonnées publiques d'événements)

**Permissions requises :** `pages_read_engagement` et `pages_read_user_content` (via System User Token)

**Données collectées :** Uniquement métadonnées publiques (nom, description publique, dates, lieu public, image publique)

**Validation :** Manuelle et obligatoire avant publication

**Conformité :** RGPD, respect strict de la vie privée, accès aux données publiques uniquement

