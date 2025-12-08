# Description pour la Review Facebook - Page Public Metadata Access

## Utilisation de la fonctionnalité "Page Public Metadata Access"

### Contexte de l'application

**Live Orléans** est une plateforme de découverte d'événements culturels et de sorties dans la ville d'Orléans, France. L'application mobile permet aux citoyens de découvrir tous les événements, lieux et organisateurs de leur ville en un seul endroit.

### Comment nous utilisons la fonctionnalité

Notre application utilise l'API Graph de Facebook pour récupérer uniquement les **métadonnées publiques des événements** publiés sur les pages Facebook publiques d'organisateurs et de lieux locaux (bars, salles de concert, associations, collectifs, etc.).

**Flux d'utilisation :**

1. **Sélection d'un organisateur/lieu** : Les administrateurs de la plateforme sélectionnent un organisateur ou un lieu enregistré dans notre base de données, qui possède un identifiant de page Facebook publique (`facebook_page_id`).

2. **Récupération des événements publics** : Via l'interface d'administration, nous appelons l'API Graph Facebook (`GET /{page-id}/events`) pour récupérer uniquement les événements **publics** de cette page.

3. **Données récupérées** : Nous collectons uniquement les informations publiques suivantes :
   - Nom de l'événement (`name`)
   - Description (`description`) - si publique
   - Date et heure de début/fin (`start_time`, `end_time`)
   - Lieu (`place` avec nom, adresse, coordonnées géographiques)
   - Image de couverture (`cover`)

4. **Transformation en demandes d'événements** : Ces données sont converties en "demandes de création d'événements" dans notre système, qui doivent ensuite être **révisées et approuvées manuellement** par un administrateur avant d'être publiées sur la plateforme.

5. **Vérification et validation** : Avant publication, les administrateurs vérifient, complètent et valident chaque événement importé. Aucun événement n'est publié automatiquement sans validation humaine.

### Valeur ajoutée pour les utilisateurs

**Pour les citoyens d'Orléans :**

- **Découverte centralisée** : Les utilisateurs découvrent tous les événements culturels de leur ville en un seul endroit, sans avoir à suivre des dizaines de pages Facebook différentes
- **Recherche facilitée** : L'application permet de rechercher et filtrer les événements par date, catégorie, lieu, organisateur
- **Accessibilité** : Les événements sont accessibles même pour les personnes qui n'utilisent pas Facebook
- **Qualité et fiabilité** : Chaque événement est vérifié et validé manuellement avant publication, assurant la qualité et l'exactitude des informations

**Pour les organisateurs et lieux :**

- **Visibilité accrue** : Les événements publiés sur Facebook gagnent en visibilité auprès d'un public local plus large
- **Facilitation de la diffusion** : Les organisateurs n'ont pas besoin de créer manuellement leurs événements sur notre plateforme - ils peuvent simplement publier sur leur page Facebook et nos administrateurs peuvent les importer
- **Respect de la source** : Chaque événement importé conserve les liens vers les pages Facebook d'origine et crédite correctement les organisateurs

**Pour la communauté locale :**

- **Promotion de la vie culturelle locale** : La plateforme encourage la participation aux événements locaux et dynamise la vie culturelle de la ville
- **Gratuit et sans publicité** : Le service est gratuit pour les utilisateurs et ne monétise pas leurs données personnelles

### Pourquoi cette fonctionnalité est nécessaire

**1. Efficacité opérationnelle :**
- Les organisateurs locaux utilisent massivement Facebook pour promouvoir leurs événements
- Sans cette fonctionnalité, nos administrateurs devraient saisir manuellement chaque événement, ce qui serait chronophage et source d'erreurs
- L'importation automatisée permet de gérer des centaines d'événements par mois efficacement

**2. Couverture complète :**
- Pour offrir une vision exhaustive de la vie culturelle d'Orléans, nous devons accéder aux événements publiés par de nombreuses pages publiques locales (plusieurs dizaines d'organisateurs et lieux)
- Certaines de ces pages ne nous appartiennent pas directement, mais leurs événements publics sont essentiels pour la mission de notre application

**3. Respect de la vie privée :**
- Nous n'accédons qu'aux **données publiques** (événements publics, métadonnées publiques)
- Nous ne stockons jamais d'informations privées, de données utilisateurs Facebook, ou de contenu non-public
- Nous respectons strictement les paramètres de confidentialité de chaque page Facebook

**4. Validation humaine :**
- Chaque événement importé passe par un processus de validation manuelle par un administrateur
- Cela garantit la qualité et l'exactitude des informations, ainsi que le respect des droits d'auteur et de la vie privée

**5. Conformité RGPD :**
- Notre application respecte le RGPD et les politiques de confidentialité de Facebook
- Les utilisateurs peuvent demander la suppression de leurs données à tout moment
- Nous ne vendons ni ne partageons les données collectées avec des tiers

### Limites et restrictions respectées

- ✅ Accès uniquement aux **événements publics**
- ✅ Aucun accès aux données privées des utilisateurs Facebook
- ✅ Aucun accès aux informations personnelles des organisateurs
- ✅ Pas de stockage de contenu non-public
- ✅ Validation manuelle obligatoire avant publication
- ✅ Crédit et liens vers les pages Facebook d'origine préservés

### Conclusion

La fonctionnalité "Page Public Metadata Access" est essentielle pour permettre à Live Orléans de remplir sa mission : centraliser et faciliter l'accès aux événements culturels publics de la ville, tout en respectant strictement la vie privée et les données publiques uniquement. Cette utilisation bénéficie directement à la communauté locale en promouvant la vie culturelle et en facilitant la découverte d'événements locaux.

---

**Contact pour questions :**
- Email : lazbutton@gmail.com
- Adresse : 1 Av. du Champ de Mars, 45100 Orléans, France

