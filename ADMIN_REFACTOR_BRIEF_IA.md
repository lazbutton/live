# Live Admin — Brief “IA dev” (refonte Admin en 3 vues)

> Donne ce fichier tel quel à une IA qui **a accès au repo** (Cursor / agent de code).
> Objectif : fournir un cahier des charges **court, actionnable**, avec contraintes + livrables + critères d’acceptation.

---

## 0) Mission (résumé)

- **Réduire l’admin** de 12 sections/pages à **3 vues** : **Dashboard**, **Événements**, **Réglages**.
- **Découper** le monolithe côté événements (`app/(admin)/admin/components/events-management.tsx`) en composants modulaires.
- **Conserver** la logique métier existante (Supabase, API, auth, toasts, hooks) — refactor UX/UI + architecture, pas une réécriture backend.

---

## 1) Contraintes non négociables

- **Tech** : Next.js (App Router), React, TypeScript, Tailwind, Supabase, shadcn/ui (déjà en place).
- **UI** : ne pas ajouter de nouvelle dépendance UI. Composer uniquement avec l’existant.
- **Auth admin** : ne pas modifier `app/(admin)/admin/layout.tsx` (contrôle `role === "admin"` + redirect).
- **API** : ne pas modifier `app/api/**` (les routes restent identiques).
- **Organizers app** : ne pas modifier `app/(organizer)/**`.
- **DB** : pas de migration, pas de changement de schéma (`supabase/**` inchangé).
- **UI toolkit interne** : ne pas éditer `components/ui/**` (utiliser/composer, mais éviter de modifier).

---

## 2) Périmètre livré (les 3 pages)

- **`/admin/dashboard`** : nouveau dashboard (KPI + timeline semaine + demandes en attente + actions rapides).
- **`/admin/events`** : vue calendrier (semaine par défaut), création/édition via **Sheet** (plus de page create séparée).
- **`/admin/settings`** : page “Réglages” unique, avec **Tabs** pour regrouper les anciennes pages (lieux, organisateurs, etc.).

---

## 3) Arborescence cible (attendue)

```
app/(admin)/admin/
├── dashboard/page.tsx                 (refonte totale)
├── events/page.tsx                    (refonte totale)
├── settings/page.tsx                  (nouveau)
└── components/
    ├── admin-sidebar.tsx              (3 items)
    ├── mobile-bottom-nav.tsx          (3 items)
    ├── theme-toggle.tsx               (inchangé)
    ├── dashboard/
    │   ├── kpi-cards.tsx
    │   ├── week-timeline.tsx
    │   ├── pending-requests-feed.tsx
    │   └── quick-actions.tsx
    ├── events/
    │   ├── events-page.tsx
    │   ├── events-calendar.tsx
    │   ├── event-card.tsx
    │   ├── event-form-sheet.tsx
    │   ├── event-image-upload.tsx
    │   ├── event-filters-bar.tsx
    │   └── event-import-dialog.tsx
    └── settings/
        ├── settings-page.tsx
        ├── locations-tab.tsx
        ├── organizers-tab.tsx
        ├── categories-tags-tab.tsx
        ├── users-tab.tsx
        ├── notifications-tab.tsx
        └── system-tab.tsx
```

---

## 4) Données (résumé utile)

L’app s’appuie sur Supabase avec ces entités (sans migration) :

- **`events`** : `id`, `title`, `description`, `date`, `end_date`, `end_time`, `location_id`, `room_id`, `image_url`, `category`, `price`, `presale_price`, `subscriber_price`, `capacity`, `is_full`, `status` (`pending|approved|rejected`), `tag_ids`, `archived`
- **`event_organizers`** : jointure event ↔ organizer **ou** location (exactement un des deux)
- **référentiels** : `locations`, `rooms`, `organizers`, `categories`, `tags`
- **workflow** : `user_requests` (demandes pending), `feedbacks` (feedbacks pending)

---

## 5) Requêtes Supabase à conserver (réutiliser telles quelles)

### 5.1 Charger les événements (requête principale)

