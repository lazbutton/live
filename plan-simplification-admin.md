# Live Admin — Brief “IA dev” (refonte Admin en 3 vues)

> Donne ce fichier tel quel à une IA qui **a accès au repo** (Cursor / agent de code).
> Objectif : fournir un cahier des charges **court, actionnable**, avec contraintes + livrables + critères d’acceptation.
>
> Version “sans annexe” (recommandée à envoyer) : `ADMIN_REFACTOR_BRIEF_IA.md`

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

---

## Annexe (référence) — Détails complets (optionnel)

<details>
<summary>Ouvrir les détails complets (schéma, interfaces, requêtes, etc.)</summary>

# Plan de refonte complète de l'admin — Live Admin

> Brief technique destiné à un LLM pour implémenter toutes les améliorations ci-dessous.
> **Objectif : passer de 12 sections admin surchargées à 3 vues limpides, centrées sur la gestion d'événements.**

---

## 1. Contexte technique complet

### Stack

| Techno | Version | Usage |
|---|---|---|
| Next.js | 16.0.10 | App Router, RSC |
| React | 19.2.0 | UI |
| TypeScript | 5 | Typage |
| Supabase | @supabase/ssr 0.8, supabase-js 2.86 | BDD, Auth, Storage |
| TailwindCSS | 4 | Styles |
| shadcn/ui + Radix UI | Dernières | Composants UI |
| Lucide React | 0.555.0 | Icônes |
| date-fns | 4.1.0 | Dates |
| react-easy-crop | 5.5.6 | Crop image |
| @dnd-kit | core 6.3, sortable 10.0 | Drag & drop |
| sonner | (via toaster) | Toasts |
| firebase-admin | 13.6.0 | Push FCM |
| openai | 6.10.0 | Scraping IA |

### Clients Supabase

**Client-side** (`lib/supabase/client.ts`) :
```typescript
import { createBrowserClient } from "@supabase/ssr";
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);
```

**Server-side** (`lib/supabase/server.ts`) :
```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(c) { try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} } } }
  );
}
```

### Auth admin

Le layout `app/(admin)/admin/layout.tsx` vérifie `user.user_metadata?.role === "admin"` via `supabase.auth.getUser()`. Redirige vers `/admin/login` si non-admin. **Ne pas toucher à cette logique.**

### Composants shadcn/ui disponibles (34 total)

`address-input`, `alert`, `alert-dialog`, `avatar`, `badge`, `breadcrumb`, `button`, `card`, `checkbox`, `date-time-picker`, `dialog`, `dropdown-menu`, `input`, `label`, `multi-select`, `multi-select-creatable`, `popover`, `progress`, `select`, `select-searchable`, `separator`, `sheet`, `sidebar`, `skeleton`, `switch`, `table`, `tabs`, `textarea`, `toast`, `toaster`, `tooltip`, `use-toast`

**Utiliser exclusivement ces composants. Ne PAS installer de nouvelle dépendance UI.**

### Hooks custom existants

**`hooks/use-mobile.ts`** — `useIsMobile()` → `boolean` (breakpoint 768px)

**`hooks/use-pending-requests-count.ts`** — `usePendingRequestsCount()` → `{ count: number | null, loading: boolean }` — Requête Supabase `user_requests.status=pending`, refresh 30s.

**`hooks/use-alert-dialog.tsx`** — `useAlertDialog()` → `{ showAlert, showConfirm, AlertDialogComponent }` — Dialog de confirmation réutilisable.

---

## 2. Schéma de base de données complet

### Table `events`
```sql
CREATE TABLE public.events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    title text NOT NULL,
    description text,
    date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    end_time text,                        -- Format HH:MM
    location_id uuid REFERENCES locations(id),
    room_id uuid REFERENCES rooms(id),
    image_url text,
    category text NOT NULL,               -- FK vers categories.name
    price numeric(10,2),
    presale_price numeric(10,2),
    subscriber_price numeric(10,2),
    address text,
    capacity integer,
    door_opening_time text,
    external_url text,
    external_url_label text,
    instagram_url text,
    facebook_url text,
    scraping_url text,
    latitude numeric(10,8),
    longitude numeric(11,8),
    tag_ids uuid[] DEFAULT '{}'::uuid[],  -- Array dénormalisé
    is_full boolean DEFAULT false,
    status text DEFAULT 'pending',         -- 'pending' | 'approved' | 'rejected'
    archived boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
```

### Table `event_organizers`
```sql
CREATE TABLE public.event_organizers (
    event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    organizer_id uuid REFERENCES organizers(id),
    location_id uuid REFERENCES locations(id),
    -- Contrainte : exactement un des deux doit être rempli
    CONSTRAINT event_organizers_exactly_one_organizer CHECK (
      (organizer_id IS NOT NULL AND location_id IS NULL)
      OR (organizer_id IS NULL AND location_id IS NOT NULL)
    )
);
```

