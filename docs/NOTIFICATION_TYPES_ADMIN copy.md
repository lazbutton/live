# Recap Notifications Utilisateur et Admin

## Objectif produit

Pour la premiere sortie, le produit ne garde qu'un seul systeme de notifications utilisateur :

- des notifications push par categories suivies
- avec deux rythmes seulement : `daily` et `weekly`
- sans rappels individuels par evenement

Le role de l'admin est de piloter l'envoi global et l'heure d'envoi, puis de laisser le backend selectionner les bons utilisateurs et les bons evenements.

## Ce qui doit rester cote utilisateur

- un switch global d'activation des notifications
- un choix de frequence :
  `daily` = tous les jours
  `weekly` = debut de semaine
- une liste de categories suivies
- depuis la fiche ou la modale d'un evenement :
  suivre ou ne plus suivre la categorie de cet evenement

## Ce qui ne doit plus etre utilise

- aucun rappel individuel par evenement
- aucun timing `1 jour`, `3 heures`, `1 heure`
- aucune programmation locale liee a un evenement
- aucune logique produit basee sur `event_notifications`

## Tables et sources utiles

### Preferences utilisateur

- `user_notification_preferences`
  contient l'etat global utilisateur, la frequence choisie et les categories suivies via `category_ids`
- `user_notification_categories`
  si cette table existe encore, la considerer comme legacy tant qu'elle n'est plus la source lue par le backend
- `user_push_tokens`
  contient les tokens push exploitables pour l'envoi

### Reglages admin

- `notification_settings`
  contient au minimum :
  `is_active`
  `notification_time`

## Regles d'eligibilite utilisateur

Un utilisateur est eligible a un envoi seulement si toutes les conditions suivantes sont vraies :

1. l'envoi global admin est actif
2. l'utilisateur a active les notifications
3. la frequence utilisateur correspond a la passe en cours
4. l'utilisateur suit au moins une categorie
5. l'utilisateur possede au moins un token push valide
6. au moins un evenement a envoyer appartient a une categorie suivie par cet utilisateur

## Gestion des frequences

### Envoi quotidien

- cible uniquement les utilisateurs en `daily`
- part a l'heure definie dans `notification_settings.notification_time`
- ne doit contenir que des evenements encore pertinents au moment de l'envoi
- doit respecter le filtre par categories suivies

### Envoi debut de semaine

- cible uniquement les utilisateurs en `weekly`
- part lui aussi a l'heure definie dans `notification_settings.notification_time`
- doit utiliser une convention unique pour le debut de semaine
- cette convention doit etre la meme partout dans l'admin, le backend et les statistiques

Recommandation produit : fixer explicitement le debut de semaine au lundi et ne pas laisser cette regle implicite.

Implementation attendue :

- la passe `weekly` part le lundi
- la fenetre couverte va du lundi au dimanche
- l'heure d'envoi reste lue depuis `notification_settings.notification_time`

## Regles de selection des evenements

Pour chaque passe d'envoi :

- ne garder que les evenements a venir
- exclure les evenements deja termines
- ne garder que les evenements appartenant aux categories suivies par l'utilisateur
- ne pas envoyer un evenement hors fenetre de la passe concernee
- agreger les evenements d'un meme utilisateur dans un seul envoi par passe

## Regles de selection des destinataires

Le backend ou l'admin doivent raisonner ainsi :

- une passe `daily` ne regarde que les utilisateurs `daily`
- une passe `weekly` ne regarde que les utilisateurs `weekly`
- un utilisateur sans categorie suivie ne doit rien recevoir
- un utilisateur sans token push ne doit rien recevoir
- un utilisateur desactive globalement ne doit rien recevoir

## Cas legacy a traiter

Le projet contenait un ancien systeme de rappels individuels. Il faut le considerer comme obsolete.

- `event_notifications` ne doit plus etre utilise pour piloter les envois produit
- `default_notification_timings` ne doit plus etre utilise
- les anciens rappels locaux doivent etre consideres comme legacy
- si des lignes legacy existent encore, elles ne doivent plus influencer la logique d'envoi admin
- les endpoints legacy lies aux rappels individuels doivent etre desactives ou retournes comme obsoletes

## Convention recommandee pour l'admin

Pour que l'admin soit clair et exploitable :

- un interrupteur pour activer ou couper tous les envois
- une heure unique d'envoi
- une distinction visuelle entre la passe `daily` et la passe `weekly`
- un ecran de test qui n'impacte pas la logique produit
- un recap du nombre de destinataires eligibles avant envoi si tu ajoutes une previsualisation

## Notification de test admin

La notification de test doit rester separee des envois produit.

- elle ne doit pas utiliser les categories suivies
- elle ne doit pas dependre de la frequence `daily` ou `weekly`
- elle sert seulement a verifier le pipeline push

## Points d'attention pour "bon moment" et "bons utilisateurs"

### Bon moment

- lire `notification_time` depuis `notification_settings`
- utiliser toujours la meme timezone de reference
- eviter les doubles envois sur une meme fenetre
- definir clairement la fenetre couverte par `daily`
- definir clairement la fenetre couverte par `weekly`

### Bons utilisateurs

- filtrer d'abord sur `is_active` cote admin
- filtrer ensuite sur `is_enabled` cote utilisateur
- filtrer ensuite sur la frequence
- filtrer ensuite sur l'intersection de categories
- filtrer enfin sur la presence d'un token push

## Anti-doublons et securite produit

- un seul envoi par utilisateur et par passe
- pas de multiplication d'envois si plusieurs categories matchent
- pas d'envoi si aucun evenement ne correspond
- pas d'envoi si la passe admin est desactivee
- pas de fallback vers les anciens rappels evenementiels

## Checklist de mise en oeuvre admin / backend

- lire `notification_settings`
- determiner la passe en cours : `daily` ou `weekly`
- charger les utilisateurs eligibles
- charger les evenements a venir de la bonne fenetre
- croiser utilisateurs et categories suivies
- construire un envoi unique par utilisateur
- envoyer seulement si au moins un evenement matche
- journaliser le resultat pour controle

## Checklist de verification

- un utilisateur `daily` ne recoit rien dans la passe `weekly`
- un utilisateur `weekly` ne recoit rien dans la passe `daily`
- un utilisateur sans categorie ne recoit rien
- un utilisateur avec notifications desactivees ne recoit rien
- un utilisateur avec categories suivies reçoit uniquement les evenements correspondants
- aucun rappel individuel d'evenement n'est encore visible ou envoye







