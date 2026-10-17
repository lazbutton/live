# Suivi d’implémentation - Collecte événements admin

## Objectif

Construire dans l’admin OutLive une base professionnelle pour piloter la collecte des événements depuis les sites, comptes Instagram, événements Facebook, newsletters, billetteries et agendas partenaires.

Ce suivi complète le document stratégique [`ADMIN_EVENT_INTAKE_OPERATING_SYSTEM.md`](./ADMIN_EVENT_INTAKE_OPERATING_SYSTEM.md).

---

## État actuel

Statut global: **socle professionnel + pipeline de collecte productif livrés, durcissement interface en cours**.

Le système permet maintenant de:

- centraliser les sources à surveiller;
- prioriser les sources par niveau P0 à P3;
- savoir quelles sources sont dues ou en retard;
- démarrer une session de veille avec la prochaine source prioritaire visible immédiatement;
- marquer une source comme scannée et réinitialiser un scan si besoin;
- capturer rapidement un événement repéré sans quitter le contexte de veille;
- enrichir une opportunité via import URL, image ou Facebook;
- suivre les opportunités dans un pipeline;
- éditer une opportunité sans quitter la page Collecte;
- archiver proprement une opportunité hors scope ou à masquer;
- consulter un historique compact des scans/réinitialisations d’une source;
- travailler depuis un vrai poste de collecte séquentiel: index source, cockpit source, capture, décisions;
- distinguer les opportunités à compléter, prêtes à créer, créées, doublons ou hors scope;
- reléguer la création complète de source dans un panneau secondaire pour garder l’écran principal minimal;
- accéder à la section depuis la navigation admin.

---

## Fonctionnalités livrées

### Base de données

- Création de la table `event_sources`.
- Création de la table `event_opportunities`.
- Contraintes de statuts, priorités, types de sources et scores.
- Index pour les sources dues, priorités, opportunités par statut et priorité.
- Champs de performance source: `scan_count`, `discovery_count`, `last_found_at`.
- Rattachement obligatoire d’une source à au moins un lieu principal ou un organisateur indépendant.
- Support des organisateurs classiques via `organizer_id` et des lieux organisateurs via `organizer_location_id`.
- Champs de décision opportunité: `duplicate_event_id`, `created_event_id`, `decision_reason`.
- Historique persistant minimal via `event_source_scan_logs`.
- RLS activée sur les deux tables.
- Policies admin-only via `public.is_user_admin()`.
- Triggers `updated_at`.

Migration créée:

- `live-admin/supabase/migrations/20260427103000_create_event_intake_system.sql`
- `live-admin/supabase/migrations/20260427104500_link_event_sources_to_entities.sql`
- `live-admin/supabase/migrations/20260427105500_allow_independent_source_location_and_organizer.sql`
- `live-admin/supabase/migrations/20260427110000_require_event_source_entity_link.sql`
- `live-admin/supabase/migrations/20260427171500_add_import_payload_to_event_opportunities.sql`
- `live-admin/supabase/migrations/20260428143000_create_event_source_scan_logs.sql`
- `live-admin/supabase/migrations/20260428180500_add_scan_timing_and_opportunity_log_link.sql`

### Interface admin

- Nouvelle page `/admin/intake`.
- Header sticky de session:
  - sources à scanner;
  - sources en retard;
  - opportunités prêtes à créer;
  - source active ou prochaine source;
  - progression de session;
  - duree de session;
  - moyenne par scan;
  - action principale `Commencer/Reprendre`;
  - création de source secondaire.
- Cockpit source:
  - source active ou prochaine source;
  - panneau d’action rapide compact;
  - actions source centralisées: ouvrir, capturer, terminer scan, suivante, éditer, reset, statut;
  - stats de source reduites aux indicateurs essentiels;
  - historique discret directement dans le cockpit.
  - suggestion automatique de priorité / fréquence source avec application rapide.
- Index de scan des sources:
  - filtres rapides `À scanner` / `P0-P1` / `En retard` / `Actives` / `Toutes`;
  - recherche texte source / lieu / ville;
  - sélection d’une source par clic sur la ligne;
  - affichage du visuel référent de l’entité liée: image du lieu, logo organisateur ou initiales en fallback;
  - lignes ultra compactes sans CTA métier redondant;
  - scroll interne pour grosses sessions.
