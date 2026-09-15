# API Events OutLive — intégration React

Base prod : **`https://www.outlive.fr`** (l’apex `outlive.fr` redirige en 307 vers `www`).  
Swagger : [https://www.outlive.fr/swagger](https://www.outlive.fr/swagger)  
OpenAPI : [https://www.outlive.fr/api/v1/openapi.json](https://www.outlive.fr/api/v1/openapi.json)

Les GET publics autorisent CORS (`Access-Control-Allow-Origin: *`). Un projet React (Vite, CRA, Next côté client) peut les appeler **directement**, sans proxy.

Les POST (soumissions) **n’ont pas de CORS navigateur**. Pour écrire depuis une autre origine, passe par un proxy backend (voir plus bas).

## Radio Campus (embed ultra-rapide)

URL unique, sans query params, cache CDN ~60s, JSON minimal (pas de description, pas d’artistes). Fenêtre **90 jours**.

```ts
const OUTLIVE_RADIO_CAMPUS_URL =
  "https://www.outlive.fr/api/v1/radio-campus";

type RadioCampusEvent = {
  id: string;
  title: string;
  date: string;
  endDate: string | null;
  imageUrl: string | null;
  address: string | null;
  locationName: string | null;
  externalUrl: string | null;
  externalUrlLabel: string | null;
  url: string;
};

export async function loadRadioCampusEvents() {
  const response = await fetch(OUTLIVE_RADIO_CAMPUS_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Radio Campus feed ${response.status}`);
  }
  const payload = (await response.json()) as { data: RadioCampusEvent[] };
  return payload.data;
}
```

```tsx
import { useEffect, useState } from "react";