### Table `locations`
```sql
CREATE TABLE public.locations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    address text NOT NULL,
    image_url text,
    short_description text,
    capacity integer,
    directions text,
    latitude numeric(10,8),
    longitude numeric(11,8),
    instagram_url text,
    facebook_url text,
    website_url text,
    scraping_example_url text,
    tiktok_url text,
    facebook_page_id text,
    is_organizer boolean DEFAULT false,   -- Peut agir comme organisateur
    suggested boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
```

### Table `rooms`
```sql
CREATE TABLE public.rooms (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    name text NOT NULL,
    capacity integer,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
```

### Table `categories`
```sql
CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    description text,
    icon_url text,
    icon_svg text,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
```

### Table `tags`
```sql
CREATE TABLE public.tags (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);
```

### Table `organizers`
```sql
CREATE TABLE public.organizers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    logo_url text,
    icon_url text,
    short_description text,
    instagram_url text,
    facebook_url text,
    website_url text,
    scraping_example_url text,
    facebook_page_id text,
    tiktok_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
```

### Table `user_requests`
```sql
CREATE TABLE public.user_requests (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    requested_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected' | 'converted'
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    notes text,
    request_type text DEFAULT 'user_account',  -- 'event_creation' | 'event_from_url'
    event_data jsonb,              -- Contient les champs de l'événement proposé
    requested_by uuid,
    location_id uuid,
    location_name text,
    source_url text,
    converted_event_id uuid,
    converted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
```

### Table `feedbacks`
```sql
CREATE TABLE public.feedbacks (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    feedback_object_id uuid NOT NULL,
    description text NOT NULL,
    status text DEFAULT 'pending',  -- 'pending' | 'read' | 'resolved' | 'archived'
    admin_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
```

---

## 3. Interfaces TypeScript à réutiliser

```typescript
// === ÉVÉNEMENT ===
interface Event {
  id: string;
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  end_time: string | null;
  status: "pending" | "approved" | "rejected";
  category: string;
  price: number | null;
  presale_price: number | null;
  subscriber_price: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  is_full: boolean | null;
  location_id: string | null;
  room_id: string | null;
  door_opening_time: string | null;
  external_url: string | null;
  external_url_label: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  scraping_url: string | null;
  image_url: string | null;
  tag_ids?: string[];
  archived?: boolean;
  created_at?: string;
  location?: { id: string; name: string } | null;
  event_organizers?: Array<{
    organizer?: { id: string; name: string } | null;
    location?: { id: string; name: string } | null;
  }>;
}

// === FORMULAIRE ÉVÉNEMENT ===
interface EventFormData {
  title: string;
  description: string;
  date: string;           // Format datetime-local
  end_date: string;
  category: string;
  price: string;          // String pour le form, converti en parseFloat au save
  presale_price: string;
  subscriber_price: string;
  capacity: string;       // String pour le form, converti en parseInt au save
  is_full: boolean;
  location_id: string;
  room_id: string;
  door_opening_time: string;
  external_url: string;
  external_url_label: string;
  instagram_url: string;
  facebook_url: string;
  scraping_url: string;
  image_url: string;
  status: "draft" | "pending" | "approved" | "rejected";
}

// === LOCATION ===
interface LocationData {
  id: string;
  name: string;
  address: string;
  capacity: number | null;
  latitude: number | null;
  longitude: number | null;
}

// === ORGANISATEUR (combiné) ===
interface OrganizerOption {
  id: string;
  name: string;
  instagram_url: string | null;
  facebook_url: string | null;
  type: "organizer" | "location";
}

// === DEMANDE UTILISATEUR ===
interface UserRequest {
  id: string;
  requested_at: string;
  status: "pending" | "approved" | "rejected" | "converted";
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  request_type?: "event_creation" | "event_from_url";
  requested_by?: string | null;
  source_url?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  converted_event_id?: string | null;
  converted_at?: string | null;
  event_data?: {
    title?: string;
    description?: string;
    date?: string;
    end_date?: string;
    category?: string;
    location_id?: string;
    location_name?: string;
    organizer_id?: string;
    organizer_names?: string[];
    price?: number;
    address?: string;
    capacity?: number;
    image_url?: string;
    door_opening_time?: string;
    external_url?: string;
    external_url_label?: string;
    scraping_url?: string;
    [key: string]: unknown;
  };
}

// === FEEDBACK ===
interface Feedback {
  id: string;
  user_id: string;
  feedback_object_id: string;
  description: string;
  status: "pending" | "read" | "resolved" | "archived";
  admin_notes: string | null;
  created_at: string;
}
```