```ts
const { data, error } = await supabase
  .from("events")
  .select(`
    *,
    location:locations(id, name),
    event_organizers:event_organizers(
      organizer:organizers(id, name),
      location:locations(id, name)
    )
  `)
  .order("date", { ascending: true });
```

### 5.2 Charger les référentiels

```ts
await supabase.from("categories").select("id, name").eq("is_active", true).order("name");
await supabase.from("tags").select("id, name").order("name");
await supabase.from("locations").select("id, name, address, capacity, latitude, longitude");

const { data: organizersData } = await supabase.from("organizers").select("id, name, instagram_url, facebook_url").order("name");
const { data: locationsData } = await supabase.from("locations").select("id, name, instagram_url, facebook_url").eq("is_organizer", true).order("name");
// fusionner en options avec type: "organizer" | "location"
```

### 5.3 Upload image (bucket `event-images`)

```ts
const { data, error } = await supabase.storage
  .from("event-images")
  .upload(fileName, compressedFile, { cacheControl: "3600", upsert: false });

const { data: { publicUrl } } = supabase.storage.from("event-images").getPublicUrl(data.path);
```

### 5.4 Sauvegarde `event_organizers` (delete + insert)

```ts
await supabase.from("event_organizers").delete().eq("event_id", eventId);

const inserts = selectedOrganizerIds.map((id) => {
  const org = organizers.find((o) => o.id === id);
  return org?.type === "location"
    ? { event_id: eventId, location_id: id }
    : { event_id: eventId, organizer_id: id };
});

await supabase.from("event_organizers").insert(inserts);
```

### 5.5 Création de tag à la volée

```ts
await supabase.from("tags").insert([{ name: name.trim() }]).select("id").single();
```

---

## 6) Hooks / utilitaires à réutiliser

- `useIsMobile()` (`hooks/use-mobile.ts`) : switch responsive (ex: Sheet right vs bottom).
- `usePendingRequestsCount()` (`hooks/use-pending-requests-count.ts`) : badge dashboard.
- `useAlertDialog()` (`hooks/use-alert-dialog.tsx`) : confirm suppression.

---

## 7) Spécifications — Page Événements

### 7.1 `events-page.tsx` (orchestrateur)

Rôle : charger data (events + référentiels), appliquer les **3 filtres** (texte, statut, période), orchestrer :

- `EventFiltersBar`
- `EventsCalendar`
- `EventFormSheet`
- `EventImportDialog`

State attendu (guideline) :
- `events`, `filteredEvents`, `loading`
- `locations`, `organizers`, `tags`, `categories`
- filtres : `searchQuery`, `filterStatus` (`all|pending|approved`), `filterPeriod` (`week|month|all`)
- UI : `selectedEvent`, `isFormOpen`, `isImportOpen`, `defaultDate`

### 7.2 `event-filters-bar.tsx` (ultra-simplifiée)

- Ligne 1 : recherche + bouton **Créer** + bouton **Importer**
- Ligne 2 : toggle statut (**Tous / Pending (X) / Approved**)
- Ligne 3 : toggle période (**Semaine / Mois / Tout**)

Supprimer les filtres : lieu, organisateur, tag, catégorie, “advanced filters”, etc.

### 7.3 `events-calendar.tsx` (semaine + mois)

Comportement obligatoire :
- vue par défaut : **semaine**
- toggle : **semaine ↔ mois**
- navigation : semaine précédente / suivante + bouton **Aujourd’hui**
- chaque jour affiche les `EventCard` correspondantes
- bouton “+” dans chaque jour : ouvre création à la date (pré-remplie)
- si des événements **pending** visibles : bannière `"X événements en attente"` + bouton `"Tout approuver"`
- mobile : bascule vers **jour unique** avec swipe/scroll horizontal **snap**

À supprimer (ne pas re-implémenter) :
- hidden events (localStorage)
- sections collapsables (Past/Later/Hidden)
- compact/comfortable toggle
- double vue agenda/grid
- `agendaRangeDays` (7/14/30)

### 7.4 `event-card.tsx`

