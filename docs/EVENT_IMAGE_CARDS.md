# Vignettes des affiches

Étape C7a de `../live/docs/PLAN_REFONTE.md` (décision 1 : vignettes générées par live-admin).
Les listes de l'app chargent les affiches à leur taille d'origine (9,8 Mo pour les 40 premières de
l'accueil le 2026-10-19, cible < 2,5 Mo) et la transformation d'images de Supabase n'est pas activée
(offre payante). live-admin fabrique donc une vignette par affiche, une fois pour toutes.

## Ce que lit l'app

Colonnes de `events` (migration `20261019190000_add_event_image_cards.sql`), toutes à `null` tant
que la vignette n'est pas faite :

| Colonne | Contenu |
| --- | --- |
| `image_card_url` | vignette WebP de `image_url`, ~800 px de large (1600 px de haut au plus), 70 Ko au plus visés |
| `image_width`, `image_height` | dimensions de l'original en pixels, orientation EXIF appliquée |
| `image_color` | couleur dominante, `#rrggbb` |
| `image_card_error` | dernier échec définitif (image introuvable, illisible…), pour l'admin |

Garanties (contraintes et triggers de la migration) :

- une vignette remplie correspond toujours à l'`image_url` de sa ligne : ces colonnes repartent à
  `null` à l'insertion et quand `image_url` change ;
- `image_card_url` remplie ⇒ `image_width`, `image_height` (> 0) et `image_color` remplies ;
- la vignette a le ratio de l'original : `image_width / image_height` sert pour les deux.

Côté app (C7b) : la vignette en liste, à défaut `image_url` ; l'original en fiche ; la place réservée
avec le ratio et la couleur. `app_events()` rend `setof events` : les colonnes s'ajoutent au `select`
(`_eventColumns`) sans toucher la fonction.

## Comment elles sont faites

1. **Webhook de la base.** Le trigger `events_request_image_card` (après insertion, ou changement de
   `image_url`) met en file un `POST /api/events/<id>/image-card` (pg_net, envoyé après le commit,
   délai 30 s) avec `Authorization: Bearer <secret>`. Le secret est lu dans Vault
   (`image_card_webhook_secret`) ; sans lui, rien n'est envoyé. Les cinq chemins d'entrée des
   affiches (formulaire de l'admin, espace organisateur, import par lot, collecte, assistant de
   l'app) passent tous par là, sans changement de leur code.
2. **La route** (`app/api/events/[id]/image-card/route.ts`) relit l'événement, télécharge l'affiche
   (15 Mo au plus, ni hôte local ni adresse IP, redirections vérifiées), fabrique la vignette avec
   `sharp` (qualité WebP 80, puis 70… 40 jusqu'à tenir sous 70 Ko), la dépose dans
   `event-images/cards/<empreinte de l'adresse>.webp` et remplit les colonnes, seulement si
   `image_url` n'a pas changé entre-temps. Une affiche déjà traitée (séances, doublon) est reprise
   sans téléchargement : un fichier par affiche.
3. **Échecs.** Définitif (HTTP 4xx, fichier illisible, SVG, adresse refusée) : noté dans
   `image_card_error`, plus retenté tant que l'affiche ne change pas. Passager (réseau, HTTP 5xx,
   408 ou 429, Storage) : rien de noté, la route répond 503 et le cron reprend.
4. **Cron quotidien** `GET /api/cron/image-cards` (4 h UTC, `vercel.json`) : le filet des envois
   ratés et des échecs passagers, 200 événements et 35 s au plus par passage. Déclenchable à la
   main depuis l'admin (page des crons).
5. **Rattrapage** des affiches existantes : `scripts/backfill-image-cards.mjs`, même traitement, sur
   la machine locale.

Le code : `lib/image-cards/render.ts` (rendu) et `lib/image-cards/service.ts` (téléchargement,
Storage, écriture, lots). Tests : `lib/image-cards/*.test.mjs`.

## Mise en route en production

Dans cet ordre (rien n'est fait automatiquement) :

1. Appliquer la migration (SQL Editor ou psql, une transaction). Elle crée `pg_net` s'il manque et
   remplace `queue_event_sync_job()` (même définition, plus le premier `IF`) : comparer d'abord
   avec la prod, `select pg_get_functiondef('public.queue_event_sync_job()'::regprocedure);`.
2. Merger la PR (déploie les deux routes et le cron).
3. Choisir un secret (`openssl rand -hex 32`) et le mettre :
   - sur Vercel, projet de l'admin, Production : `IMAGE_CARD_WEBHOOK_SECRET`, puis redéployer ;
   - dans Vault (SQL Editor) :
     ```sql
     select vault.create_secret('<secret>', 'image_card_webhook_secret',
       'Webhook des vignettes (live-admin : IMAGE_CARD_WEBHOOK_SECRET)');
     ```
   Le webhook est actif dès que le secret est dans Vault.
4. Rattraper les affiches existantes, depuis le checkout principal (avec `.env.local`) :
   ```bash
   node --env-file=.env.local scripts/backfill-image-cards.mjs
   node --env-file=.env.local scripts/backfill-image-cards.mjs --write --confirm=<ref du projet>
   ```
   La première commande ne fait que compter. `--retry-errors` reprend aussi les échecs notés.

## Vérifier

```sql
-- Couverture
select count(*) filter (where image_url is not null) as avec_affiche,
       count(*) filter (where image_card_url is not null) as avec_vignette,
       count(*) filter (where image_card_error is not null) as en_echec
from public.events;

-- Échecs notés
select id, title, image_url, image_card_error from public.events
where image_card_error is not null order by date desc;

-- Derniers appels du webhook (pg_net les garde 6 h) : 200, 503 (repris par le cron)…
select created, status_code, left(content, 200) from net._http_response order by created desc limit 20;
```

Le secret ne figure pas dans `net._http_response` ; il reste dans `net.http_request_queue` le temps
de l'envoi.

## Coûts (offres gratuites)

- Storage : environ 20 à 70 Ko par affiche distincte. Une vignette remplacée devient orpheline :
  `scripts/audit-storage.mjs` compte `image_card_url` parmi les références et retire les orphelins.
- Vercel : un appel de fonction par nouvelle affiche, ~0,1 à 0,7 s de CPU chacun ; un cron par jour.
- Egress Supabase : chaque affiche est téléchargée une fois ; l'app charge ensuite des vignettes.

## Changer le rendu

Changer `CARD_VERSION` (`lib/image-cards/service.ts`) donne de nouvelles adresses (pas de cache
périmé), puis remettre les colonnes à `null` (`update events set image_card_url = null,
image_width = null, image_height = null, image_color = null where image_card_url is not null;`) et
relancer le rattrapage.