---

## 4. Requêtes Supabase existantes à conserver

### Chargement des événements (la requête principale)
```typescript
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

### Chargement des données de référence
```typescript
// Catégories
const { data } = await supabase.from("categories").select("id, name").eq("is_active", true).order("name");

// Tags
const { data } = await supabase.from("tags").select("id, name").order("name");

// Locations
const { data } = await supabase.from("locations").select("id, name, address, capacity, latitude, longitude");

// Organisateurs (combine 2 sources)
const { data: organizersData } = await supabase.from("organizers").select("id, name, instagram_url, facebook_url").order("name");
const { data: locationsData } = await supabase.from("locations").select("id, name, instagram_url, facebook_url").eq("is_organizer", true).order("name");
// Fusionner avec type: "organizer" | "location"
```

### Stats dashboard
```typescript
const [eventsResult, suggestedLocationsResult, requestsResult, feedbacksResult] = await Promise.all([
  supabase.from("events").select("id, status, date"),
  supabase.from("locations").select("id").eq("suggested", true),
  supabase.from("user_requests").select("id").eq("status", "pending"),
  supabase.from("feedbacks").select("id").eq("status", "pending"),
]);
```

### Compteurs pending (dashboard)
```typescript
const [eventsRes, reqRes, fbRes] = await Promise.all([
  supabase.from("events").select("*", { count: "exact", head: true }).eq("status", "pending"),
  supabase.from("user_requests").select("*", { count: "exact", head: true }).eq("status", "pending").in("request_type", ["event_creation", "event_from_url"]),
  supabase.from("feedbacks").select("*", { count: "exact", head: true }).eq("status", "pending"),
]);
```

### Upload d'image
```typescript
// Bucket : "event-images"
const { data, error } = await supabase.storage
  .from("event-images")
  .upload(fileName, compressedFile, { cacheControl: "3600", upsert: false });

const { data: { publicUrl } } = supabase.storage.from("event-images").getPublicUrl(data.path);
```

### Sauvegarde des event_organizers
```typescript
// Supprimer les anciens
await supabase.from("event_organizers").delete().eq("event_id", eventId);

// Insérer les nouveaux (distinguer organizer vs location)
const inserts = selectedOrganizerIds.map(id => {
  const org = organizers.find(o => o.id === id);
  return org?.type === "location"
    ? { event_id: eventId, location_id: id }
    : { event_id: eventId, organizer_id: id };
});
await supabase.from("event_organizers").insert(inserts);
```

### Création de tag à la volée
```typescript
const { data, error } = await supabase.from("tags").insert([{ name: name.trim() }]).select("id").single();
```

---

## 5. Architecture actuelle → Architecture cible

### AVANT : 12 pages, 23 composants, sidebar surchargée
```
app/(admin)/admin/
├── dashboard/page.tsx
├── events/page.tsx + events/create/page.tsx
├── locations/page.tsx
├── organizers/page.tsx
├── users/page.tsx
├── categories/page.tsx
├── tags/page.tsx
├── requests/page.tsx
├── feedback/page.tsx
├── notifications/page.tsx
├── crons/page.tsx
├── scraping/[id]/page.tsx
├── components/ (23 fichiers, dont events-management.tsx à 3648 lignes)
```

### APRÈS : 3 pages, composants modulaires
```
app/(admin)/admin/
├── dashboard/page.tsx              ← REFONTE TOTALE
├── events/page.tsx                 ← REFONTE TOTALE (plus de page create séparée)
├── settings/page.tsx               ← NOUVEAU (regroupe tout le reste)
├── components/
│   ├── admin-layout.tsx            ← SIMPLIFIÉ
│   ├── admin-sidebar.tsx           ← 3 ITEMS SEULEMENT
│   ├── mobile-bottom-nav.tsx       ← 3 ITEMS SEULEMENT
│   ├── theme-toggle.tsx            ← INCHANGÉ
│   │
│   ├── dashboard/
│   │   ├── kpi-cards.tsx           ← NOUVEAU (3 cartes KPI)
│   │   ├── week-timeline.tsx       ← NOUVEAU (timeline 7 jours)
│   │   ├── pending-requests-feed.tsx ← NOUVEAU (demandes inline)
│   │   └── quick-actions.tsx       ← NOUVEAU (créer + importer)
│   │
│   ├── events/
│   │   ├── events-page.tsx         ← NOUVEAU (orchestrateur)
│   │   ├── events-calendar.tsx     ← NOUVEAU (vue calendrier semaine/mois)
│   │   ├── event-card.tsx          ← NOUVEAU (carte réutilisable)
│   │   ├── event-form-sheet.tsx    ← NOUVEAU (formulaire en Sheet latéral)
│   │   ├── event-filters-bar.tsx   ← NOUVEAU (filtres simplifiés)
│   │   ├── event-image-upload.tsx  ← NOUVEAU (upload + crop isolé)
│   │   └── event-import-dialog.tsx ← NOUVEAU (import URL)
│   │
│   ├── settings/
│   │   ├── settings-page.tsx       ← NOUVEAU (onglets)
│   │   ├── locations-tab.tsx       ← REPRIS de locations-management.tsx
│   │   ├── organizers-tab.tsx      ← REPRIS de organizers-management.tsx
│   │   ├── categories-tags-tab.tsx ← FUSION categories + tags
│   │   ├── users-tab.tsx           ← REPRIS de users-management.tsx
│   │   ├── notifications-tab.tsx   ← REPRIS de notifications-management.tsx
│   │   └── system-tab.tsx          ← REPRIS de crons-management.tsx
```

---

## 6. Phase 1 — Découpage de events-management.tsx (CRITIQUE)

Le fichier `events-management.tsx` fait **3 648 lignes**. C'est le cœur du problème. Voici exactement comment le découper.

### 6.1 — `events-page.tsx` (~150 lignes)

**Rôle :** Orchestrateur. Charge les données, gère les filtres, passe les props aux sous-composants.

**State à garder ici :**
```typescript
const [events, setEvents] = useState<Event[]>([]);
const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
const [loading, setLoading] = useState(true);
const [locations, setLocations] = useState<LocationData[]>([]);
const [organizers, setOrganizers] = useState<OrganizerOption[]>([]);
const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