Rendu / UX :
- miniature image (si `image_url`), sinon fond coloré basé catégorie
- titre + heure (format `HH:mm` via `date-fns`) + nom lieu
- pastille statut toujours visible :
  - approved : vert
  - pending : orange + bordure gauche orange
  - rejected : rouge + opacité réduite
- si pending : bouton ✓ (approbation rapide) en overlay (si handler fourni)
- hover : `shadow-md` + légère scale

### 7.5 Approvals (rapide + lot)

- **Rapide** : sur une carte pending → update `events.status = "approved"` + toast + refresh UI.
- **Lot** : bannière calendrier `"Tout approuver"` → approuve tous les pending visibles + toast `"X approuvés"`.
- Micro-interaction : flash vert léger sur carte approuvée (transition courte).

### 7.6 `event-form-sheet.tsx` (création/édition)

UI :
- desktop : `Sheet` à droite (~500px)
- mobile : `Sheet` bottom plein écran (via `useIsMobile()`)
- actions sticky en bas : **Enregistrer**, **Enregistrer & Approuver**, **Supprimer** (édition uniquement, confirm)

Champs “principaux” (toujours visibles, dans l’ordre) :
- Titre (`Input`, required)
- Date début (`DateTimePicker`)
- Date fin (`DateTimePicker`, optionnel, affiché via bouton “Ajouter date de fin”)
- Lieu (`SelectSearchable`)
- Catégorie (`Select`)
- Image (`EventImageUpload`)
- Statut (UI radio visuelle : pending/approved/rejected)

Champs “avancés” dans un Accordion “Plus d’options” (fermé par défaut) :
- Description, Tags (`MultiSelectCreatable`), Organisateurs (`MultiSelect`)
- Prix / prévente / abonné, Capacité, Complet (`Switch`)
- URL externe + label, Instagram, Facebook
- Salle (`Select`, chargé dynamiquement selon location)
- Heure ouverture portes, URL scraping

Logique de sauvegarde : reprendre l’existant (sans changer l’intention) :
- upload image si nécessaire
- dériver address/lat/long depuis location sélectionnée
- conversions type (`parseFloat`, `parseInt`)
- upsert `events`
- `event_organizers` : delete + insert
- tags : mise à jour `tag_ids` + création à la volée
- toast succès/erreur

### 7.7 `event-image-upload.tsx`

Encapsuler toute la logique image (reprendre l’existant) :
- sélection fichier + crop (`react-easy-crop`, ratio 3:2)
- compression via utilitaire existant (`compressImage` dans `lib/`)
- preview + bouton supprimer
- alternative : input URL

### 7.8 `event-import-dialog.tsx`

Dialog import URL :
- champ URL + select organisateur
- appel API existante (`/api/events/scrape` ou `/api/organizer/scrape-agenda-stream`)
- loader pendant scraping
- résultat : pré-remplit `EventFormSheet`

---

## 8) Spécifications — Nouveau Dashboard

Remplacer totalement l’existant du dashboard par 4 blocs :

### 8.1 `kpi-cards.tsx` (3 cartes)

Cartes :
- **Événements pending** (count) → lien `/admin/events?status=pending`
- **Cette semaine** (count) → lien `/admin/events`
- **Demandes en attente** (count) → scroll vers section demandes (ou focus)

Design :
- grid 3 colonnes desktop / 1 colonne mobile
- grande valeur (style “KPI”), icône à droite, fond subtil, cliquable

### 8.2 `week-timeline.tsx`

- 7 prochains jours, colonnes (desktop) / slider snap (mobile)
- affiche `EventCard compact`
- clic sur event : ouvre `EventFormSheet` en édition

### 8.3 `pending-requests-feed.tsx`

But : afficher les `user_requests` pending (5 max) directement sur le dashboard.
- visible uniquement si `count > 0`
- chaque item : titre, date proposée, badge type, ancienneté
- actions : **Convertir en événement** (ouvre `EventFormSheet` pré-rempli) + **Rejeter** (update status)

### 8.4 `quick-actions.tsx`

2 boutons :
- “Créer un événement” → va sur `/admin/events` et ouvre le Sheet en création
- “Importer depuis URL” → va sur `/admin/events` et ouvre le dialog import

