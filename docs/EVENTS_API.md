# API Events OutLive — Swagger

Interface interactive : **[/swagger](/swagger)** (alias : [/docs/api](/docs/api))  
Spec OpenAPI 3.1 : **[/api/v1/openapi.json](/api/v1/openapi.json)**  
Index JSON : **[/api/v1](/api/v1)**

## 1. Ouvrir Swagger

1. Lance `live-admin` (`npm run dev`).
2. Ouvre [http://localhost:3000/swagger](http://localhost:3000/swagger).
3. Les endpoints `Events` sont listés à gauche.
4. Clique un endpoint → **Test Request** / Try it out → envoie la requête.

En production, remplace l’origine par l’URL du site admin (ex. `https://outlive.fr/swagger` si le reverse-proxy pointe vers live-admin).

## 2. Lecture publique (sans token)

Les GET ne demandent **pas** d’auth. Ils ne renvoient que les événements `approved`, non archivés.

```bash
curl 'http://localhost:3000/api/v1/events?limit=20'
curl 'http://localhost:3000/api/v1/events/featured?limit=8'
curl 'http://localhost:3000/api/v1/events/<UUID>'
curl 'http://localhost:3000/api/v1/events?locationId=<UUID_LIEU>'
curl 'http://localhost:3000/api/v1/events?organizerId=<UUID_ORGANISATEUR>'
curl 'http://localhost:3000/api/v1/events?locationId=<UUID_LIEU>&organizerId=<UUID_ORGANISATEUR>'
```

Filtres utiles sur `GET /api/v1/events` :

| Query | Exemple | Rôle |
|---|---|---|
| `cityId` / `cityIds` | UUID | Ville |
| `locationId` / `locationIds` | UUID | Lieu (venue de l’événement) |
| `organizerId` / `organizerIds` | UUID | Organisateur (ou lieu utilisé comme organisateur) |
| `startDate` / `endDate` | `2026-09-14` | Fenêtre (défaut : aujourd’hui → +13 jours) |
| `includeOngoing` | `true` | Inclure les événements déjà commencés |
| `category` | `concert` | Catégorie |
| `search` | `mona` | Titre (ilike) |
| `featured` | `true` | À la une |
| `limit` | `1`–`100` | Taille de page (défaut 50) |
| `cursor` | valeur `nextCursor` | Page suivante |
| `view` | `summary` ou `full` | Niveau de relations |

Réponse liste :

```json
{
  "data": [{ "id": "...", "title": "...", "date": "..." }],
  "pagination": { "limit": 20, "nextCursor": "...", "hasMore": true }
}
```

Erreurs :

```json
{ "error": { "code": "not_found", "message": "Événement introuvable" } }
```

## 3. Auth Bearer (soumissions)

Pour `POST` et `GET /api/v1/events/submissions` :

1. Connecte-toi via Supabase Auth (compte **non anonyme**, CGU UGC acceptées).
2. Récupère `session.access_token`.
3. Dans Swagger : **Authentication** → **BearerAuth** → colle le JWT.
4. Ou en curl :

```bash
TOKEN='<access_token>'

curl -X POST 'http://localhost:3000/api/v1/events' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Concert test",
    "date": "2026-10-01T20:00:00.000Z",
    "category": "concert",
    "locationName": "Astrolabe"
  }'
```

Le POST **ne publie pas** l’événement : il crée une demande `user_requests` en `pending`.

Sans token → `401 unauthorized`. Compte anonyme / CGU manquantes → `403 forbidden`.

## 4. Endpoints

| Méthode | Chemin | Auth |
|---|---|---|
| GET | `/api/v1/events` | non |
| GET | `/api/v1/events/featured` | non |
| GET | `/api/v1/events/{id}` | non |
| GET | `/api/v1/events/submissions` | Bearer |
| POST | `/api/v1/events` | Bearer |
| POST | `/api/v1/events/from-url` | Bearer |
| POST | `/api/v1/events/extract-from-image` | Bearer (`multipart/form-data`) |

Champs jamais exposés en public : `scraping_url`, `created_by`, `is_safety_hidden`.
