## Spécification UX/UI (Admin) — Inbox des demandes d’ajout d’événements

### Objectif
Transformer la page **Demandes** en une **Inbox de triage** (best practices 2025) pour traiter des demandes d’ajout d’événements **très rapidement** : décider (convertir / rejeter / demander une correction) en gardant le contexte, avec navigation clavier et actions en lot.

### Portée
- **Page principale** : `app/(admin)/admin/components/user-requests-management.tsx`
- **Page d’édition avant création** (déjà existante) : `app/(admin)/admin/requests/[id]/create-event/page.tsx`
- **API Facebook → création de demandes** : `app/api/facebook/events/create-requests/route.ts`

### Contrainte
- **Ne pas casser les données existantes**.
- **Ne pas réintroduire** des migrations archivées : la source de vérité en dev est la **baseline** + le schéma actuel.

---

## 1) Modèle de données (source de vérité)
### Table `user_requests`
La page doit être pensée comme un **flux de demandes d’événements** (pas “demandes de compte”).

Champs attendus (résumé) :
- **id** (uuid)
- **request_type**: `event_creation` | `event_from_url`
- **status**: `pending` | `converted` | `rejected` | (optionnel/legacy) `approved`
- **requested_by** (uuid)
- **requested_at** (timestamptz)
- **reviewed_by**, **reviewed_at**, **notes**
- **event_data** (jsonb) : données d’événement (titre, date, category, location_id, organizer_id, image_url, external_url, scraping_url, etc.)
- **source_url** (text) : obligatoire/fortement recommandé pour `event_from_url`
- **location_id**, **location_name** (pour contextualiser `event_from_url`)
- **converted_event_id**, **converted_at**

### Règles métier
- **Une demande = un brouillon de décision**. Tant qu’elle n’est pas `converted` ou `rejected`, elle est dans l’inbox.
- `converted` signifie :
  - un `events.id` existe,
  - `converted_event_id` est rempli,
  - l’événement créé est **status = pending** (validation finale côté Events).

---

## 2) Problèmes UX actuels à corriger
- Trop “table brute” → difficile de scanner.
- Trop d’actions derrière des modales → perte de contexte.
- Pas de traitement en lot.
- Pas de repérage “type” (URL vs demande complète) ni de signaux (qualité/doublon/urgence).
- Chemin de conversion pas assez direct.

---

## 3) UX cible (best practices 2025) : Inbox + panneau détail
### Layout desktop recommandé
**2 colonnes** :
- **Colonne gauche** : liste inbox (compacte, scroll)
- **Colonne droite** : panneau détail (Sheet latérale ou panel fixe) avec actions

### Mobile
- Liste inbox + ouverture détail en **Sheet** plein écran.

---

## 4) Navigation & repérage
### Tabs (haut de page)
- **À traiter** (default) → `status=pending`
- **Converties** → `status=converted`
- **Rejetées** → `status=rejected`
- **Tout** → (fallback)

Chaque tab affiche un **badge compteur**.

### Filtres (barre compacte)
- **Recherche** (placeholder : titre / URL / lieu)
- **Type** : Tous | `event_creation` | `event_from_url`
- **Période** : 24h | 7j | 30j | Tout
- **Tri** : récent d’abord (default) / ancien d’abord

### Chips de filtres actifs
Afficher des chips cliquables pour enlever un filtre en 1 clic.

---

## 5) Liste inbox (design “scan-friendly”)
### Row/Carte compacte (1 ligne + sous-ligne)
Afficher (priorité) :
- **Titre** (ou domaine + url si `event_from_url`)
- **Type badge** : `URL` vs `Complet`
- **Statut** badge
- **Date event** (si dispo dans `event_data.date`) → format FR
- **Lieu** (location_name > event_data.location_name > location_id)
- **Catégorie**
- **Âge** de la demande (ex: “il y a 2h”, “il y a 3j”)

### Signaux visuels (triage)
- **Qualité** (badge léger) :
  - “Incomplet” si manque titre/date/category
  - “URL” si event_from_url
