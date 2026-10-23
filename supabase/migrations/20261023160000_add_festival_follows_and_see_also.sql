-- Festivals, étape 4 : le programme qui s'étoffe dans le message des suivis, « À voir aussi » sans le même
-- festival.
--
-- ../live/docs/FESTIVALS.md (§ 3, « Favoris et notifications », et § 5), décision du 2026-10-23 : un cœur sur un
-- festival vaut suivi de son programme ; le message des suivis (U8) dit « Fulgurances Électroniques #2 : 2
-- événements ajoutés au programme ». La fiche d'un événement du festival montre « Au même festival » : « À voir
-- aussi » ne les répète pas. Contrat pour l'app : docs/API_APP.md (« Festivals » et « Suivis »). Prérequis :
-- 20261023120000_create_festivals.sql (events.festival_id), 20261021142000_create_follows_digest.sql et
-- 20261021220000_create_app_zone.sql (dernières définitions de follows_digest et d'app_see_also).
--
-- - events.festival_added_at : l'instant où l'événement est entré dans le programme de son festival (rattaché,
--   ou passé à un autre festival) ; null hors festival. Tenue par la base seule (trg_events_set_festival_added_at),
--   comme published_at : une valeur envoyée est ignorée. Les événements déjà rattachés (Micro et Infra, le
--   2026-10-23) la gardent nulle : leur entrée compte à leur publication, et aucun message ne les annonce après
--   coup.
-- - follows_digest(at_time) : en plus des lieux, organisateurs et artistes suivis, les festivals en favori
--   (event_likes sur la fiche d'un festival visible). Leurs lignes : target_type 'festival', target_id le
--   festival, target_name son titre ; un événement y entre quand il est à la fois rattaché et publié
--   (greatest(festival_added_at, published_at)), dans la même fenêtre que les autres (depuis le cœur, le dernier
--   message et au plus 7 jours), avec les mêmes règles (visible, pas complet, pas terminé, ni masqué ni d'un
--   auteur bloqué).
-- - app_see_also(…) : ni les événements du festival de la fiche, ni le festival lui-même, ni, sur la fiche d'un
--   festival, ses propres événements. Deux événements sont du même festival quand leur festival, à défaut
--   eux-mêmes (coalesce(festival_id, id)), est le même. Le compte de la source (source_events_count) reste
--   celui de sa page. Rien ne change pour un événement hors festival.
--
-- `language sql`, `stable`, `security invoker` pour les fonctions (follows_digest reste réservée au service
-- role) ; tous les objets sont qualifiés. Mêmes signatures : rien ne change pour les appelants. À appliquer d'un
-- bloc (`psql --single-transaction`) ; pas de BEGIN ni de COMMIT ici.

-- events.festival_added_at ----------------------------------------------------------------------------------

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS festival_added_at timestamptz;

COMMENT ON COLUMN public.events.festival_added_at IS
  'Instant où l''événement est entré dans le programme de son festival (festival_id posé ou changé), tenu par le trigger trg_events_set_festival_added_at ; null hors festival. Sert au message des suivis (festivals en favori). Migration 20261023160000.';

CREATE OR REPLACE FUNCTION public.set_event_festival_added_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Rattaché, ou passé à un autre festival : maintenant ; détaché : null ; sinon la date déjà posée. Toute
  -- valeur envoyée est ignorée.
  IF TG_OP = 'INSERT' OR NEW.festival_id IS DISTINCT FROM OLD.festival_id THEN
    NEW.festival_added_at := CASE WHEN NEW.festival_id IS NOT NULL THEN now() END;
  ELSE
    NEW.festival_added_at := OLD.festival_added_at;
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.set_event_festival_added_at() IS
  'Trigger de events : pose festival_added_at quand l''événement entre dans le programme d''un festival (festival_id posé ou changé), l''efface quand il en sort, ignore toute valeur envoyée. Migration 20261023160000.';

DROP TRIGGER IF EXISTS trg_events_set_festival_added_at ON public.events;
CREATE TRIGGER trg_events_set_festival_added_at
  BEFORE INSERT OR UPDATE OF festival_id, festival_added_at
  ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_event_festival_added_at();

-- follows_digest ----------------------------------------------------------------------------------------------
--
-- La définition de 20261021142000, et les festivals en favori. Les règles des lieux, organisateurs et artistes
-- suivis ne changent pas.
CREATE OR REPLACE FUNCTION public.follows_digest(at_time timestamptz DEFAULT NULL)
RETURNS TABLE (
  user_id uuid,
  event_id uuid,
  event_title text,
  event_date timestamptz,
  target_type text,
  target_id uuid,
  target_name text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH r AS (
    SELECT
      coalesce(follows_digest.at_time, now()) AS fin,
      -- Les dates des événements sont l'heure de Paris étiquetée UTC (docs/API_APP.md).
      (coalesce(follows_digest.at_time, now()) AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'UTC'
        AS maintenant
  ),
  -- Fin du dernier message des suivis envoyé, par utilisateur (un log libéré n'est plus là).
  derniers AS (
    SELECT nl.user_id, max(nl.covered_until) AS couvert
    FROM public.notification_logs AS nl
    WHERE nl.flow_type = 'follows_digest'
      AND nl.sent_at IS NOT NULL
    GROUP BY nl.user_id
  ),
  suivis AS (
    SELECT
      f.user_id,
      f.target_type,
      f.target_id,
      -- greatest ignore les nulls : sans message envoyé, le début du suivi ou 7 jours.
      greatest(f.created_at, d.couvert, r.fin - interval '7 days') AS depuis
    FROM public.user_follows AS f
    CROSS JOIN r
    LEFT JOIN derniers AS d ON d.user_id = f.user_id
  ),
  nouveaux AS (
    SELECT e.id, e.title, e.date, e.location_id, e.created_by, e.published_at
    FROM public.app_events() AS e
    CROSS JOIN r
    WHERE e.published_at > r.fin - interval '7 days'
      AND e.published_at <= r.fin
      AND e.is_full IS NOT TRUE
      -- Pas terminé : sans fin, à minuit le soir de son début (app_events_in_range, règle 3).
      AND coalesce(e.end_date, date_trunc('day', e.date, 'UTC') + interval '24 hours') > r.maintenant
  ),
  -- (événement, cible qui le publie), sans doublon : UNION.
  liens AS (
    SELECT n.id AS event_id, 'location'::text AS target_type, n.location_id AS target_id
    FROM nouveaux AS n
    WHERE n.location_id IS NOT NULL
    UNION
    SELECT eo.event_id, 'location'::text, eo.location_id
    FROM public.event_organizers AS eo
    JOIN nouveaux AS n ON n.id = eo.event_id
    WHERE eo.location_id IS NOT NULL
    UNION
    SELECT eo.event_id, 'organizer'::text, eo.organizer_id
    FROM public.event_organizers AS eo
    JOIN nouveaux AS n ON n.id = eo.event_id
    WHERE eo.organizer_id IS NOT NULL
    UNION
    SELECT ea.event_id, 'artist'::text, ea.artist_id
    FROM public.event_artists AS ea
    JOIN nouveaux AS n ON n.id = ea.event_id
  ),
  -- Les festivals en favori : un cœur sur la fiche d'un festival visible vaut suivi de son programme.
  festivals_aimes AS (
    SELECT
      el.user_id,
      el.event_id AS festival_id,
      f.title AS festival_title,
      greatest(el.created_at, d.couvert, r.fin - interval '7 days') AS depuis
    FROM public.event_likes AS el
    JOIN public.app_events() AS f ON f.id = el.event_id
    CROSS JOIN r
    LEFT JOIN derniers AS d ON d.user_id = el.user_id
  ),
  -- Les événements entrés dans un programme : rattachés et publiés, le dernier des deux dans la fenêtre.
  ajouts AS (
    SELECT e.id, e.title, e.date, e.festival_id, e.created_by, x.entree
    FROM public.app_events() AS e
    CROSS JOIN r
    CROSS JOIN LATERAL (SELECT greatest(e.festival_added_at, e.published_at) AS entree) AS x
    WHERE e.festival_id IS NOT NULL
      AND x.entree > r.fin - interval '7 days'
      AND x.entree <= r.fin
      AND e.is_full IS NOT TRUE
      AND coalesce(e.end_date, date_trunc('day', e.date, 'UTC') + interval '24 hours') > r.maintenant
  ),
  lignes AS (
    SELECT
      s.user_id,
      n.id AS event_id,
      n.title AS event_title,
      n.date AS event_date,
      s.target_type,
      s.target_id,
      coalesce(l.name, o.name, a.name) AS target_name,
      n.created_by
    FROM suivis AS s
    JOIN liens AS li ON li.target_type = s.target_type AND li.target_id = s.target_id
    JOIN nouveaux AS n ON n.id = li.event_id AND n.published_at > s.depuis
    LEFT JOIN public.locations AS l ON s.target_type = 'location' AND l.id = s.target_id
    LEFT JOIN public.organizers AS o ON s.target_type = 'organizer' AND o.id = s.target_id
    LEFT JOIN public.artists AS a ON s.target_type = 'artist' AND a.id = s.target_id
    UNION ALL
    SELECT fa.user_id, aj.id, aj.title, aj.date, 'festival'::text, fa.festival_id, fa.festival_title, aj.created_by
    FROM festivals_aimes AS fa
    JOIN ajouts AS aj ON aj.festival_id = fa.festival_id AND aj.entree > fa.depuis
  )
  SELECT li.user_id, li.event_id, li.event_title, li.event_date, li.target_type, li.target_id, li.target_name
  FROM lignes AS li
  WHERE NOT EXISTS (
      SELECT 1
      FROM public.user_hidden_events AS h
      WHERE h.user_id = li.user_id
        AND h.event_id = li.event_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.blocked_users AS b
      WHERE b.blocker_user_id = li.user_id
        AND b.blocked_user_id = li.created_by
    )
  ORDER BY li.user_id, li.event_date, li.event_id, li.target_type, li.target_id
$$;

COMMENT ON FUNCTION public.follows_digest(timestamptz) IS
  'Notification des suivis (U8) : par utilisateur, les événements visibles et à venir que ses cibles suivies ont publiés, et ceux entrés dans le programme des festivals qu''il a en favori (target_type festival), depuis le début du suivi ou du cœur, son dernier message (covered_until) et au plus 7 jours, sans ses masqués ni ses auteurs bloqués. Pour le cron (service role). Règle complète : migrations 20261021142000 et 20261023160000.';

REVOKE ALL ON FUNCTION public.follows_digest(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.follows_digest(timestamptz) TO service_role;

-- app_see_also ------------------------------------------------------------------------------------------------
--
-- La définition de 20261021220000 (même signature), sans les événements du même festival : la colonne
-- festival (coalesce(festival_id, id)) dans courant, a_venir et autour, et trois conditions (source,
-- rangee_lieu, genre).
CREATE OR REPLACE FUNCTION public.app_see_also(
  event_id uuid,
  city_ids uuid[] DEFAULT NULL,
  at_time timestamp DEFAULT NULL,
  max_results integer DEFAULT 3,
  zone_city text DEFAULT NULL,
  zone_km numeric DEFAULT NULL
)
RETURNS SETOF public.app_see_also_results
LANGUAGE sql
STABLE
SECURITY INVOKER
ROWS 6
AS $$
  WITH courant AS MATERIALIZED (
    -- L'événement de la fiche, tel que l'appelant le voit.
    SELECT
      e.id,
      e.date,
      e.location_id,
      -- Son festival, à défaut lui-même : deux événements du même festival (ou un festival et l'un des
      -- siens) ont le même.
      coalesce(e.festival_id, e.id) AS festival,
      nullif(btrim(e.category), '') AS categorie,
      coalesce(e.tag_ids, '{}'::uuid[]) AS tags
    FROM public.events AS e
    WHERE e.id = app_see_also.event_id
  ),
  bornes AS MATERIALIZED (
    SELECT
      m.aujourdhui,
      greatest(1, least(coalesce(app_see_also.max_results, 3), 20)) AS nombre,
      -- Le moment de l'événement, pour la proximité : son début, ou maintenant s'il a commencé avant.
      greatest(c.date, m.maintenant AT TIME ZONE 'UTC') AS ancre,
      -- Son jour, pour la plage de « Dans le même genre ».
      greatest(date_trunc('day', c.date AT TIME ZONE 'UTC'), m.aujourdhui) AS jour
    FROM courant AS c
    CROSS JOIN (
      SELECT
        coalesce(app_see_also.at_time, now() AT TIME ZONE 'Europe/Paris') AS maintenant,
        date_trunc('day', coalesce(app_see_also.at_time, now() AT TIME ZONE 'Europe/Paris')) AS aujourdhui
    ) AS m
  ),
  -- Les événements à venir, toutes villes : ceux des pages de lieu et d'organisateur.
  a_venir AS MATERIALIZED (
    SELECT e.id, e.date, e.location_id, e.title, coalesce(e.festival_id, e.id) AS festival
    FROM bornes AS b
    CROSS JOIN LATERAL public.app_events_in_range(b.aujourdhui, NULL, NULL, NULL, app_see_also.at_time) AS e
  ),
  -- Leurs séries (app_event_series_of, la règle d'app_event_series), sur ce qui est déjà lu.
  series AS MATERIALIZED (
    SELECT s.event_id, s.series_id
    FROM (
      SELECT array_agg(a.id) AS ids, array_agg(a.date) AS dates, array_agg(a.location_id) AS lieux,
        array_agg(a.title) AS titres
      FROM a_venir AS a
    ) AS t
    CROSS JOIN LATERAL public.app_event_series_of(t.ids, t.dates, t.lieux, t.titres) AS s
  ),
  -- La série de la fiche, ou l'événement lui-même s'il n'en a pas (seul, ou passé).
  serie_courante AS MATERIALIZED (
    SELECT coalesce(
      (SELECT s.series_id FROM series AS s JOIN courant AS c ON c.id = s.event_id),
      (SELECT c.id FROM courant AS c)
    ) AS serie
  ),
  -- Les sources possibles de « Aussi à » : le lieu de l'événement, puis ses organisateurs (un lieu qui
  -- organise, autre que le lieu de l'événement, compte comme un lieu).
  candidates AS (
    SELECT 'location'::text AS sorte, c.location_id AS id, 0 AS priorite
    FROM courant AS c
    WHERE c.location_id IS NOT NULL
    UNION
    SELECT
      CASE WHEN eo.organizer_id IS NOT NULL THEN 'organizer' ELSE 'location' END,
      coalesce(eo.organizer_id, eo.location_id),
      1
    FROM courant AS c
    JOIN public.event_organizers AS eo ON eo.event_id = c.id
    WHERE coalesce(eo.organizer_id, eo.location_id) IS DISTINCT FROM c.location_id
  ),
  -- (source, événement à venir), chacun une fois : un organisateur, ceux qu'il organise ; un lieu, ceux
  -- qu'il organise et ceux qui s'y tiennent (app_organizer_counts).
  liens AS (
    SELECT s.id AS source, eo.event_id
    FROM candidates AS s
    JOIN public.event_organizers AS eo ON eo.organizer_id = s.id
    WHERE s.sorte = 'organizer'
    UNION
    SELECT s.id, eo.event_id
    FROM candidates AS s
    JOIN public.event_organizers AS eo ON eo.location_id = s.id
    WHERE s.sorte = 'location'
    UNION
    SELECT s.id, a.id
    FROM candidates AS s
    JOIN a_venir AS a ON a.location_id = s.id
    WHERE s.sorte = 'location'
  ),
  -- Leurs événements à venir, avec leur série.
  evenements_sources AS MATERIALIZED (
    SELECT li.source, a.id, a.date, coalesce(se.series_id, a.id) AS serie, a.festival
    FROM liens AS li
    JOIN a_venir AS a ON a.id = li.event_id
    LEFT JOIN series AS se ON se.event_id = a.id
  ),
  -- La source retenue : la première qui a une autre série que celle de la fiche, hors de son festival.
  source AS MATERIALIZED (
    SELECT s.sorte, s.id, coalesce(l.name, o.name) AS nom, k.total
    FROM candidates AS s
    CROSS JOIN serie_courante AS sc
    CROSS JOIN courant AS c
    CROSS JOIN LATERAL (
      SELECT
        count(*) AS total,
        count(DISTINCT x.serie) FILTER (WHERE x.serie <> sc.serie AND x.festival <> c.festival) AS autres
      FROM evenements_sources AS x
      WHERE x.source = s.id
    ) AS k
    LEFT JOIN public.locations AS l ON s.sorte = 'location' AND l.id = s.id
    LEFT JOIN public.organizers AS o ON s.sorte = 'organizer' AND o.id = s.id
    WHERE k.autres > 0
    ORDER BY s.priorite, k.autres DESC, coalesce(l.name, o.name), s.id
    LIMIT 1
  ),
  -- « Aussi à » : la première date de chaque série de la source, sauf celle de la fiche et celles de son
  -- festival (la fiche les montre déjà : « Au même festival », ou le programme du festival).
  rangee_lieu AS MATERIALIZED (
    SELECT p.id, p.serie, row_number() OVER (ORDER BY p.date, p.id) AS ordre
    FROM (
      SELECT DISTINCT ON (x.serie) x.id, x.date, x.serie
      FROM source AS s
      JOIN evenements_sources AS x ON x.source = s.id
      CROSS JOIN serie_courante AS sc
      CROSS JOIN courant AS c
      WHERE x.serie <> sc.serie
        AND x.festival <> c.festival
      ORDER BY x.serie, x.date, x.id
    ) AS p
    ORDER BY p.date, p.id
    LIMIT (SELECT b.nombre FROM bornes AS b)
  ),
  -- La catégorie de l'événement : sa ligne de categories, par id ou par nom (comme le filtre de
  -- catégorie d'app_events_in_range) ; à défaut, son texte seul.
  categorie AS MATERIALIZED (
    SELECT c.categorie AS texte, k.id, upper(btrim(k.name)) AS nom
    FROM courant AS c
    LEFT JOIN LATERAL (
      SELECT g.id, g.name
      FROM public.categories AS g
      WHERE g.id::text = lower(c.categorie) OR upper(btrim(g.name)) = upper(c.categorie)
      ORDER BY g.id::text = lower(c.categorie) DESC, g.id
      LIMIT 1
    ) AS k ON true
    WHERE c.categorie IS NOT NULL
  ),
  -- Les événements autour de sa date, dans le périmètre.
  autour AS MATERIALIZED (
    SELECT e.id, e.date, e.end_date, nullif(btrim(e.category), '') AS categorie, e.tag_ids,
      coalesce(e.festival_id, e.id) AS festival
    FROM bornes AS b
    CROSS JOIN LATERAL public.app_events_in_range(
      greatest(b.aujourdhui, b.jour - interval '7 days'),
      b.jour + interval '8 days',
      app_see_also.city_ids,
      NULL,
      app_see_also.at_time,
      zone_city => app_see_also.zone_city,
      zone_km => app_see_also.zone_km
    ) AS e
  ),
  genre AS (
    SELECT
      x.id,
      x.date,
      n.serie,
      (
        SELECT count(DISTINCT t.id)
        FROM unnest(x.tag_ids) AS t(id)
        WHERE t.id = ANY (c.tags)
      )
      + CASE
          WHEN k.texte IS NULL OR x.categorie IS NULL THEN 0
          WHEN upper(x.categorie) = upper(k.texte) THEN 1
          WHEN k.id IS NOT NULL AND (x.categorie = k.id::text OR upper(x.categorie) = k.nom) THEN 1
          ELSE 0
        END AS score,
      CASE
        WHEN x.date <= b.ancre AND x.end_date > b.ancre THEN 0
        ELSE abs(extract(epoch FROM x.date - b.ancre))
      END AS ecart
    FROM autour AS x
    LEFT JOIN series AS se ON se.event_id = x.id
    CROSS JOIN LATERAL (SELECT coalesce(se.series_id, x.id) AS serie) AS n
    CROSS JOIN courant AS c
    CROSS JOIN serie_courante AS sc
    CROSS JOIN bornes AS b
    LEFT JOIN categorie AS k ON true
    -- Ni la série de la fiche (l'événement compris), ni son festival, ni les séries de la rangée « Aussi à ».
    WHERE n.serie <> sc.serie
      AND x.festival <> c.festival
      AND NOT EXISTS (SELECT 1 FROM rangee_lieu AS r WHERE r.serie = n.serie)
  ),
  -- La date la plus proche de chaque série, puis les plus proches.
  rangee_genre AS MATERIALIZED (
    SELECT p.id, p.date
    FROM (
      SELECT DISTINCT ON (g.serie) g.id, g.date, g.score, g.ecart
      FROM genre AS g
      WHERE g.score > 0
      ORDER BY g.serie, g.score DESC, g.ecart, g.date, g.id
    ) AS p
    ORDER BY p.score DESC, p.ecart, p.date, p.id
    LIMIT (SELECT b.nombre FROM bornes AS b)
  )
  SELECT 'place'::text, r.ordre::integer, r.id, s.sorte, s.id, s.nom, s.total::integer
  FROM rangee_lieu AS r
  CROSS JOIN source AS s
  UNION ALL
  SELECT
    'genre',
    ((SELECT count(*) FROM rangee_lieu) + row_number() OVER (ORDER BY g.date, g.id))::integer,
    g.id,
    NULL,
    NULL,
    NULL,
    NULL
  FROM rangee_genre AS g
  ORDER BY 2
$$;

COMMENT ON FUNCTION public.app_see_also(uuid, uuid[], timestamp, integer, text, numeric) IS
  'Fiche de l''app, « À voir aussi » : section place, les prochains événements du lieu de l''événement (ceux de sa page), à défaut de l''organisateur qui en a le plus, par date, avec la source (source_kind, source_id, source_name, source_events_count) ; section genre, ceux de la même catégorie ou d''un tag commun, à 7 jours au plus de sa date, dans le périmètre city_ids, sans ceux de la première rangée, les plus proches retenus puis rendus par date. À venir (app_events_in_range), une ligne par série (app_event_series ; un événement seul est la sienne), sans la série de la fiche ni les événements de son festival (ni le festival lui-même) ; max_results par rangée (1 à 20, 3 par défaut) ; rank pour l''ordre. Appel : rpc/app_see_also?select=section,rank,…,event:events(…)&order=rank. Règle complète : migrations 20261021110000, 20261021170000 et 20261023160000.';

GRANT EXECUTE ON FUNCTION public.app_see_also(uuid, uuid[], timestamp, integer, text, numeric) TO anon, authenticated;

-- Vérification (SQL Editor) : ce que le prochain message des suivis enverrait pour les festivals.
-- select user_id, target_name, count(*) from public.follows_digest() where target_type = 'festival' group by 1, 2;

-- Rollback : rejouer follows_digest de 20261021142000 et app_see_also de 20261021220000, puis
-- DROP TRIGGER IF EXISTS trg_events_set_festival_added_at ON public.events;
-- DROP FUNCTION IF EXISTS public.set_event_festival_added_at();
-- ALTER TABLE public.events DROP COLUMN IF EXISTS festival_added_at;
