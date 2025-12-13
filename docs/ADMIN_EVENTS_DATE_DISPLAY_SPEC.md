## Spécification UX (Admin) — Affichage des événements par date, sans zones vides

### Objectif
Concevoir une vue **ultra lisible** pour gérer les événements dans l’admin, principalement **en fonction de la date**, en évitant l’effet “calendrier vide” (grosses zones sans contenu), tout en permettant de **se repérer instantanément** (où suis‑je dans le temps ? que se passe‑t‑il aujourd’hui/demain/cette semaine ?).

### Contraintes & contexte (projet)
- **Page cible**: liste/gestion des événements (actuellement `EventsManagement`, ex: `app/(admin)/admin/components/events-management.tsx`).
- **Édition**: l’édition d’un événement se fait déjà via une **Sheet** (panneau latéral). Le nouveau listing doit **cohabiter** avec cette Sheet.
- **Thème**: l’UI doit utiliser les **variables CSS** (pas de couleurs “hardcodées”), via les tokens existants (`primary`, `accent`, `muted`, `destructive`, `chart-*`, `success/info/warning` si disponibles).

---

## 1) Modèle mental recommandé (best practices 2025)
### Principe
Au lieu d’un calendrier mensuel plein de cases vides, utiliser une **vue Agenda / Timeline** (liste groupée par dates) + une **navigation temporelle** compacte.

### Pourquoi (UX)
- **Zéro vide**: on n’affiche que les jours ayant des événements (par défaut).
- **Repérage immédiat**: “Aujourd’hui”, “Demain”, “Cette semaine”, “Passé” + en-têtes collants.
- **Scalabilité**: supporte 50–10 000 événements via virtualisation + pagination.

---

## 2) Structure d’écran (Desktop & Mobile)
### Desktop (recommandé)
Disposition en **2 colonnes**:
- **Colonne gauche (rail)** (~280–320px, sticky):
  - **Mini navigation date**: “Aujourd’hui”, “Demain”, “+7 jours”, “Mois”, bouton “Aller à…” (date picker).
  - **Filtres rapides** (chips): Statut, Catégorie, Tags, Organisateur/Lieu, “Complet”, “Scraping”, etc.
  - **Résumé**: compteurs (ex: “Aujourd’hui: 3”, “Cette semaine: 12”, “En attente: 4”).
- **Colonne principale (agenda)**:
  - Liste **groupée par jour** avec en-têtes collants.
  - Chaque groupe contient des cartes/rows d’événements.

### Mobile
- Rail remplacé par:
  - Une **barre sticky** en haut avec un bouton “Filtres” (Sheet/Popover) + “Aller à…”.
  - Agenda en 1 colonne.

---

## 3) Navigation temporelle (se repérer vite)
### En-tête sticky (haut de page)
- **Range actuel** (ex: “Semaine du 12–18 déc.” ou “Prochains 14 jours”).
- Boutons:
  - **Aujourd’hui** (scroll direct)
  - **← / →** (jour/semaine selon le mode)
  - **Aller à…** (date picker)
  - **Densité**: Compact / Confort (toggle)
  - **Afficher jours vides** (toggle, OFF par défaut)

### Mini calendrier (rail)
- Mini composant mensuel (très compact) qui:
  - met en évidence **aujourd’hui**
  - met un point/compteur sur les jours avec événements
  - clique → scroll au jour

### En-têtes de jour (sticky dans la liste)
Chaque section jour a un header collant:
- “Aujourd’hui — lun. 12 déc.”
- Compteurs: total, pending/approved/rejected
- Actions rapides: “Créer un événement ce jour”, “Masquer les passés”, etc.

---

## 4) Affichage de la liste (zéro zones vides)
### Mode par défaut: “Prochains 14 jours” (rolling)
- On affiche **uniquement** les jours qui ont au moins 1 événement.
- Si un jour n’a pas d’événement: **il n’existe pas dans la liste** (pas de vide).
- Un bouton “Afficher jours vides” permet (si besoin) d’afficher les jours manquants sous forme **compacte**:
  - ligne hauteur faible: “mar. 13 — Aucun événement”

### Sections temporelles (meilleure lisibilité)
Découper en 3 grandes sections (collapsables):
- **À venir (rolling)**
- **Plus tard** (ex: au‑delà de +14j) — collapsed par défaut
- **Passés** — collapsed par défaut