- **Doublon potentiel** (badge warning) si l’URL existe déjà dans `events.external_url` ou `events.scraping_url`, ou si même titre+jour.

### Sélection multiple
- Checkbox par ligne + “Select all (page)”.
- Une barre d’actions apparaît quand `selectedIds.length > 0`.

---

## 6) Actions (vitesse maximale)
### Actions inline (dans la liste)
- **Ouvrir** (détail) (click row)
- **Créer (fast)** (si `event_creation` complet) : appelle RPC `convert_event_request_to_event(request_id)`
- **Éditer** : navigate `/admin/requests/[id]/create-event`
- **Rejeter** : ouvre mini popover “raison” (notes) + confirme

### Actions en lot
Barre sticky (quand sélection) :
- **Convertir** (seulement les `event_creation`)
- **Ouvrir en édition** (ouvre la première, ou ouvre en onglets)
- **Rejeter** (+ note commune)

---

## 7) Panneau détail (Sheet/panel)
### Contenu
- En-tête :
  - Titre / URL
  - Badges (type, statut)
  - Actions primaires (Convertir / Éditer / Rejeter)

- Bloc “Résumé” (cards) :
  - Date(s)
  - Lieu
  - Catégorie
  - Organisateurs (si présents)
  - Liens : `source_url`, `external_url`, `scraping_url`

- Bloc “Données brutes” : affichage JSON pretty (collapsable) de `event_data` (lecture seule)

- Bloc “Doublons potentiels” :
  - liste d’events existants (liens)
  - règle simple : match sur `source_url`, `external_url`, `scraping_url`, ou `title + day`

- Bloc “Notes admin” : textarea (autosave optionnel)

### Actions détaillées
- **Convertir (fast)** : RPC (event_creation uniquement)
- **Éditer puis créer** : route existante
- **Rejeter** : status rejected + notes
- Si `status=converted` : bouton **Voir l’événement** (lien vers `/admin/events?view=agenda&start=YYYY-MM-DD` + idéalement ouverture auto sur l’event)

---

## 8) Raccourcis clavier (admin power-user)
- `J/K` : prochaine/précédente demande
- `Enter` : ouvrir/fermer le panneau détail
- `C` : convertir (si possible)
- `E` : éditer
- `R` : rejeter
- `Esc` : fermer panneau / clear selection

---

## 9) Data fetching & perf
### Requêtes (client)
- Éviter `select("*")`.
- Charger en priorité les champs nécessaires à la liste.
- Pagination (page size 30–50) + “infinite load” optionnel.

### Compteurs
- Requêtes légères dédiées (count) pour `pending/converted/rejected`.

---

## 10) Plan d’implémentation (pour GPT‑5.2)
### Étape A — Nouveau composant Inbox
- Refactor `UserRequestsManagement` en :
  - `RequestsInboxLayout`
  - `RequestsList`
  - `RequestDetailsPanel` (Sheet)
  - `BulkActionBar`

### Étape B — Types & mapping
- Normaliser le mapping des champs :
  - `title = event_data.title || source_url || "(sans titre)"`
  - `eventDate = event_data.date`
  - `locationLabel = location_name || event_data.location_name || "-"`

### Étape C — Actions
- Convert fast : `supabase.rpc('convert_event_request_to_event', { request_id: id })`
- Rejet : update `user_requests` → `status='rejected'`, `reviewed_*`, `notes`
- Converted view : lien vers event via `converted_event_id`

### Étape D — Doublon potentiel
- Sur ouverture détail, requête `events` pour match `external_url/scraping_url` == `source_url` (si présent) + fallback titre/jour.

### Étape E — UX polish
- Skeletons
- Empty states contextualisés
- Toasts (succès/erreur)

---

## 11) Critères de succès
- Traiter une demande `event_creation` complète en **≤ 2 clics** (Convertir).
- Traiter une demande `event_from_url` en **≤ 2 clics** (Éditer → page pré-remplie via scraping).
- Pouvoir traiter **en lot**.
- Ne jamais perdre le contexte (liste visible, panneau à droite).
- Les demandes `converted` affichent un lien clair vers l’événement créé.