- Panneau de capture d’opportunité:
  - compositeur express synchronisé avec la source active;
  - choix du mode de capture `Rien`, `URL`, `Image`, `Facebook`;
  - passerelle avec les imports existants pour préremplir le pipeline;
  - un champ principal selon le mode choisi;
  - CTA explicites `Ajouter manuel`, `Importer URL`, `Importer image`, `Importer Facebook`;
  - détails avancés repliables: date, lieu, catégorie, confiance, champs manquants, notes;
  - préremplissage depuis la source sélectionnée;
  - focus rapide sur la capture depuis le cockpit.
- Pipeline des opportunités:
  - inbox de décisions groupée: doublons probables, prêts à créer, à compléter / qualifier, autres;
  - cartes compactes orientées décision immédiate;
  - une action principale par carte: `Doublon`, `Prêt`, `Créer`;
  - création d’événement depuis une opportunité avec préremplissage du formulaire admin;
  - synchronisation automatique de l’opportunité en `Créé` avec `created_event_id` après sauvegarde;
  - détection de doublon probable par titre, date et lieu;
  - action rapide pour marquer une opportunité comme doublon avec `duplicate_event_id`;
  - ouverture/copie de la source;
  - changement de statut;
  - édition complète d’une opportunité dans un panneau latéral;
  - archivage propre `Hors scope` ou `Archive`.
- Historique de scan:
  - journalisation des scans;
  - journalisation des réinitialisations;
  - journalisation des changements de statut source;
  - temps réel par scan;
  - clé de session persistée;
  - rattachement exact des opportunités au scan;
  - affichage compact des derniers logs pour la source active.
- Panneau secondaire d’ajout de source:
  - nom;
  - URL;
  - lieu lié via select prérempli recherchable;
  - organisateur indépendant via select prérempli recherchable, incluant aussi les lieux marqués comme organisateurs;
  - validation obligatoire: au moins un lieu ou organisateur référent;
  - type;
  - priorité;
  - fréquence;
  - ville / zone via select prérempli recherchable;
  - catégorie dominante via select prérempli recherchable;
  - notes.

Fichiers créés:

- `live-admin/app/(admin)/admin/intake/page.tsx`
- `live-admin/app/(admin)/admin/components/intake/event-intake-page.tsx`
- `live-admin/app/(admin)/admin/components/intake/intake-types.ts`
- `live-admin/app/(admin)/admin/components/intake/intake-utils.ts`
- `live-admin/app/(admin)/admin/components/intake/intake-toolbar.tsx`
- `live-admin/app/(admin)/admin/components/intake/source-cockpit.tsx`
- `live-admin/app/(admin)/admin/components/intake/source-queue.tsx`
- `live-admin/app/(admin)/admin/components/intake/capture-panel.tsx`
- `live-admin/app/(admin)/admin/components/intake/opportunity-queue.tsx`
- `live-admin/app/(admin)/admin/components/intake/source-creation-sheet.tsx`
- `live-admin/app/(admin)/admin/components/intake/opportunity-edit-sheet.tsx`
- `live-admin/app/(admin)/admin/components/intake/scan-history-panel.tsx`
- `live-admin/app/(admin)/admin/components/intake/intake-event-prefill.ts`
- `live-admin/app/(admin)/admin/components/intake/intake-import-service.ts`

### Navigation

- Ajout de `Collecte` dans la sidebar admin.
- Ajout de `Collecte` dans la navigation mobile admin.

Fichiers modifiés:

- `live-admin/app/(admin)/admin/components/admin-sidebar.tsx`
- `live-admin/app/(admin)/admin/components/mobile-bottom-nav.tsx`

---

## Fonctionnalités restantes prioritaires

### P0 - Rendre le système vraiment opérationnel

Livré:

- Action “Créer événement depuis opportunité” avec préremplissage:
  - titre;
  - date;
  - lieu;
  - catégorie;
  - URL source;
  - notes;
  - organisateur lié à la source.
- Synchronisation automatique de `created_event_id` quand l’événement est sauvegardé depuis une opportunité.
- Détection anti-doublon initiale:
  - titre proche;
  - date proche;
  - lieu proche;
  - affichage du doublon probable dans le pipeline;
  - action `Marquer doublon`.
