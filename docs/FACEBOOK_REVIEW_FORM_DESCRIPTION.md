# Description pour le Formulaire Facebook Review

## Version complète à copier-coller dans le formulaire

---

**Live Orléans** est une plateforme mobile gratuite qui centralise tous les événements culturels et de sorties de la ville d'Orléans, France, permettant aux citoyens de découvrir la vie culturelle locale en un seul endroit.

### Comment notre application utilise cette fonctionnalité

Notre application utilise "Page Public Metadata Access" pour permettre à nos administrateurs d'importer, via notre interface d'administration sécurisée, les événements **publics** publiés sur les pages Facebook d'organisateurs et lieux locaux (bars, salles de concert, associations, collectifs, centres culturels, etc.).

**Processus détaillé :**

1. **Sélection d'un organisateur/lieu** : Un administrateur authentifié accède à notre interface d'administration et sélectionne un organisateur ou un lieu enregistré dans notre base de données, qui possède un identifiant de page Facebook publique (`facebook_page_id`).

2. **Récupération via l'API Graph** : L'administrateur clique sur le bouton "Importer depuis Facebook", ce qui déclenche un appel sécurisé à l'API Graph Facebook (`GET /{page-id}/events`) pour récupérer uniquement les événements **publics** de cette page.

3. **Données collectées** : Nous collectons uniquement les métadonnées publiques suivantes :
   - Nom de l'événement (`name`)
   - Description publique (`description`) - uniquement si elle est publique
   - Date et heure de début/fin (`start_time`, `end_time`)
   - Informations de lieu (`place` avec nom, adresse publique, coordonnées géographiques)
   - Image de couverture publique (`cover`)

4. **Transformation en demandes** : Ces données publiques sont converties en "demandes de création d'événements" dans notre système de gestion, qui sont ensuite **révisées et approuvées manuellement** par un administrateur avant toute publication.

5. **Validation humaine obligatoire** : Chaque événement importé doit être vérifié, complété si nécessaire, et validé manuellement par un administrateur. Aucun événement n'est publié automatiquement sur notre plateforme publique sans ce processus de validation.

6. **Publication** : Une fois validé, l'événement est publié sur notre application mobile avec crédit et liens vers la page Facebook d'origine, permettant aux utilisateurs de découvrir l'événement et de se rediriger vers la page Facebook pour plus d'informations ou pour réserver.

**Sécurité et respect de la vie privée :**
- Accès strictement limité aux données **publiques** uniquement
- Aucun accès aux informations privées des utilisateurs Facebook
- Aucun accès aux données personnelles des organisateurs
- Aucun stockage de contenu non-public
- Validation manuelle de chaque événement avant publication
- Conformité RGPD et respect des politiques de confidentialité de Facebook

### Comment cela ajoute de la valeur pour les utilisateurs

**Pour les citoyens d'Orléans (utilisateurs finaux de l'application mobile) :**

- **Découverte centralisée** : Les utilisateurs peuvent découvrir tous les événements culturels de leur ville en un seul endroit, sans avoir à suivre des dizaines de pages Facebook différentes. Cela simplifie considérablement leur expérience de découverte d'événements locaux.

- **Recherche et filtrage avancés** : Notre application permet de rechercher et filtrer les événements par date, catégorie, lieu, organisateur, ce qui serait impossible en parcourant manuellement de nombreuses pages Facebook.

- **Accessibilité** : Les événements deviennent accessibles à tous, même aux personnes qui ne possèdent pas de compte Facebook ou préfèrent ne pas utiliser cette plateforme. Cela démocratise l'accès à l'information culturelle locale.

- **Qualité et fiabilité** : Chaque événement est vérifié et validé manuellement avant publication, assurant la qualité, l'exactitude des informations (dates, horaires, adresses), et la pertinence pour la communauté locale.

- **Actualisation automatique** : Les organisateurs n'ont besoin que de publier leurs événements sur leur page Facebook. Nos administrateurs peuvent ensuite importer facilement ces événements, assurant une couverture à jour de la vie culturelle locale.

**Pour les organisateurs et lieux locaux :**

- **Visibilité accrue** : Les événements qu'ils publient sur leurs pages Facebook gagnent en visibilité auprès d'un public local plus large, y compris les personnes qui ne suivent pas activement leurs pages.

- **Facilitation de la diffusion** : Les organisateurs n'ont pas besoin de créer manuellement leurs événements sur notre plateforme. Ils peuvent simplement continuer à utiliser Facebook comme ils le font habituellement, et nos administrateurs peuvent importer leurs événements publics pour les rendre visibles sur notre application.

- **Respect de la source** : Chaque événement importé conserve les liens vers les pages Facebook d'origine et crédite correctement les organisateurs, renvoyant le trafic vers leurs pages Facebook.

- **Promotion gratuite** : Le service est gratuit pour les organisateurs et augmente leur visibilité locale sans coût supplémentaire.

**Pour la communauté locale :**