// Filtres simplifiés (3 au lieu de 6+)
const [searchQuery, setSearchQuery] = useState("");
const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved">("all");
const [filterPeriod, setFilterPeriod] = useState<"week" | "month" | "all">("week");

// Dialog
const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
const [isFormOpen, setIsFormOpen] = useState(false);
const [isImportOpen, setIsImportOpen] = useState(false);
```

**Fonctions à garder ici :** `loadEvents()`, `loadCategories()`, `loadTags()`, `loadLocations()`, `loadOrganizers()`, la logique de filtrage.

**JSX :**
```tsx
<div>
  <EventFiltersBar ... />
  <EventsCalendar events={filteredEvents} onEventClick={...} onCreateClick={...} />
  <EventFormSheet event={selectedEvent} open={isFormOpen} ... />
  <EventImportDialog open={isImportOpen} ... />
</div>
```

### 6.2 — `events-calendar.tsx` (~300 lignes)

**Rôle :** Vue calendrier unifiée. Remplace TOUTES les vues actuelles (agenda + grid).

**Props :**
```typescript
interface EventsCalendarProps {
  events: Event[];
  onEventClick: (event: Event) => void;
  onCreateAtDate: (date: Date) => void;
  onQuickApprove: (eventId: string) => Promise<void>;
  onBulkApprove: (eventIds: string[]) => Promise<void>;
}
```

**Comportement :**
- Vue par défaut : **semaine** (7 colonnes desktop, scroll vertical mobile)
- Toggle pour basculer en vue **mois** (grille classique 7×4/5)
- Navigation : boutons `← Semaine précédente` / `Semaine suivante →` + bouton "Aujourd'hui"
- Chaque cellule jour affiche les `EventCard` correspondantes
- Bouton "+" flottant dans chaque cellule pour créer un événement à cette date
- Si des événements sont pending, afficher un bandeau en haut : `"X événements en attente"` avec bouton `"Tout approuver"`
- Sur mobile (`useIsMobile()`), basculer automatiquement en vue jour unique avec swipe horizontal via scroll-snap

**Supprimer complètement :**
- Le mécanisme de "hidden events" (localStorage)
- Les sections collapsables (Past, Later, Hidden)
- Le toggle compact/comfortable
- La double vue agenda/grid
- Le agendaRangeDays (7/14/30)

### 6.3 — `event-card.tsx` (~120 lignes)

**Rôle :** Carte visuelle d'un événement. Réutilisée dans le calendrier ET le dashboard.

**Props :**
```typescript
interface EventCardProps {
  event: Event;
  onClick: () => void;
  onQuickApprove?: () => Promise<void>;
  compact?: boolean;  // true dans le dashboard, false dans le calendrier
}
```

**Rendu visuel :**
- Image miniature en fond (si `image_url` existe), sinon fond coloré basé sur la catégorie
- Titre en overlay (texte blanc sur fond sombre semi-transparent si image, texte normal sinon)
- Heure (format `HH:mm` extrait de `date` avec `date-fns`)
- Nom du lieu (`event.location?.name` si disponible)
- **Pastille de statut** toujours visible :
  - `approved` → pastille verte (cercle 8px `bg-emerald-500`)
  - `pending` → pastille orange (cercle 8px `bg-amber-500`) + bordure gauche orange `border-l-2 border-amber-500`
  - `rejected` → pastille rouge + opacité réduite `opacity-50`
- Si `event.status === "pending"` ET `onQuickApprove` fourni : bouton ✓ vert en overlay coin supérieur droit
- Hover : légère élévation (`shadow-md`) et scale 1.02

### 6.4 — `event-form-sheet.tsx` (~400 lignes)

**Rôle :** Formulaire de création/édition d'événement dans un `Sheet` latéral (côté droit).

**Props :**
```typescript
interface EventFormSheetProps {
  event: Event | null;           // null = création, sinon édition
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: EventFormData, organizerIds: string[], tagIds: string[]) => Promise<void>;
  onDelete?: (eventId: string) => Promise<void>;
  locations: LocationData[];
  organizers: OrganizerOption[];
  tags: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  defaultDate?: Date;            // Pour pré-remplir la date quand on clique sur "+" d'un jour
}
```

**Structure du formulaire — 2 niveaux :**

**Champs principaux (toujours visibles, dans cet ordre) :**

| Champ | Composant shadcn | Notes |
|---|---|---|
| Titre | `<Input>` | Required, placeholder "Nom de l'événement" |
| Date de début | `<DateTimePicker>` | Composant custom existant dans `components/ui/date-time-picker.tsx` |
| Date de fin | `<DateTimePicker>` | Optionnel, bouton "Ajouter date de fin" qui l'affiche |
| Lieu | `<SelectSearchable>` | Composant existant `components/ui/select-searchable.tsx`, options depuis locations |
| Catégorie | `<Select>` | Options depuis categories |
| Image | `<EventImageUpload>` (sous-composant) | Upload + crop |
| Statut | 3 boutons radio visuels (pastilles colorées) | `pending` / `approved` / `rejected` |

**Champs avancés (dans un `<Accordion>` "Plus d'options", fermé par défaut) :**

| Champ | Composant | Notes |
|---|---|---|
| Description | `<Textarea>` | |
| Tags | `<MultiSelectCreatable>` | Composant existant, permet de créer de nouveaux tags |
| Organisateurs | `<MultiSelect>` | Composant existant, options combinant `organizers` + `locations` (is_organizer) |
| Prix | `<Input type="number">` | |
| Prix prévente | `<Input type="number">` | |
| Prix abonné | `<Input type="number">` | |
| Capacité | `<Input type="number">` | Auto-rempli depuis location.capacity si lieu sélectionné |
| Complet | `<Switch>` | |
| URL externe | `<Input type="url">` | |
| Label URL | `<Input>` | |
| Instagram | `<Input type="url">` | |
| Facebook | `<Input type="url">` | |
| Salle | `<Select>` | Chargé dynamiquement quand location_id change, requête : `supabase.from("rooms").select("id, name").eq("location_id", locationId)` |
| Heure ouverture portes | `<Input type="time">` | |
| URL scraping | `<Input type="url">` | |

**Boutons d'action (sticky en bas du Sheet) :**
- `"Enregistrer"` — Sauvegarde avec le statut actuel du toggle
- `"Enregistrer & Approuver"` — Raccourci : sauvegarde + force `status: "approved"`
- `"Supprimer"` — Bouton destructive, visible uniquement en mode édition, avec confirmation via `useAlertDialog`

**Logique de sauvegarde (conserver la logique existante) :**
```typescript
// 1. Upload image si imageFile existe
// 2. Résoudre address/latitude/longitude depuis la location sélectionnée
// 3. Convertir les types (parseFloat pour prix, parseInt pour capacity)
// 4. Upsert dans events
// 5. Gérer event_organizers (delete + insert)
// 6. Mettre à jour tag_ids (array dans events)
// 7. Toast de succès via sonner
```

### 6.5 — `event-image-upload.tsx` (~150 lignes)

**Rôle :** Encapsule toute la logique d'image : sélection fichier, saisie URL, crop avec react-easy-crop, compression, preview.

**Props :**
```typescript
interface EventImageUploadProps {
  currentImageUrl: string | null;
  onImageChange: (file: File | null, previewUrl: string | null) => void;
  onUrlChange: (url: string) => void;
}
```

**Reprendre exactement la logique existante :**
- `react-easy-crop` avec `Cropper` component
- Ratio 3:2 par défaut
- Compression via la lib `compressImage` existante dans `lib/`
- Preview miniature
- Bouton "Supprimer l'image"
- Input URL alternative

### 6.6 — `event-filters-bar.tsx` (~80 lignes)

**Rôle :** Barre de filtres horizontale ultra-simplifiée.

**Props :**
```typescript
interface EventFiltersBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterStatus: "all" | "pending" | "approved";
  onFilterStatusChange: (s: "all" | "pending" | "approved") => void;
  filterPeriod: "week" | "month" | "all";
  onFilterPeriodChange: (p: "week" | "month" | "all") => void;
  pendingCount: number;
  onCreateClick: () => void;
  onImportClick: () => void;
}
```

**Rendu :**
- **Ligne 1 :** `<Input>` recherche texte (icône Search) + Bouton "Créer" (icône Plus) + Bouton "Importer" (icône Download)
- **Ligne 2 :** 3 toggle buttons pour le statut (`Tous` / `Pending (X)` / `Approved`) — utiliser des `<Button variant="outline">` avec `variant="default"` pour l'actif. Le bouton Pending affiche le count.
- **Ligne 2 bis :** 3 toggle buttons pour la période (`Semaine` / `Mois` / `Tout`)

**Supprimer complètement les filtres suivants :** lieu, organisateur, tag, catégorie, le toggle showAdvancedFilters.

### 6.7 — `event-import-dialog.tsx` (~100 lignes)

**Rôle :** Dialog pour importer un événement depuis une URL.

**Reprendre la logique existante :**
- `<Dialog>` avec champ URL et select organisateur
- Appel API `/api/events/scrape` ou `/api/organizer/scrape-agenda-stream`
- Spinner pendant le scraping
- Résultat pré-remplit le formulaire

---

## 7. Phase 2 — Nouveau Dashboard

### Remplacer entièrement `dashboard/page.tsx` et `dashboard-stats.tsx`

### 7.1 — `kpi-cards.tsx` (~80 lignes)

**3 cartes KPI seulement (au lieu de 5) :**

| Carte | Query Supabase | Style si > 0 | Lien |
|---|---|---|---|
| Événements pending | `events.status=pending` (count exact) | Fond orange, icône AlertCircle | `/admin/events?status=pending` |
| Cette semaine | `events.date >= today AND date < today+7` (compter) | Fond bleu, icône CalendarClock | `/admin/events` |
| Demandes en attente | `user_requests.status=pending` (count exact) | Fond cyan, icône FileText | Scroll vers section demandes |

**Design :** Cartes en `grid grid-cols-3` sur desktop, `grid-cols-1` sur mobile. Chaque carte : grande valeur numérique (text-4xl font-bold), label dessous (text-sm text-muted-foreground), icône à droite. Fond gradient subtil. Cliquable.

### 7.2 — `week-timeline.tsx` (~200 lignes)

**Timeline horizontale des 7 prochains jours.**

**Data :** Utilise les events chargés, filtrés sur `date >= today AND date < today+7`.

**Rendu desktop :** 7 colonnes côte à côte (lundi→dimanche), chaque colonne :
- Header : jour de la semaine + date (ex: "Lun 24")
- Liste verticale de `<EventCard compact />` pour chaque événement de ce jour
- Si le jour est aujourd'hui, header avec fond primary léger
- Si pas d'événement : texte "Aucun" en gris italic

**Rendu mobile :** Scroll horizontal snap, chaque jour est un "slide" pleine largeur.

**Interactions :** Clic sur une `EventCard` → ouvre le `EventFormSheet` en mode édition.

### 7.3 — `pending-requests-feed.tsx` (~120 lignes)

**Affiche les demandes utilisateurs directement sur le dashboard (remplace la page requests).**

**Visible uniquement si `count > 0`.**

**Query :**
```typescript
const { data } = await supabase
  .from("user_requests")
  .select("*")
  .eq("status", "pending")
  .in("request_type", ["event_creation", "event_from_url"])
  .order("requested_at", { ascending: false })
  .limit(5);
