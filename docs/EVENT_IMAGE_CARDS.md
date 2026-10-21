# Vignettes des affiches

Étape C7a de `../live/docs/PLAN_REFONTE.md` (décision 1 : vignettes générées par live-admin).
Les listes de l'app chargent les affiches à leur taille d'origine (9,8 Mo pour les 40 premières de
l'accueil le 2026-10-19, cible < 2,5 Mo) et la transformation d'images de Supabase n'est pas activée
(offre payante). live-admin fabrique donc une vignette par affiche, une fois pour toutes.

Largeur (C7b, 2026-10-21) : 1 200 px. Une carte pleine largeur de l'app fait 362 à 400 pt sur un
iPhone à ×3, soit 1 086 à 1 200 px ; les vignettes de 800 px de C7a y étaient agrandies de 1,36 à
1,65 fois (les bannières en paysage, dont le cadre de 200 pt impose la hauteur), ce qui se voyait
à côté de l'original. Mesuré sur les 40 premières cartes de l'accueil du 2026-10-21 (35 affiches) :
8,2 Mo d'originaux, 1,4 Mo de vignettes de 800 px, 2,3 Mo de vignettes de 1 200 px.

## Ce que lit l'app

Colonnes de `events` (migration `20261019190000_add_event_image_cards.sql`), toutes à `null` tant
que la vignette n'est pas faite :

| Colonne | Contenu |
| --- | --- |
| `image_card_url` | vignette WebP de `image_url`, 1 200 px de large au plus (2 400 px de haut au plus), 140 Ko au plus |
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
   `sharp` (qualité WebP 80, puis 70… 40 jusqu'à tenir sous 140 Ko ; si la qualité 40 dépasse encore,
   affiche très chargée, les dimensions baissent, ratio gardé), la dépose dans
   `event-images/cards/v<version>/<empreinte de l'adresse>.webp` et remplit les colonnes, seulement si
   `image_url` n'a pas changé entre-temps. Une affiche déjà traitée par le rendu actuel (séances,
   doublon) est reprise sans téléchargement : un fichier par affiche.
3. **Échecs.** Définitif (HTTP 4xx, fichier illisible, SVG, adresse refusée) : noté dans
   `image_card_error`, plus retenté tant que l'affiche ne change pas. Passager (réseau, HTTP 5xx,
   408 ou 429, Storage) : rien de noté, la route répond 503 et le cron reprend.
4. **Cron quotidien** `GET /api/cron/image-cards` (4 h UTC, `vercel.json`) : le filet des envois
   ratés et des échecs passagers, 200 événements et 35 s au plus par passage, puis la copie des
   affiches restées hors de Storage (plus bas). Déclenchable à la main depuis l'admin (page des
   crons). Il ne refait pas les vignettes d'un ancien rendu (plus bas).
5. **Rattrapage** des affiches existantes (sans vignette, ou d'un ancien rendu) :
   `scripts/backfill-image-cards.mjs`, même traitement, sur la machine locale.

Le code : `lib/image-cards/render.ts` (rendu) et `lib/image-cards/service.ts` (téléchargement,
Storage, écriture, lots). Tests : `lib/image-cards/*.test.mjs`.

## Affiches hors de Storage

Une affiche laissée sur le site d'origine finit par casser (11 liens billetweb.fr en 404 le
2026-10-20) et le web de l'app ne la charge pas si l'hébergeur refuse le CORS (lastrolabe.org).
Toutes les affiches vont donc dans le bucket `event-images`, à sa racine (`<horodatage>-<aléa>.<ext>`),
comme celles de l'admin :

- **à l'import** : la collecte (`copyImageToStorage`, `lib/agent/images.ts`) copie l'affiche avant de
  créer l'événement. Même téléchargement que les vignettes (15 Mo, ni hôte local ni adresse IP) ; le
  format est lu dans le fichier, pas dans l'en-tête HTTP (Weezevent envoie ses affiches en
  `application/octet-stream`) ; JPEG pour les formats que l'app n'affiche pas (AVIF, HEIF, TIFF…) et
  au-delà de 2 Mo (1 600 px de côté au plus) ; SVG refusé. Si la copie échoue, le lien d'origine est
  gardé (sauf Instagram et Facebook, dont les liens expirent) ;