export function RadioCampusAgenda() {
  const [events, setEvents] = useState<RadioCampusEvent[]>([]);

  useEffect(() => {
    void loadRadioCampusEvents().then(setEvents);
  }, []);

  return (
    <ul>
      {events.map((event) => (
        <li key={event.id}>
          <a href={event.externalUrl || event.url}>
            <strong>{event.title}</strong>
            <time dateTime={event.date}>
              {new Date(event.date).toLocaleString("fr-FR")}
            </time>
            <span>{event.locationName}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
```

```bash
curl -sS 'https://www.outlive.fr/api/v1/radio-campus'
```

Le catalogue générique (`/api/v1/events`) reste disponible si tu as besoin de filtres, de pagination ou du détail complet.

## 1. Brancher le projet

### Vite / CRA

```bash
# .env
VITE_OUTLIVE_API_URL=https://www.outlive.fr
```

```ts
export const OUTLIVE_API_URL =
  import.meta.env.VITE_OUTLIVE_API_URL ?? "https://www.outlive.fr";
```

### Next.js (App Router)

```bash
# .env.local
NEXT_PUBLIC_OUTLIVE_API_URL=https://www.outlive.fr
```

```ts
export const OUTLIVE_API_URL =
  process.env.NEXT_PUBLIC_OUTLIVE_API_URL ?? "https://www.outlive.fr";
```

En Next, tu peux aussi fetcher **côté serveur** (Server Component, Route Handler) : pas de CORS, même URL.

En local contre `live-admin` : `http://localhost:3000`.

## 2. Client TypeScript (copier-coller)

`src/outlive/types.ts`

```ts
export type OutliveCity = {
  id: string | null;
  label: string | null;
};

export type OutliveLocation = {
  id: string | null;
  name: string | null;
  address: string | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  cityId: string | null;
  city: OutliveCity | null;
};

export type OutliveOrganizer = {
  id: string | null;
  name: string;
  kind: "organizer" | "location";
  iconUrl: string | null;
  logoUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
};

export type OutliveEvent = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  endDate: string | null;
  category: string | null;
  imageUrl: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  isPayWhatYouWant: boolean;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isFull: boolean;
  isFeatured: boolean;
  city: OutliveCity | null;
  locationId: string | null;
  location: OutliveLocation | null;
  organizers: OutliveOrganizer[];
  externalUrl: string | null;
  externalUrlLabel: string | null;
};

export type OutlivePagination = {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export type OutliveListResponse<T> = {
  data: T;
  pagination: OutlivePagination;
};

export type OutliveApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ListEventsParams = {
  cityId?: string;
  cityIds?: string[];
  locationId?: string;
  locationIds?: string[];
  organizerId?: string;
  organizerIds?: string[];
  startDate?: string;
  endDate?: string;
  includeOngoing?: boolean;
  category?: string;
  tagId?: string;
  search?: string;
  featured?: boolean;
  sort?: "date_asc" | "date_desc";
  limit?: number;
  cursor?: string;
  view?: "summary" | "full";
};
```

`src/outlive/client.ts`

```ts
import { OUTLIVE_API_URL } from "./config";
import type {
  ListEventsParams,
  OutliveApiError,
  OutliveEvent,
  OutliveListResponse,
} from "./types";

class OutliveError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: OutliveApiError | null,
  ) {
    super(message);
    this.name = "OutliveError";
  }
}

function appendList(search: URLSearchParams, key: string, values?: string[]) {
  if (!values?.length) return;
  search.set(key, values.join(","));
}

export function buildEventsSearchParams(params: ListEventsParams = {}) {
  const search = new URLSearchParams();

  if (params.cityId) search.set("cityId", params.cityId);
  if (params.locationId) search.set("locationId", params.locationId);
  if (params.organizerId) search.set("organizerId", params.organizerId);
  if (params.startDate) search.set("startDate", params.startDate);
  if (params.endDate) search.set("endDate", params.endDate);
  if (params.category) search.set("category", params.category);
  if (params.tagId) search.set("tagId", params.tagId);
  if (params.search) search.set("search", params.search);
  if (params.sort) search.set("sort", params.sort);
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.view) search.set("view", params.view);
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.includeOngoing != null) {
    search.set("includeOngoing", String(params.includeOngoing));
  }
  if (params.featured != null) search.set("featured", String(params.featured));

  appendList(search, "cityIds", params.cityIds);
  appendList(search, "locationIds", params.locationIds);
  appendList(search, "organizerIds", params.organizerIds);

  return search;
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${OUTLIVE_API_URL}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });

  const body = (await response.json().catch(() => null)) as T | OutliveApiError | null;

  if (!response.ok) {
    const errorBody = body && "error" in body ? body : null;
    throw new OutliveError(
      errorBody?.error.message ?? `HTTP ${response.status}`,
      response.status,
      errorBody,
    );
  }

  return body as T;
}

export function listEvents(params: ListEventsParams = {}) {
  const search = buildEventsSearchParams(params);
  const suffix = search.toString();
  return getJson<OutliveListResponse<OutliveEvent[]>>(
    `/api/v1/events${suffix ? `?${suffix}` : ""}`,
  );
}

export function listFeaturedEvents(
  params: Pick<
    ListEventsParams,
    | "cityId"
    | "cityIds"
    | "locationId"
    | "locationIds"
    | "organizerId"
    | "organizerIds"
    | "limit"
    | "view"
  > = {},
) {
  const search = buildEventsSearchParams(params);
  const suffix = search.toString();
  return getJson<OutliveListResponse<OutliveEvent[]>>(
    `/api/v1/events/featured${suffix ? `?${suffix}` : ""}`,
  );
}

export async function getEvent(id: string) {
  const payload = await getJson<{ data: OutliveEvent }>(`/api/v1/events/${id}`);
  return payload.data;
}
```

`src/outlive/config.ts` : exporte `OUTLIVE_API_URL` comme dans la section 1.

## 3. Hook React

`src/outlive/useEvents.ts`

```tsx
import { useCallback, useEffect, useState } from "react";

import { listEvents } from "./client";
import type { ListEventsParams, OutliveEvent } from "./types";

export function useEvents(params: ListEventsParams) {
  const [events, setEvents] = useState<OutliveEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = JSON.stringify({ ...params, cursor: undefined });

  const load = useCallback(
    async (cursor?: string) => {
      const query = JSON.parse(filters) as ListEventsParams;
      setLoading(true);
      setError(null);
      try {
        const page = await listEvents({
          ...query,
          cursor,
          limit: query.limit ?? 20,
        });
        setEvents((current) => (cursor ? [...current, ...page.data] : page.data));
        setNextCursor(page.pagination.nextCursor);
        setHasMore(page.pagination.hasMore);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Erreur réseau");
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return {
    events,
    loading,
    error,
    hasMore,
    loadMore: () => (nextCursor ? load(nextCursor) : undefined),
  };
}
```

Filtrer par lieu, organisateur, ou les deux :

```tsx
// Un lieu
useEvents({ locationId: LIEU_ID });

// Un organisateur (ou un lieu utilisé comme organisateur)
useEvents({ organizerId: ORGANISATEUR_ID });

// Plusieurs lieux (union)
useEvents({ locationIds: [LIEU_A, LIEU_B] });

// Lieu ET organisateur (intersection)
useEvents({ locationId: LIEU_ID, organizerId: ORGANISATEUR_ID });
```

Règle : plusieurs IDs du **même** type = union. `locationId` + `organizerId` = intersection.

## 4. Composant liste

```tsx
import { useEvents } from "./outlive/useEvents";

export function EventList({
  locationId,
  organizerId,
}: {
  locationId?: string;
  organizerId?: string;
}) {
  const { events, loading, error, hasMore, loadMore } = useEvents({
    locationId,
    organizerId,
    view: "summary",
    limit: 20,
  });

  if (loading && events.length === 0) return <p>Chargement…</p>;
  if (error) return <p>Impossible de charger les événements : {error}</p>;
  if (events.length === 0) return <p>Aucun événement.</p>;

  return (
    <div>
      <ul>
        {events.map((event) => (
          <li key={event.id}>
            <img src={event.imageUrl ?? undefined} alt="" width={120} />
            <h2>{event.title}</h2>
            <time dateTime={event.date}>
              {new Date(event.date).toLocaleString("fr-FR")}
            </time>
            <p>{event.location?.name}</p>
            <p>
              {event.organizers.map((organizer) => organizer.name).join(" · ")}
            </p>
            {event.externalUrl ? (
              <a href={event.externalUrl} target="_blank" rel="noreferrer">
                {event.externalUrlLabel ?? "Billetterie"}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      {hasMore ? (
        <button type="button" onClick={loadMore} disabled={loading}>
          {loading ? "Chargement…" : "Voir plus"}
        </button>
      ) : null}
    </div>
  );
}
```

Page détail :

```tsx
import { useEffect, useState } from "react";
import { getEvent } from "./outlive/client";
import type { OutliveEvent } from "./outlive/types";

export function EventPage({ id }: { id: string }) {
  const [event, setEvent] = useState<OutliveEvent | null>(null);

  useEffect(() => {
    void getEvent(id).then(setEvent);
  }, [id]);

  if (!event) return <p>Chargement…</p>;
  return <article>{event.title}</article>;
}
```

À la une :

```ts
await listFeaturedEvents({ locationId, organizerId, limit: 8 });
```

## 5. Pagination

La liste n’utilise **pas** d’offset. Tu envoies le `pagination.nextCursor` de la page précédente dans `cursor`.

Fenêtre de dates par défaut : **aujourd’hui → +13 jours**, événements en cours inclus (`includeOngoing=true`). Pour un agenda plus large :

```ts
listEvents({ startDate: "2026-09-01", endDate: "2026-12-31" });
```

Les dates sont en ISO (`YYYY-MM-DD` ou datetime). Les champs JSON sont en **camelCase**.

## 6. CORS, proxy, soumissions

| Usage | Depuis le navigateur React |
|---|---|
| `GET /api/v1/events` | OK, CORS `*` |
| `GET /api/v1/events/featured` | OK |
| `GET /api/v1/events/{id}` | OK |
| `POST` soumissions | Non : pas de CORS. Proxy obligatoire |

Exemple Next.js (`next.config.ts`) pour proxyfier toute l’API :

```ts
async rewrites() {
  return [
    {
      source: "/outlive-api/:path*",
      destination: "https://www.outlive.fr/api/:path*",
    },
  ];
}
```

Puis `OUTLIVE_API_URL = ""` et chemins `/outlive-api/v1/events` — utile surtout pour les POST authentifiés.

Les POST créent une demande `pending` (modération), **pas** un événement publié. Header : `Authorization: Bearer <access_token Supabase>`. Compte non anonyme, CGU UGC acceptées. Sans token → `401`. Anonyme / CGU manquantes → `403`.

## 7. Essayer dans Swagger

1. [https://www.outlive.fr/swagger](https://www.outlive.fr/swagger)
2. `GET /api/v1/events` → **Test Request**
3. Renseigne `locationId` et/ou `organizerId` (UUID)
4. Local : `http://localhost:3000/swagger`

```bash
curl 'https://www.outlive.fr/api/v1/events?limit=20'
curl 'https://www.outlive.fr/api/v1/events?locationId=<UUID_LIEU>'
curl 'https://www.outlive.fr/api/v1/events?organizerId=<UUID_ORGANISATEUR>'
curl 'https://www.outlive.fr/api/v1/events?locationId=<UUID_LIEU>&organizerId=<UUID_ORGANISATEUR>'
```

## 8. Référence

| Query | Rôle |
|---|---|
| `cityId` / `cityIds` | Ville |
| `locationId` / `locationIds` | Lieu (venue). Plusieurs IDs = union |
| `organizerId` / `organizerIds` | Organisateur, ou lieu-organisateur. Plusieurs IDs = union. Combiné avec un lieu = intersection |
| `startDate` / `endDate` | Fenêtre (défaut : aujourd’hui → +13 jours) |
| `includeOngoing` | Inclure les événements déjà commencés (défaut `true`) |
| `category` | Catégorie |
| `search` | Titre (`ilike`) |
| `featured` | À la une |
| `limit` | 1–100, défaut 50 |
| `cursor` | Page suivante |
| `view` | `summary` (défaut) ou `full` |

Réponse liste :

```json
{
  "data": [{ "id": "...", "title": "...", "date": "..." }],
  "pagination": { "limit": 20, "nextCursor": "...", "hasMore": true }
}
```

Erreur :

```json
{ "error": { "code": "not_found", "message": "Événement introuvable" } }
```

| Méthode | Chemin | Auth |
|---|---|---|
| GET | `/api/v1/events` | non |
| GET | `/api/v1/radio-campus` | non (cache CDN) |
| GET | `/api/v1/events/featured` | non |
| GET | `/api/v1/events/{id}` | non |
| GET | `/api/v1/events/submissions` | Bearer |
| POST | `/api/v1/events` | Bearer |
| POST | `/api/v1/events/from-url` | Bearer |
| POST | `/api/v1/events/extract-from-image` | Bearer (`multipart/form-data`) |

Champs jamais exposés en public : `scraping_url`, `created_by`, `is_safety_hidden`.