```

**Rendu :** Chaque demande est une carte compacte :
- Titre (`event_data.title` ou domaine de `source_url`)
- Date proposée (`event_data.date`)
- Type (badge : "Complet" ou "URL")
- Ancienneté (il y a X min/h/j)
- **2 boutons :** "Convertir en événement" (ouvre EventFormSheet pré-rempli avec event_data) + "Rejeter" (met à jour status)

### 7.4 — `quick-actions.tsx` (~40 lignes)

**2 boutons d'action seulement :**
- "Créer un événement" → Navigue vers `/admin/events` et ouvre le formulaire
- "Importer depuis URL" → Navigue vers `/admin/events` et ouvre le dialog import

---

## 8. Phase 3 — Page Réglages unifiée

### Créer `app/(admin)/admin/settings/page.tsx`

**Structure :** Utiliser le composant `<Tabs>` de shadcn/ui avec des onglets horizontaux.

```tsx
<AdminLayout title="Réglages">
  <Tabs defaultValue="locations">
    <TabsList>
      <TabsTrigger value="locations">Lieux</TabsTrigger>
      <TabsTrigger value="organizers">Organisateurs</TabsTrigger>
      <TabsTrigger value="categories">Catégories & Tags</TabsTrigger>
      <TabsTrigger value="users">Utilisateurs</TabsTrigger>
      <TabsTrigger value="notifications">Notifications</TabsTrigger>
      <TabsTrigger value="system">Système</TabsTrigger>
    </TabsList>
    <TabsContent value="locations"><LocationsTab /></TabsContent>
    <TabsContent value="organizers"><OrganizersTab /></TabsContent>
    <TabsContent value="categories"><CategoriesTagsTab /></TabsContent>
    <TabsContent value="users"><UsersTab /></TabsContent>
    <TabsContent value="notifications"><NotificationsTab /></TabsContent>
    <TabsContent value="system"><SystemTab /></TabsContent>
  </Tabs>