- Anti-doublon renforcé:
  - comparaison URL / domaine source;
  - comparaison organisateur / entité liée;
  - raisons de rapprochement visibles dans l’inbox.
- Mode “session de veille” opérationnel:
  - démarrer session;
  - ouvrir source active;
  - passer à la source suivante;
  - capturer événement avec préremplissage;
  - marquer scannée;
  - réinitialiser un scan;
  - raccourcis clavier `O`, `F`, `S`, `N`.
- Passerelle d’import Collecte:
  - capture manuelle;
  - import URL;
  - import image;
  - import Facebook;
  - stockage durable du payload d’import pour préremplir la création d’événement.
- Durcissement productivité livré:
  - cockpit avec progression de session;
  - rendement de session visible;
  - édition complète d’une opportunité;
  - archivage propre;
  - historique minimal des scans;
  - file de scan densifiée;
  - workbench UX séquentiel: session, cockpit source, capture, décisions;
  - rail visuel `1 Source -> 2 Capture -> 3 Décision`;
  - capture express et inbox de décisions plus minimalistes;
  - temps réel par scan;
  - opportunités rattachées à un scan précis;
  - suggestions automatiques de priorité / fréquence.

Restant pour durcir:

- Historique persistant des sessions au niveau reporting / récap multi-sessions.
- Résumé de fin de session plus riche et exportable.

### P1 - Productivité admin

- Édition complète d’une source livrée.
- Édition complète d’une opportunité livrée.
- Archivage propre livré pour les opportunités.
- Temps réellement passé par scan livré.
- Historique des scans par source livré.
- Ajouter un score automatique de nouveauté à partir de `scan_count` et `discovery_count`.
- Ajouter un bouton “source morte” avec raison.

### P2 - Automatisation intelligente

- Import URL, image et Facebook livré dans `Capture rapide`.
- Inbox “texte brut” pour coller une newsletter ou une publication Instagram.
- Suggestions automatiques de catégories et tags.
- Auto-remplissage depuis page billetterie quand possible.
- Suggestions de fréquence selon performance source livrées.
- Alertes sources P0 non scannées depuis plus de 48h.

### P3 - Analytics avancée

- Dashboard hebdomadaire:
  - sources scannées;
  - événements repérés;
  - événements créés;
  - doublons évités;
  - temps moyen par événement;
  - sources sans nouveauté.
- Score de couverture par ville.
- Score de couverture par catégorie.
- Classement des sources les plus rentables.
- Détection des sources qui font perdre du temps.

---

## Améliorations UX recommandées

### Cockpit

- Ajouter une barre de progression “session du jour” plus visuelle.
- Ajouter un rappel de rendement de session: sources scannées, événements trouvés, temps passé.
- Afficher un CTA de reprise de session quand une veille est déjà entamée.

### File de scan

- Raccourcis clavier livrés:
  - `O` ouvrir source;
  - `F` événement trouvé;
  - `S` marquer scannée;
  - `N` source suivante.
- Ouvrir les sources dans un panneau contrôlé plutôt que dans un nouvel onglet.
- Ajouter un mode ultra dense sans détails repliés pour les grosses sessions.

### Pipeline

- Passer à une vue kanban par statut.
- Ajouter le drag-and-drop entre statuts.
- Ajouter un panneau de détail latéral.

---

## Risques à surveiller

- Le MVP dépend de l’application de la migration Supabase avant usage réel.
- Les imports dépendent de la disponibilité des APIs d’extraction URL/Image/Facebook.
- La détection de doublons reste heuristique malgré l’ajout de l’URL et de l’organisateur.
- L’historique de scan est maintenant exploitable mais il n’y a pas encore de vue dédiée de reporting multi-sessions.
- Les sources Instagram/Facebook restent manuelles pour éviter de dépendre d’automatisations fragiles.

---

## Prochain jalon recommandé

Le prochain jalon doit être **durcissement productivité Collecte**.

Objectif:

1. Produire un récap de session exploitable en fin de veille.
2. Ajouter une vue dédiée d’historique / reporting des scans.
3. Calculer automatiquement un score de nouveauté éditoriale plus robuste.
4. Ajouter un motif structuré pour les sources mortes.

Ce jalon réduit les frictions restantes entre veille, qualification et création d’événement.