### Tri intra-jour
- Par heure (si heure connue), sinon en fin.
- Événements multi‑jours: afficher au jour de début + badge “sur plusieurs jours”.

---

## 5) Carte/Row événement (contenu minimal mais suffisant)
### Format “Compact” (recommandé pour admin)
Une ligne/carte fine avec:
- **Heure** (HH:mm) + durée si fin connue
- **Titre** (1 ligne) + badges compacts
- **Lieu / Organisateur** (1 ligne)
- **Status** (pending/approved/rejected) via badge
- **Actions**: edit (ouvre Sheet), delete, scrape (si dispo)

### Badges (tokens)
- Pending: `bg-secondary` / `text-secondary-foreground`
- Approved: `bg-success/10` + `text-success` (ou `chart-2`)
- Rejected: `bg-destructive/10` + `text-destructive`
- Complet: `text-destructive` + pictogramme

### Format “Confort”
- Ajoute description courte (2 lignes), image thumbnail optionnelle.

---

## 6) Interactions clés
### Ouvrir/éditer
- Clic sur un événement → ouvre la **Sheet d’édition** (déjà existante).
- Garder le scroll de la liste, ne pas “perdre” le contexte.

### Scroll & repérage
- La date visible en haut (header sticky) doit refléter le jour actuellement en vue.
- Bouton “Retour à aujourd’hui” visible dès qu’on s’éloigne.

### Filtres
- Filtres en chips + panel avancé.
- Les chips montrent l’état actif et sont supprimables (x).
- Les filtres ne doivent pas casser le groupement (on groupe après filtrage).

---

## 7) Performance (best practices 2025)
### Chargement progressif
- Ne pas charger tout l’historique.
- Chargement par **fenêtres**:
  - “À venir”: range (ex: today → today+14)
  - “Plus tard”: pagination
  - “Passé”: pagination + collapsed

### Virtualisation
- Utiliser une virtualisation (ex: TanStack Virtual / react-window) pour 1000+ items.
- Les headers de jours peuvent être sticky via CSS; si virtualisation complexe, fallback: pagination + sections collapsables.

### États de chargement
- Skeletons pour headers + lignes
- “Aucun résultat” contextualisé (avec actions: clear filters)

---

## 8) Accessibilité & ergonomie
- Navigation clavier:
  - `J/K` ou flèches pour parcourir les événements
  - `Enter` pour ouvrir la Sheet
  - `Esc` ferme la Sheet (déjà géré)
- Focus visible cohérent (ring via variables).
- Taille cible mobile ≥ 44px.

---

## 9) Règles de date / timezone (important)
- Afficher les dates en **locale FR**.
- Toujours clarifier la timezone utilisée (admin):
  - si le projet utilise des dates “sans timezone” (helper `formatDateWithoutTimezone`), continuer avec la même logique.
- Groupement par jour doit suivre la même convention (sinon bugs de “jour décalé”).

---

## 10) Plan d’implémentation (pour une IA)
### Étape A — Ajouter un mode “Agenda”
- Dans `EventsManagement`, créer un switch de vue: `Cards` (actuel) / `Agenda` (nouveau).

### Étape B — Préparer les données
- Trier les events par `date`.
- Construire une structure:
  - `sections: Array<{ key: 'YYYY-MM-DD', label: string, events: Event[] }>`
- Ajouter 3 buckets: `upcoming`, `later`, `past`.

### Étape C — UI
- Layout 2 colonnes (desktop): rail sticky + liste.
- Liste:
  - headers jour sticky
  - rows/carts compactes
  - actions existantes réutilisées

### Étape D — Repérage
- Bouton “Aujourd’hui”, “Aller à…”
- Synchroniser le header sticky avec l’anchor jour visible (IntersectionObserver).

### Étape E — Performance
- Pagination/range query + virtualisation si nécessaire.

---

## 11) Critères de succès
- **Aucune zone vide** en mode par défaut (on n’affiche pas les jours sans événements).
- On peut:
  - trouver “Aujourd’hui” en 1 clic
  - se déplacer à une date précise en ≤ 2 interactions
  - comprendre la charge de la semaine (compteurs)
  - ouvrir/éditer un événement sans perdre le contexte