</AdminLayout>
```

**Pour chaque onglet :** Reprendre le composant existant correspondant et l'adapter en sous-composant. Pas besoin de réécrire la logique, juste renommer et intégrer. Spécifiquement :

| Onglet | Source existante | Changement |
|---|---|---|
| Lieux | `locations-management.tsx` | Renommer, retirer le wrapper page |
| Organisateurs | `organizers-management.tsx` | Idem |
| Catégories & Tags | `categories-management.tsx` + `tags-management.tsx` | Fusionner dans un composant avec 2 sections séparées par un `<Separator>` |
| Utilisateurs | `users-management.tsx` | Renommer |
| Notifications | `notifications-management.tsx` | Renommer |
| Système | `crons-management.tsx` | Renommer, ajouter éventuellement les configs de scraping |

---

## 9. Phase 4 — Sidebar et navigation

### 9.1 — Nouvelle sidebar (`admin-sidebar.tsx`)

**Remplacer les 12 items par 3 :**

```typescript
const menuItems = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,    // lucide-react
    url: "/admin/dashboard",
    badge: pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
  },
  {
    title: "Événements",
    icon: Calendar,
    url: "/admin/events",
    badge: pendingEventsCount > 0 ? pendingEventsCount : undefined,
  },
  {
    title: "Réglages",
    icon: Settings,
    url: "/admin/settings",
  },
];
```

**Design :**
- Icônes plus grandes (`h-6 w-6` au lieu de `h-4 w-4`)
- Padding plus généreux (`p-4` au lieu de `p-2`)
- Badge numérique : pastille rouge avec count (`<Badge variant="destructive">`)
- **Supprimer** le système de navigation par clavier (inutile pour 3 items)
- **Garder** le dropdown user en bas avec logout

### 9.2 — Nouvelle bottom nav mobile (`mobile-bottom-nav.tsx`)

**3 items seulement :** Dashboard, Événements, Réglages — mêmes icônes que la sidebar.

Chaque item : icône + label texte dessous. Item actif : couleur primary. Badge sur Événements si pending > 0.

---

## 10. Phase 5 — Améliorations UX transversales

### 10.1 — Approbation rapide partout

**Sur chaque `EventCard` en statut pending :**
- Bouton ✓ (CheckCircle) vert visible sans hover
- Au clic : `supabase.from("events").update({ status: "approved" }).eq("id", eventId)`
- Animation : la carte flash en vert (transition `bg-emerald-50` pendant 500ms) puis met à jour la liste
- Toast sonner : "Événement approuvé"

**Approbation en lot dans le calendrier :**
- Si des événements pending sont visibles, bannière sticky : `"X événements en attente — Tout approuver"`
- Au clic : boucle sur tous les pending visibles, même query d'update
- Toast : "X événements approuvés"

### 10.2 — Charte de couleurs des statuts (appliquer partout)

```
approved  → bg-emerald-500 (pastille) / border-emerald-500/30 (bordure carte) / text-emerald-700 (texte badge)
pending   → bg-amber-500 (pastille)   / border-amber-500/30 (bordure carte)   / text-amber-700 (texte badge)  / bg-amber-50 dark:bg-amber-950/20 (fond subtil)
rejected  → bg-red-500 (pastille)     / opacity-50 sur la carte entière        / text-red-700 (texte badge)
```

### 10.3 — Responsive

- **Calendrier desktop** : grid 7 colonnes (`grid-cols-7`)
- **Calendrier mobile** : scroll horizontal snap (`scroll-snap-type: x mandatory`), chaque jour = 1 "slide" pleine largeur
- **Formulaire desktop** : `<Sheet side="right">` largeur 500px
- **Formulaire mobile** : `<Sheet side="bottom">` plein écran (via `useIsMobile()` pour switcher)
- **Réglages mobile** : les TabsTrigger deviennent scrollables horizontalement

### 10.4 — Micro-interactions

- Toast de confirmation (sonner) après : sauvegarde, approbation, suppression, import, rejet
- Skeleton loaders (`<Skeleton>`) pendant le chargement initial des events et des stats
- Transition CSS `transition-all duration-200` sur les cartes événements pour hover/focus
- Loading spinner dans les boutons pendant les actions async (utiliser `useState` loading + icône `Loader2` de lucide)

### 10.5 — Feedbacks simplifiés

**Ne plus avoir de page feedback séparée.** Intégrer dans l'onglet "Système" des Réglages :
- Liste simple des feedbacks pending
- Chaque feedback : description + bouton "Marquer comme lu" (`status: "read"`)
- Compteur visible dans le KPI dashboard

---

## 11. Fichiers à supprimer

Après la refonte, supprimer ces fichiers devenus inutiles :

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
app/(admin)/admin/events/create/page.tsx        ← La création se fait dans le Sheet
app/(admin)/admin/components/events-management.tsx  ← Remplacé par events/
app/(admin)/admin/components/dashboard-stats.tsx     ← Remplacé par dashboard/
app/(admin)/admin/components/mobile-table-view.tsx   ← Plus nécessaire
app/(admin)/admin/components/share-network-content.tsx ← Déplacé dans réglages si besoin
```

