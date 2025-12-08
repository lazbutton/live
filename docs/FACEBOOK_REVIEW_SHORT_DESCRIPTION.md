# Description courte pour le formulaire Facebook Review

## Version courte (pour le champ de description)

**Live Orléans** est une plateforme mobile gratuite qui centralise tous les événements culturels et de sorties de la ville d'Orléans, France.

### Utilisation de la fonctionnalité

Nous utilisons "Page Public Metadata Access" pour permettre à nos administrateurs d'importer, via notre interface d'administration, les événements **publics** publiés sur les pages Facebook d'organisateurs et lieux locaux (bars, salles de concert, associations, collectifs).

**Flux d'utilisation :**
1. Un administrateur sélectionne un organisateur/lieu enregistré dans notre base avec son ID de page Facebook
2. Nous appelons `GET /{page-id}/events` via l'API Graph pour récupérer uniquement les événements publics
3. Nous collectons uniquement : nom, description publique, dates, lieu public, image de couverture
4. Ces données sont converties en "demandes d'événements" qui doivent être **validées manuellement** par un administrateur avant publication
5. Aucun événement n'est publié automatiquement - validation humaine obligatoire

### Valeur ajoutée

**Pour les utilisateurs :** Découverte centralisée de tous les événements locaux sans suivre des dizaines de pages Facebook. Recherche facilitée par date, catégorie, lieu.

**Pour les organisateurs :** Visibilité accrue de leurs événements Facebook auprès d'un public local plus large. Pas besoin de saisir manuellement - publication sur Facebook suffit.

**Pour la communauté :** Promotion gratuite de la vie culturelle locale. Service gratuit et sans publicité.

### Pourquoi nécessaire

- Les organisateurs utilisent massivement Facebook pour promouvoir leurs événements
- Sans cette fonctionnalité, saisie manuelle chronophage et source d'erreurs
- Nécessaire pour offrir une couverture exhaustive de la vie culturelle locale
- Respect strict : données publiques uniquement, validation humaine, pas de données privées stockées

### Respect de la vie privée

- ✅ Accès uniquement aux événements **publics**
- ✅ Aucun accès aux données privées des utilisateurs Facebook
- ✅ Aucune information personnelle collectée
- ✅ Validation manuelle avant publication
- ✅ Conformité RGPD

**Contact :** lazbutton@gmail.com | 1 Av. du Champ de Mars, 45100 Orléans, France

---

## Version très courte (si limite de caractères)

**Live Orléans** centralise les événements culturels d'Orléans en un seul endroit. Nous utilisons cette fonctionnalité pour permettre à nos administrateurs d'importer les événements **publics** des pages Facebook d'organisateurs locaux. Chaque événement est validé manuellement avant publication. Valeur : découverte facilitée pour les citoyens, visibilité accrue pour les organisateurs locaux, promotion gratuite de la vie culturelle. Accès strictement aux données publiques uniquement. Conforme RGPD.