- **chaque nuit** : le cron des vignettes recopie ensuite jusqu'à 20 affiches restées ailleurs
  (`lib/image-cards/external-posters.ts`, événements non archivés, sauf échec de vignette noté) et
  remplace `image_url` sur toutes les lignes qui la portent ; la base remet leur vignette à zéro et
  le webhook la refait d'après la copie ;
- **à la main**, pour tout reprendre, avec aussi les photos des lieux, les logos des organisateurs et
  les photos des artistes :
  ```bash
  node --env-file=.env.local scripts/copy-external-images.mjs
  node --env-file=.env.local scripts/copy-external-images.mjs --write --confirm=<ref du projet>
  ```
  La première commande ne fait que lister ; `--only=events,locations,organizers,artists` restreint.

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

-- Affiches hors de Storage (le cron les recopie)
select id, title, image_url from public.events
where image_url <> '' and image_url not like '%/storage/v1/object/public/%' and not archived;

-- Derniers appels du webhook (pg_net les garde 6 h) : 200, 503 (repris par le cron)…
select created, status_code, left(content, 200) from net._http_response order by created desc limit 20;
```

Le secret ne figure pas dans `net._http_response` ; il reste dans `net.http_request_queue` le temps
de l'envoi.

## Coûts (offres gratuites)

- Storage : environ 20 à 140 Ko par affiche distincte (66 Ko en moyenne sur l'accueil du 2026-10-21,
  50 Ko sur les 286 vignettes v2 publiques le même jour).
  Une vignette remplacée devient orpheline : `scripts/audit-storage.mjs` compte `image_card_url` parmi
  les références et retire les orphelins (après 30 jours par défaut).
- Vercel : un appel de fonction par nouvelle affiche, ~0,1 à 0,7 s de CPU chacun ; un cron par jour.
- Egress Supabase : chaque affiche est téléchargée une fois ; l'app charge ensuite des vignettes.

## Changer le rendu

Changer `CARD_VERSION` (`lib/image-cards/service.ts`) : les vignettes vont dans un nouveau dossier
(`cards/v<version>/`), donc de nouvelles adresses, sans cache périmé. Celles d'avant restent
affichées jusqu'à être remplacées, sans passer par `null` : une vignette est « d'un ancien rendu »
quand son adresse n'est pas dans le dossier de la version courante. Seul le rattrapage les refait,
après les manquantes (simulation, puis `--write --confirm=<ref du projet>`, voir plus haut) : une
écriture sur tous les événements à affiche, lancée à la main avec l'accord de l'utilisateur, après
le déploiement (sinon l'ancien webhook refait des vignettes de l'ancien rendu entre-temps). Une
affiche qui ne se télécharge plus garde son ancienne vignette, l'échec noté. Après un échec passager
(HTTP 429 de Storage, trop de connexions…), rien n'est noté et l'ancienne vignette reste aussi : le cron
ne la reprend pas, relancer le rattrapage (il ne refait que ce qui reste).

Chaque vignette posée réécrit sa ligne de `events`, donc son `updated_at` (trigger
`update_events_updated_at`), comme au premier rattrapage.

Versions : 1 (C7a, 2026-10-19) 800 px et 70 Ko, fichiers à la racine de `cards/` ; 2 (C7b,
2026-10-21) 1 200 px et 140 Ko, dans `cards/v2/`.

Retouche sans changer de version (2026-10-21) : les 140 Ko n'étaient qu'un objectif, la qualité
s'arrêtant à 40 ; 3 des 286 vignettes v2 lisibles sans compte le dépassaient (212 à 250 Ko,
affiches très chargées, pas très hautes). Les dimensions baissent désormais jusqu'à tenir la borne.
Le rendu des autres affiches ne change pas, d'où la même version ; les vignettes déjà faites restent
telles quelles (même adresse, cache d'un an : les refaire au même endroit n'atteindrait pas les
caches, et elles seraient moins nettes, ~820 à 900 px).