---

## 12. Fichiers à NE PAS toucher

```
app/api/**                            ← Toutes les routes API restent identiques
app/(organizer)/**                    ← Interface organisateur séparée
app/(admin)/admin/layout.tsx          ← Auth wrapper, ne pas modifier
app/(admin)/admin/scraping/[id]/**    ← Page de config scraping spécifique
middleware.ts                         ← Auth middleware
lib/**                                ← Utilitaires, auth, Supabase clients
base_components/**                    ← Theme provider, auth dialog
components/ui/**                      ← Composants shadcn, ne pas modifier
hooks/**                              ← Garder tels quels et réutiliser
supabase/**                           ← Pas de migration
public/**                             ← Assets statiques
```

---

## 13. Ordre d'exécution

| Étape | Action | Dépend de |
|---|---|---|
| 1 | Créer `event-card.tsx` | Rien |
| 2 | Créer `event-filters-bar.tsx` | Rien |
| 3 | Créer `event-image-upload.tsx` | Rien |
| 4 | Créer `event-form-sheet.tsx` | 1, 3 |
| 5 | Créer `event-import-dialog.tsx` | Rien |
| 6 | Créer `events-calendar.tsx` | 1 |
| 7 | Créer `events-page.tsx` (orchestre 2+4+5+6) | 2, 4, 5, 6 |
| 8 | Mettre à jour `events/page.tsx` pour utiliser `events-page.tsx` | 7 |
| 9 | Créer les composants `settings/` (reprise des existants) | Rien |
| 10 | Créer `settings/page.tsx` | 9 |
| 11 | Créer les composants `dashboard/` | 1 |
| 12 | Refondre `dashboard/page.tsx` | 11 |
| 13 | Simplifier `admin-sidebar.tsx` à 3 items | Rien |
| 14 | Simplifier `mobile-bottom-nav.tsx` à 3 items | Rien |
| 15 | Supprimer les anciennes pages et composants | 8, 10, 12 |
| 16 | Tester navigation complète + responsive | 15 |