---

## 9) Spécifications — Page Réglages

Créer `app/(admin)/admin/settings/page.tsx` avec `Tabs` (shadcn) et 6 onglets :
- Lieux
- Organisateurs
- Catégories & Tags
- Utilisateurs
- Notifications
- Système

Chaque onglet doit **réutiliser la logique existante** des composants actuels (renommer / adapter en sous-composant) :
- Lieux : depuis `app/(admin)/admin/components/locations-management.tsx`
- Organisateurs : depuis `app/(admin)/admin/components/organizers-management.tsx`
- Catégories & Tags : fusion `app/(admin)/admin/components/categories-management.tsx` + `app/(admin)/admin/components/tags-management.tsx` (2 sections séparées par `Separator`)
- Utilisateurs : depuis `app/(admin)/admin/components/users-management.tsx`
- Notifications : depuis `app/(admin)/admin/components/notifications-management.tsx`
- Système : depuis `app/(admin)/admin/components/crons-management.tsx` (+ intégrer feedbacks ici)

Feedbacks (simplification) :
- plus de page feedback dédiée
- dans l’onglet Système : liste des feedbacks pending + bouton “Marquer comme lu”

---

## 10) Navigation (sidebar + mobile)

### 10.1 Sidebar `admin-sidebar.tsx`

Remplacer la navigation par **3 items** :
- Dashboard (`/admin/dashboard`) + badge demandes pending
- Événements (`/admin/events`) + badge événements pending
- Réglages (`/admin/settings`)

Règles UX :
- icônes plus grandes, padding plus généreux
- badge numérique visible (style “destructive”)
- supprimer navigation clavier (inutile à 3 items)
- garder dropdown user (logout) en bas

### 10.2 Bottom nav mobile `mobile-bottom-nav.tsx`

Même 3 items, icône + label, item actif en primary, badge si pending.

---

## 11) Fichiers/pages à supprimer (après refonte)

```
app/(admin)/admin/locations/page.tsx
app/(admin)/admin/organizers/page.tsx
app/(admin)/admin/users/page.tsx
app/(admin)/admin/categories/page.tsx
app/(admin)/admin/tags/page.tsx
app/(admin)/admin/requests/page.tsx
app/(admin)/admin/feedback/page.tsx
app/(admin)/admin/notifications/page.tsx
app/(admin)/admin/crons/page.tsx
app/(admin)/admin/events/create/page.tsx
app/(admin)/admin/components/events-management.tsx
app/(admin)/admin/components/dashboard-stats.tsx
app/(admin)/admin/components/mobile-table-view.tsx
app/(admin)/admin/components/share-network-content.tsx
```

---

## 12) Ordre d’implémentation conseillé

1) `EventCard` → 2) `EventFiltersBar` → 3) `EventImageUpload` → 4) `EventFormSheet`
→ 5) `EventImportDialog` → 6) `EventsCalendar` → 7) `EventsPage` → 8) page `/admin/events`
→ 9) `settings/*` → 10) page `/admin/settings`
→ 11) `dashboard/*` → 12) page `/admin/dashboard`
→ 13) sidebar + bottom nav → 14) suppression anciennes pages → 15) vérifs responsive

---

## 13) Definition of Done (checklist)

- [ ] Sidebar et bottom nav : **3 items** uniquement
- [ ] Dashboard : **3 KPI** + timeline 7 jours + demandes pending + actions rapides
- [ ] Events : calendrier semaine par défaut + toggle mois + navigation + création “+”
- [ ] EventCard : statut visible + approbation rapide pending
- [ ] Sheet formulaire : champs principaux + accordion options + actions sticky
- [ ] Approve en lot : bannière “Tout approuver”
- [ ] Import URL : fonctionne comme avant
- [ ] Crop/compression image : fonctionne comme avant
- [ ] Réglages : Tabs avec 6 onglets fonctionnels + feedbacks intégrés dans Système
- [ ] Aucune page supprimée n’est encore référencée (liens/imports)
- [ ] Auth admin inchangée et fonctionnelle