- **Promotion de la vie culturelle** : La plateforme encourage la participation aux événements locaux et dynamise la vie culturelle de la ville en rendant les événements plus facilement découvrables.

- **Service gratuit** : L'application est gratuite pour les utilisateurs et ne monétise pas leurs données personnelles, respectant leur vie privée.

- **Impact social** : En facilitant la découverte d'événements locaux, la plateforme renforce le tissu social et culturel de la ville, soutenant les acteurs culturels locaux.

### Pourquoi cette fonctionnalité est nécessaire pour la fonctionnalité de l'application

**1. Efficacité opérationnelle essentielle :**
Les organisateurs et lieux culturels d'Orléans utilisent massivement Facebook comme plateforme principale pour promouvoir leurs événements. Sans cette fonctionnalité, nos administrateurs devraient saisir manuellement chaque événement depuis Facebook, ce qui serait :
- Extrêmement chronophage (plusieurs heures par jour pour des centaines d'événements)
- Source d'erreurs humaines (mauvaise saisie de dates, adresses, descriptions)
- Non-viable économiquement pour un service gratuit
- Impossible à maintenir à jour de manière exhaustive

L'importation automatisée via l'API Graph permet de gérer efficacement des centaines d'événements par mois tout en maintenant une qualité élevée grâce à la validation manuelle.

**2. Couverture exhaustive nécessaire :**
Pour offrir une vision complète et exhaustive de la vie culturelle d'Orléans, notre application doit pouvoir accéder aux événements publiés par de nombreuses pages publiques locales :
- Plusieurs dizaines d'organisateurs (collectifs, associations, artistes)
- Nombreux lieux (bars, salles de concert, centres culturels, espaces associatifs)
- Pages qui ne nous appartiennent pas directement mais dont les événements publics sont essentiels pour remplir la mission de notre application

Certaines de ces pages appartiennent à des organisateurs indépendants qui ne font pas partie de notre organisation, mais leurs événements publics font partie intégrante de l'écosystème culturel local que nous cherchons à représenter.

**3. Respect strict de la vie privée :**
Notre utilisation de cette fonctionnalité est conçue pour respecter strictement la vie privée :
- Nous n'accédons qu'aux **données publiques** (événements publics, métadonnées publiques)
- Nous ne stockons jamais d'informations privées, de données utilisateurs Facebook, ou de contenu non-public
- Nous respectons strictement les paramètres de confidentialité de chaque page Facebook
- Les utilisateurs peuvent à tout moment demander la suppression de leurs données via notre politique de confidentialité

Cette approche nous permet de remplir notre mission tout en respectant les normes de protection des données.

**4. Validation humaine garantit la qualité :**
Contrairement à un système entièrement automatisé, notre processus inclut une validation humaine obligatoire :
- Chaque événement importé est révisé par un administrateur
- Les informations peuvent être complétées ou corrigées si nécessaire
- Seuls les événements pertinents et de qualité sont publiés
- Cela garantit la qualité et l'exactitude des informations, ainsi que le respect des droits d'auteur et de la vie privée

Cette étape de validation humaine est une fonctionnalité essentielle de notre plateforme qui garantit la fiabilité des informations.

**5. Conformité réglementaire (RGPD) :**
Notre application respecte le Règlement Général sur la Protection des Données (RGPD) et les politiques de confidentialité de Facebook. L'utilisation de cette fonctionnalité nous permet de :
- Collecter uniquement les données nécessaires et légitimes
- Maintenir la transparence avec nos utilisateurs via notre politique de confidentialité publique
- Permettre aux utilisateurs d'exercer leurs droits (accès, rectification, suppression)
- Respecter les principes de minimisation et de limitation de finalité

**6. Alternative non-viable :**
Les alternatives à cette fonctionnalité ne sont pas viables :
- **Saisie manuelle** : Non-viable à grande échelle, trop d'erreurs, chronophage
- **Web scraping** : Violerait les conditions d'utilisation de Facebook et serait instable
- **Partenariats directs** : Impossible avec des dizaines d'organisateurs indépendants
- **Limiter à nos propres pages** : Ne permettrait pas une couverture exhaustive de la vie culturelle locale

**Conclusion :**

La fonctionnalité "Page Public Metadata Access" est absolument essentielle pour permettre à Live Orléans de remplir sa mission : centraliser et faciliter l'accès aux événements culturels publics de la ville, tout en respectant strictement la vie privée et en n'accédant qu'aux données publiques. Cette utilisation bénéficie directement à la communauté locale en promouvant la vie culturelle et en facilitant la découverte d'événements locaux, tout en soutenant les organisateurs locaux et en respectant leurs préférences de plateforme (Facebook).

Sans cette fonctionnalité, notre application ne pourrait pas fonctionner de manière efficace et exhaustive, et nous devrions soit limiter drastiquement notre couverture, soit cesser d'offrir ce service gratuit à la communauté.

---

**Contact :**
- Email : lazbutton@gmail.com
- Adresse : 1 Av. du Champ de Mars, 45100 Orléans, France