---

## 14. Checklist de validation finale

Après implémentation, vérifier :

- [ ] La sidebar n'a que 3 items (Dashboard, Événements, Réglages)
- [ ] La bottom nav mobile n'a que 3 items
- [ ] Le dashboard affiche 3 KPI + timeline 7 jours + demandes en attente
- [ ] Les événements s'affichent en vue calendrier (semaine par défaut)
- [ ] Cliquer sur un événement ouvre un Sheet latéral avec le formulaire
- [ ] Le formulaire a 7 champs principaux visibles + le reste en accordéon
- [ ] L'approbation rapide fonctionne (bouton ✓ sur les cartes pending)
- [ ] L'approbation en lot fonctionne (bouton "Tout approuver")
- [ ] L'import par URL fonctionne toujours
- [ ] Le crop d'image fonctionne toujours
- [ ] La page Réglages a 6 onglets fonctionnels
- [ ] Toutes les requêtes Supabase existantes sont conservées
- [ ] Le responsive mobile fonctionne (calendrier, formulaire, navigation)
- [ ] Les toasts de confirmation s'affichent après chaque action
- [ ] Aucune page supprimée n'est encore référencée (rechercher les imports/liens)
- [ ] L'auth admin fonctionne toujours (layout.tsx non modifié)

</details>
