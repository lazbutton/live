-- La zone de l'app : une ville et un rayon, une seule règle en SQL pour tout ce qui en dépend.
--
-- Refonte de « Ville et rayon » (../live/docs/VILLES.md, décisions du 2026-10-21) : l'app ne choisit plus
-- plusieurs villes dont elle calcule en Dart celles dans le rayon (distance entre centres) avant de refiltrer
-- les événements par leurs coordonnées. Elle envoie une zone, et la règle vit ici :
--
-- Un événement est dans la zone (ville, rayon) s'il est dans la ville choisie (sa ville, à défaut celle de son
-- lieu, est une des villes de son groupe : « 45000 Orléans » = « Orléans »), ou si son lieu (à défaut
-- l'événement lui-même) est à rayon km ou moins du centre de cette ville. « Orléans · 5 km » montre donc tout
-- Orléans, La Source comprise, et les communes voisines jusqu'à 5 km du centre. Sans zone, ou une ville
-- inconnue : toutes les villes (rien n'est retiré).
--
-- - app_distance_km(lat1, lng1, lat2, lng2) : distance à vol d'oiseau (haversine, rayon moyen de la Terre),
--   sans PostGIS ;
-- - app_city_groups() : les villes actives regroupées par libellé d'affichage, la règle d'app_cities() sortie
--   telle quelle pour servir aussi à la zone ;
-- - app_zone(zone_city, zone_km) : la ville (son id, ou son slug : l'app part de « orleans » sans rien avoir
--   lu), les villes de son groupe, son centre, le rayon ; aucune ligne si la ville est inconnue ;
-- - app_in_zone(…) : la règle ci-dessus, pour un événement (ou un lieu, un grand événement) ;
-- - app_events_in_range(…, zone_city, zone_km) : la zone en plus de city_ids (gardé pour les versions de l'app
--   déjà installées) ; les fonctions qui l'appellent avec city_ids la transmettent : app_event_counts,
--   app_category_counts, app_tag_counts, app_organizer_counts, app_search, app_search_names, app_see_also ;
-- - app_events_in_zone(zone_city, zone_km) : app_events() dans la zone, pour l'accueil « Toutes les dates » et
--   « À la une » (filtres PostgREST par-dessus, comme sur app_events()) ;
-- - app_major_events_in_zone(zone_city, zone_km) : les grands événements de la zone (leur ville, leur centre
--   sur la carte, l'un de leurs lieux ou de leurs événements) ;
-- - app_zone_counts(zone_city, radii, at_time) : pour chaque rayon, les événements à venir de la zone, comptés
--   comme l'accueil sur « Tout » (l'écran « Ville et rayon » : « 343 événements à venir à moins de 5 km
--   d'Orléans. ») ;
-- - app_cities() : une colonne slug, les événements à venir comptés par app_events_in_range (la règle de tout
--   le reste), et seulement les villes qui ont un centre et des événements, à venir ou récents (plus de
--   Paris ni d'adresse prise pour une ville dans la liste de l'app).
--
-- Changer la liste des paramètres change la signature : chaque ancienne fonction est supprimée avant de créer
-- la nouvelle (deux versions feraient hésiter PostgREST, PGRST203). Les paramètres ajoutés sont à la fin, avec
-- une valeur par défaut : les appels existants (versions installées de l'app, fonctions `language sql` qui
-- appellent app_events_in_range par position, résumés de notification) ne changent pas. À appliquer d'un bloc
-- (`psql --single-transaction`) : entre une suppression et sa création, l'app n'aurait plus la fonction. Pas
-- de BEGIN ni de COMMIT ici : une répétition dans une transaction annulée reste annulée.
--
-- Les villes et le centre de la zone sont calculés une fois, dans la sous-requête `b` (OFFSET 0), comme les
-- bornes de date (migration 20261019210000). `language sql`, `stable` ou `immutable`, `security invoker`, sans
-- clause SET ; tous les objets sont qualifiés. Prérequis : 20261021160000 (app_events_in_range, app_event_counts),
-- 20261019212000, 20261020140000, 20261020210000, 20261020170000, 20261021170000 (fonctions redéfinies),
-- 20261018200000 (app_cities).

CREATE OR REPLACE FUNCTION public.app_distance_km(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT 2 * 6371.0088 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))
$$;

COMMENT ON FUNCTION public.app_distance_km(double precision, double precision, double precision, double precision) IS
  'Distance à vol d''oiseau en km entre deux points (latitude, longitude en degrés) : haversine, rayon moyen de la Terre. Nulle si une coordonnée manque.';

GRANT EXECUTE ON FUNCTION public.app_distance_km(double precision, double precision, double precision, double precision)
  TO anon, authenticated;

-- Le regroupement d'app_cities() (migration 20261018200000), inchangé : villes actives regroupées par
-- libellé d'affichage comparé normalisé ; la représentante, son slug et son libellé ; le centre, moyenne des
-- centres renseignés ; les libellés bruts qui diffèrent (alias de recherche).
CREATE OR REPLACE FUNCTION public.app_city_groups()
RETURNS TABLE (
  id uuid,
  slug text,
  label text,
  group_key text,
  center_lat double precision,
  center_lng double precision,
  search_aliases text[],
  source_ids uuid[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH villes AS (
    SELECT *
    FROM (
      SELECT
        c.id,
        c.slug,
        c.label,
        c.center_lat,
        c.center_lng,
        x.libelle,
        public.normalize_city_label(x.libelle) AS cle,
        row_number() OVER (ORDER BY c.label, c.id) AS ordre
      FROM public.cities AS c
      CROSS JOIN LATERAL (
        SELECT public.extract_city_label_from_address(c.label) AS libelle
      ) AS x
      WHERE c.is_active
    ) AS v
    WHERE v.cle <> ''
  ),
  groupes AS (
    SELECT
      v.cle,
      (array_agg(v.libelle ORDER BY v.ordre))[1] AS libelle,
      coalesce(
        (array_agg(v.id ORDER BY v.ordre) FILTER (
          WHERE public.normalize_city_label(v.label) = v.cle AND v.label !~ '\d'
        ))[1],
        (array_agg(v.id ORDER BY v.ordre))[1]
      ) AS id,
      avg(v.center_lat) FILTER (WHERE v.center_lat IS NOT NULL AND v.center_lng IS NOT NULL)
        AS center_lat,
      avg(v.center_lng) FILTER (WHERE v.center_lat IS NOT NULL AND v.center_lng IS NOT NULL)
        AS center_lng,
      array_agg(v.id ORDER BY v.ordre) AS source_ids
    FROM villes AS v
    GROUP BY v.cle
  ),
  alias AS (
    SELECT a.cle, array_agg(a.alias ORDER BY a.ordre) AS search_aliases
    FROM (
      SELECT v.cle, btrim(v.label) AS alias, min(v.ordre) AS ordre
      FROM villes AS v
      WHERE btrim(v.label) <> ''
        AND public.normalize_city_label(v.label) <> v.cle
      GROUP BY v.cle, btrim(v.label)
    ) AS a
    GROUP BY a.cle
  )
  SELECT
    g.id,
    c.slug,
    g.libelle,
    g.cle,
    g.center_lat::double precision,
    g.center_lng::double precision,
    coalesce(a.search_aliases, '{}'::text[]),
    g.source_ids
  FROM groupes AS g
  JOIN public.cities AS c ON c.id = g.id
  LEFT JOIN alias AS a ON a.cle = g.cle
$$;

COMMENT ON FUNCTION public.app_city_groups() IS
  'Villes actives regroupées par libellé d''affichage (« 45000 Orléans » = « Orléans ») : id et slug de la représentante, libellé, clé du groupe, centre (moyenne des centres renseignés), alias (libellés bruts qui diffèrent), toutes les villes du groupe (source_ids). Règle de app_cities() et de la zone (app_zone).';

GRANT EXECUTE ON FUNCTION public.app_city_groups() TO anon, authenticated;

-- La zone : la ville par son id ou son slug (une ville du groupe, active), ses villes, son centre, le rayon
-- (négatif : 0 ; nul : la ville seule). Aucune ligne pour une ville nulle ou inconnue.
CREATE OR REPLACE FUNCTION public.app_zone(zone_city text, zone_km numeric DEFAULT NULL)
RETURNS TABLE (
  city_ids uuid[],
  center_lat double precision,
  center_lng double precision,
  radius_km double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    g.source_ids,
    g.center_lat,
    g.center_lng,
    greatest(app_zone.zone_km, 0)::double precision
  FROM public.app_city_groups() AS g
  WHERE EXISTS (
    SELECT 1
    FROM public.cities AS c
    WHERE c.id = ANY (g.source_ids)
      AND (c.id::text = lower(btrim(app_zone.zone_city)) OR c.slug = lower(btrim(app_zone.zone_city)))
  )
  LIMIT 1
$$;

COMMENT ON FUNCTION public.app_zone(text, numeric) IS
  'Zone de l''app : la ville zone_city (id ou slug d''une ville active), les villes de son groupe (city_ids), son centre, le rayon zone_km (nul : la ville seule). Aucune ligne pour une ville nulle ou inconnue (pas de zone : toutes les villes). Règle : migration 20261021220000.';

GRANT EXECUTE ON FUNCTION public.app_zone(text, numeric) TO anon, authenticated;

-- La règle : dans la ville de la zone (une ville de son groupe), ou à radius_km ou moins de son centre. Sans
-- zone (zone_city_ids nul) : oui.
CREATE OR REPLACE FUNCTION public.app_in_zone(
  city_id uuid,
  latitude numeric,
  longitude numeric,
  zone_city_ids uuid[],
  zone_lat double precision,
  zone_lng double precision,
  zone_km double precision
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    app_in_zone.zone_city_ids IS NULL
    OR coalesce(app_in_zone.city_id = ANY (app_in_zone.zone_city_ids), false)
    OR coalesce(
      public.app_distance_km(
        app_in_zone.latitude::double precision,
        app_in_zone.longitude::double precision,
        app_in_zone.zone_lat,
        app_in_zone.zone_lng
      ) <= app_in_zone.zone_km,
      false
    )
$$;

COMMENT ON FUNCTION public.app_in_zone(uuid, numeric, numeric, uuid[], double precision, double precision, double precision) IS
  'Règle de la zone de l''app : vrai sans zone (zone_city_ids nul), si city_id est une ville de la zone, ou si (latitude, longitude) est à zone_km ou moins du centre de la zone. Les autres paramètres viennent de app_zone. Migration 20261021220000.';

GRANT EXECUTE ON FUNCTION public.app_in_zone(uuid, numeric, numeric, uuid[], double precision, double precision, double precision)
  TO anon, authenticated;

DROP FUNCTION IF EXISTS public.app_events_in_range(timestamp, timestamp, uuid[], text, timestamp, boolean, boolean);

CREATE OR REPLACE FUNCTION public.app_events_in_range(
  range_start timestamp,
  range_end timestamp DEFAULT NULL,
  city_ids uuid[] DEFAULT NULL,
  category text DEFAULT NULL,
  at_time timestamp DEFAULT NULL,
  free boolean DEFAULT false,
  family boolean DEFAULT false,
  zone_city text DEFAULT NULL,
  zone_km numeric DEFAULT NULL
)
RETURNS SETOF public.events
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT e.*
  FROM (
    SELECT
      coalesce(app_events_in_range.range_start, '-infinity'::timestamp) AT TIME ZONE 'UTC' AS debut,
      coalesce(app_events_in_range.range_end, 'infinity'::timestamp) AT TIME ZONE 'UTC' AS fin,
      coalesce(app_events_in_range.at_time, now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'UTC'
        AS maintenant,
      nullif(btrim(app_events_in_range.category), '') AS categorie,
      coalesce(app_events_in_range.free, false) AS gratuit,
      coalesce(app_events_in_range.family, false) AS en_famille,
      -- Le tag « Jeune Public », par son nom : aucun, une liste vide.
      (
        SELECT coalesce(array_agg(t.id), '{}'::uuid[])
        FROM public.tags AS t
        WHERE upper(btrim(t.name)) = 'JEUNE PUBLIC'
      ) AS jeune_public,
      -- La zone (app_zone) : sans zone ou ville inconnue, des valeurs nulles (toutes les villes).
      z.city_ids AS zone_villes,
      z.center_lat AS zone_lat,
      z.center_lng AS zone_lng,
      z.radius_km AS zone_km
    FROM (SELECT) AS un
    LEFT JOIN LATERAL public.app_zone(app_events_in_range.zone_city, app_events_in_range.zone_km) AS z ON true
    -- OFFSET 0 : les bornes sont calculées à part. Recopiées dans les conditions sur events, leur
    -- AT TIME ZONE (fonction non « leakproof ») y empêcherait l'usage des index sous la RLS.
    OFFSET 0
  ) AS b
  CROSS JOIN public.app_events() AS e
  LEFT JOIN public.locations AS l ON l.id = e.location_id
  -- 1 et 2 : commence dans la plage, ou dure plus de 12 h et a commencé avant sans être fini.
  WHERE public.app_event_in_range(e.date, e.end_date, b.debut, b.fin)
    -- 3 : pas terminé (sans fin : à minuit le soir de son début, 24 h fixes en heure murale).
    AND coalesce(e.end_date, date_trunc('day', e.date, 'UTC') + interval '24 hours') > b.maintenant
    -- Périmètre des versions précédentes de l'app : ville de l'événement, à défaut celle de son lieu.
    AND (
      app_events_in_range.city_ids IS NULL
      OR cardinality(app_events_in_range.city_ids) = 0
      OR coalesce(e.city_id, l.city_id) = ANY (app_events_in_range.city_ids)
    )
    -- Zone : la ville choisie, ou le lieu (à défaut l'événement) à moins du rayon de son centre.
    AND public.app_in_zone(
      coalesce(e.city_id, l.city_id),
      coalesce(l.latitude, e.latitude),
      coalesce(l.longitude, e.longitude),
      b.zone_villes,
      b.zone_lat,
      b.zone_lng,
      b.zone_km
    )
    -- Catégorie : par son id ou son nom, que events.category contienne l'un ou l'autre.
    AND (
      b.categorie IS NULL
      OR upper(btrim(e.category)) = upper(b.categorie)
      OR EXISTS (
        SELECT 1
        FROM public.categories AS c
        WHERE (c.id::text = lower(b.categorie) OR upper(btrim(c.name)) = upper(b.categorie))
          AND (e.category = c.id::text OR upper(btrim(e.category)) = upper(btrim(c.name)))
      )
    )
    -- Gratuit : tous les prix connus à 0.
    AND (NOT b.gratuit OR e.price_kind = 'free')
    -- En famille : la case « jeune public », ou le tag « Jeune Public ».
    AND (NOT b.en_famille OR e.is_young_audience OR e.tag_ids && b.jeune_public)
    -- Par utilisateur : ses événements masqués et les auteurs qu'il a bloqués.
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_hidden_events AS h
      WHERE h.event_id = e.id
        AND h.user_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.blocked_users AS bu
      WHERE bu.blocker_user_id = auth.uid()
        AND bu.blocked_user_id = e.created_by
    )
$$;

COMMENT ON FUNCTION public.app_events_in_range(timestamp, timestamp, uuid[], text, timestamp, boolean, boolean, text, numeric) IS
  'Événements de app_events() dans la plage [range_start, range_end) (heure de Paris) : commencent dans la plage, ou durent plus de 12 h et ont commencé avant ; pas terminés. Zone (zone_city, zone_km : la ville, ou à moins du rayon de son centre ; app_in_zone), ancien périmètre (city_ids, à défaut la ville du lieu), catégorie (id ou nom), gratuits seulement (free : price_kind = free), en famille seulement (family : is_young_audience ou le tag « Jeune Public »), sans les événements masqués par l''utilisateur ni ceux des auteurs bloqués. Règles : migrations 20261019210000, 20261021160000 et 20261021220000.';

GRANT EXECUTE ON FUNCTION public.app_events_in_range(timestamp, timestamp, uuid[], text, timestamp, boolean, boolean, text, numeric)
  TO anon, authenticated;

-- Les fonctions qui transmettent city_ids à app_events_in_range : inchangées, la zone en plus, transmise
-- de même (dernières définitions : migrations 20261021160000, 20261019212000, 20261020140000,
-- 20261020210000, 20261020170000, 20261021170000).

DROP FUNCTION IF EXISTS public.app_event_counts(jsonb, uuid[], text, timestamp, boolean, boolean);

CREATE OR REPLACE FUNCTION public.app_event_counts(
  ranges jsonb,
  city_ids uuid[] DEFAULT NULL,
  category text DEFAULT NULL,
  at_time timestamp DEFAULT NULL,
  free boolean DEFAULT false,
  family boolean DEFAULT false,
  zone_city text DEFAULT NULL,
  zone_km numeric DEFAULT NULL
)
RETURNS TABLE (
  range_index integer,
  range_key text,
  range_start timestamp,
  range_end timestamp,
  events_count integer,
  starting_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH plages AS (
    SELECT
      (r.ordre - 1)::integer AS indice,
      r.plage ->> 'key' AS cle,
      (r.plage ->> 'start')::timestamp AS debut,
      (r.plage ->> 'end')::timestamp AS fin
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(app_event_counts.ranges) = 'array' THEN app_event_counts.ranges ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS r(plage, ordre)
    ORDER BY r.ordre
    LIMIT 500
  ),
  bornes AS (
    SELECT
      p.*,
      coalesce(p.debut, '-infinity'::timestamp) AT TIME ZONE 'UTC' AS debut_tz,
      coalesce(p.fin, 'infinity'::timestamp) AT TIME ZONE 'UTC' AS fin_tz
    FROM plages AS p
  ),
  -- Les événements sont lus une fois, sur l'union des plages : un événement d'une plage appartient
  -- toujours à [plus petit début, plus grande fin). Chaque plage les retrie ensuite.
  candidats AS (
    SELECT e.id, e.date, e.end_date
    FROM (
      SELECT min(coalesce(p.debut, '-infinity'::timestamp)) AS debut, max(coalesce(p.fin, 'infinity'::timestamp)) AS fin
      FROM plages AS p
      HAVING count(*) > 0
    ) AS u
    CROSS JOIN LATERAL public.app_events_in_range(
      u.debut,
      u.fin,
      app_event_counts.city_ids,
      app_event_counts.category,
      app_event_counts.at_time,
      app_event_counts.free,
      app_event_counts.family,
      zone_city => app_event_counts.zone_city,
      zone_km => app_event_counts.zone_km
    ) AS e
    -- Sur « Tout », l'accueil n'affiche pas les événements retirés de l'accueil.
    WHERE nullif(btrim(app_event_counts.category), '') IS NOT NULL OR NOT e.hide_from_home
  )
  SELECT
    b.indice,
    b.cle,
    b.debut,
    b.fin,
    count(c.id)::integer,
    count(c.id) FILTER (WHERE c.date >= b.debut_tz)::integer
  FROM bornes AS b
  LEFT JOIN candidats AS c ON public.app_event_in_range(c.date, c.end_date, b.debut_tz, b.fin_tz)
  GROUP BY b.indice, b.cle, b.debut, b.fin
  ORDER BY b.indice
$$;

COMMENT ON FUNCTION public.app_event_counts(jsonb, uuid[], text, timestamp, boolean, boolean, text, numeric) IS
  'Comptes du calendrier de l''app : pour chaque plage {start, end, key} de ranges (heure de Paris), events_count (événements de app_events_in_range, une fois chacun ; sans hide_from_home sur « Tout ») et starting_count (ceux qui commencent dans la plage). free et family : seulement les gratuits, ou en famille (règles d''app_events_in_range, migration 20261021160000).';

GRANT EXECUTE ON FUNCTION public.app_event_counts(jsonb, uuid[], text, timestamp, boolean, boolean, text, numeric)
  TO anon, authenticated;

DROP FUNCTION IF EXISTS public.app_category_counts(uuid[], timestamp);

CREATE OR REPLACE FUNCTION public.app_category_counts(
  city_ids uuid[] DEFAULT NULL,
  at_time timestamp DEFAULT NULL,
  zone_city text DEFAULT NULL,
  zone_km numeric DEFAULT NULL
)
RETURNS TABLE (
  category_id uuid,
  name text,
  display_order integer,
  events_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH a_venir AS (
    SELECT e.category
    FROM public.app_events_in_range(
      date_trunc('day', coalesce(app_category_counts.at_time, now() AT TIME ZONE 'Europe/Paris')),
      NULL,
      app_category_counts.city_ids,
      NULL,
      app_category_counts.at_time,
      zone_city => app_category_counts.zone_city,
      zone_km => app_category_counts.zone_km
    ) AS e
  )
  SELECT
    c.id,
    c.name,
    c.display_order,
    count(a.category)::integer
  FROM public.categories AS c
  LEFT JOIN a_venir AS a
    ON a.category = c.id::text
    OR upper(btrim(a.category)) = upper(btrim(c.name))
  WHERE c.is_active
  GROUP BY c.id, c.name, c.display_order
  ORDER BY count(a.category) DESC, c.display_order NULLS LAST, c.name
$$;

COMMENT ON FUNCTION public.app_category_counts(uuid[], timestamp, text, numeric) IS
  'Recherche de l''app : catégories actives et leur nombre d''événements à venir (app_events_in_range à partir d''aujourd''hui, heure de Paris) dans le périmètre city_ids, la plus fournie d''abord.';

GRANT EXECUTE ON FUNCTION public.app_category_counts(uuid[], timestamp, text, numeric) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.app_tag_counts(uuid[], integer, timestamp);

CREATE OR REPLACE FUNCTION public.app_tag_counts(
  city_ids uuid[] DEFAULT NULL,
  max_tags integer DEFAULT 20,
  at_time timestamp DEFAULT NULL,
  zone_city text DEFAULT NULL,
  zone_km numeric DEFAULT NULL
)
RETURNS TABLE (
  tag_id uuid,
  name text,
  events_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    t.id,
    t.name,
    count(DISTINCT e.id)::integer
  FROM public.app_events_in_range(
    date_trunc('day', coalesce(app_tag_counts.at_time, now() AT TIME ZONE 'Europe/Paris')),
    NULL,
    app_tag_counts.city_ids,
    NULL,
    app_tag_counts.at_time,
    zone_city => app_tag_counts.zone_city,
    zone_km => app_tag_counts.zone_km
  ) AS e
  CROSS JOIN LATERAL unnest(e.tag_ids) AS x(tag_id)
  JOIN public.tags AS t ON t.id = x.tag_id
  GROUP BY t.id, t.name
  ORDER BY count(DISTINCT e.id) DESC, t.name
  LIMIT greatest(1, least(coalesce(app_tag_counts.max_tags, 20), 100))
$$;

COMMENT ON FUNCTION public.app_tag_counts(uuid[], integer, timestamp, text, numeric) IS
  'Recherche de l''app : tags populaires, avec leur nombre d''événements à venir (app_events_in_range à partir d''aujourd''hui, heure de Paris) dans le périmètre city_ids, le plus fourni d''abord ; max_tags au plus (1 à 100, 20 par défaut).';

GRANT EXECUTE ON FUNCTION public.app_tag_counts(uuid[], integer, timestamp, text, numeric) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.app_organizer_counts(uuid[], uuid[], timestamp);

CREATE OR REPLACE FUNCTION public.app_organizer_counts(
  organizer_ids uuid[],
  city_ids uuid[] DEFAULT NULL,
  at_time timestamp DEFAULT NULL,
  zone_city text DEFAULT NULL,
  zone_km numeric DEFAULT NULL
)
RETURNS TABLE (
  organizer_id uuid,
  kind text,
  events_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH demandes AS (
    SELECT DISTINCT x.id
    FROM unnest(coalesce(app_organizer_counts.organizer_ids, '{}'::uuid[])) AS x(id)
    WHERE x.id IS NOT NULL
    LIMIT 200
  ),
  entites AS (
    SELECT d.id, 'organizer'::text AS kind
    FROM demandes AS d
    JOIN public.organizers AS o ON o.id = d.id
    UNION ALL
    SELECT d.id, 'location'::text AS kind
    FROM demandes AS d
    JOIN public.locations AS l ON l.id = d.id
  ),
  a_venir AS (
    SELECT e.id, e.location_id
    FROM public.app_events_in_range(
      date_trunc('day', coalesce(app_organizer_counts.at_time, now() AT TIME ZONE 'Europe/Paris')),
      NULL,
      app_organizer_counts.city_ids,
      NULL,
      app_organizer_counts.at_time,
      zone_city => app_organizer_counts.zone_city,
      zone_km => app_organizer_counts.zone_km
    ) AS e
  ),
  -- (organisateur ou lieu, événement), sans doublon : UNION.
  liens AS (
    SELECT eo.organizer_id AS entite, eo.event_id
    FROM public.event_organizers AS eo
    JOIN demandes AS d ON d.id = eo.organizer_id
    UNION
    SELECT eo.location_id AS entite, eo.event_id
    FROM public.event_organizers AS eo
    JOIN demandes AS d ON d.id = eo.location_id
    UNION
    SELECT a.location_id AS entite, a.id AS event_id
    FROM a_venir AS a
    JOIN demandes AS d ON d.id = a.location_id
  )
  SELECT
    en.id,
    en.kind,
    count(DISTINCT a.id)::integer
  FROM entites AS en
  LEFT JOIN liens AS li ON li.entite = en.id
  LEFT JOIN a_venir AS a ON a.id = li.event_id
  GROUP BY en.id, en.kind
  ORDER BY count(DISTINCT a.id) DESC, en.id
$$;

COMMENT ON FUNCTION public.app_organizer_counts(uuid[], uuid[], timestamp, text, numeric) IS
  'Fiche de l''app : nombre d''événements à venir (app_events_in_range à partir d''aujourd''hui, heure de Paris) de chaque organisateur demandé : organizers par event_organizers.organizer_id ; lieu par event_organizers.location_id et events.location_id, chaque événement une fois.';

GRANT EXECUTE ON FUNCTION public.app_organizer_counts(uuid[], uuid[], timestamp, text, numeric) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.app_search(text, uuid[], timestamp, integer);

CREATE OR REPLACE FUNCTION public.app_search(
  query text,
  city_ids uuid[] DEFAULT NULL,
  at_time timestamp DEFAULT NULL,
  max_results integer DEFAULT 30,
  zone_city text DEFAULT NULL,
  zone_km numeric DEFAULT NULL
)
RETURNS SETOF public.app_search_results
LANGUAGE sql
STABLE
SECURITY INVOKER
ROWS 30
AS $$
  WITH mots AS MATERIALIZED (
    SELECT * FROM public.app_search_query_words(app_search.query) WHERE required
  ),
  requete AS MATERIALIZED (
    SELECT min(w.phrase) AS phrase, min(w.word_count) AS nombre_mots
    FROM public.app_search_query_words(app_search.query) AS w
    HAVING count(*) > 0
  ),
  -- Les noms qui contiennent un mot de la requête : comparés une fois par lieu, salle, artiste,
  -- organisateur, catégorie, tag ou ville, pas une fois par événement.
  noms AS (
    SELECT 'lieu'::text AS sorte, l.id, NULL::text AS cle, public.app_search_normalize(l.name) AS texte
    FROM public.locations AS l WHERE EXISTS (SELECT 1 FROM requete)
    UNION ALL
    SELECT 'salle', r.id, NULL, public.app_search_normalize(r.name)
    FROM public.rooms AS r WHERE EXISTS (SELECT 1 FROM requete)
    UNION ALL
    SELECT 'artiste', ar.id, NULL, public.app_search_normalize(ar.name)
    FROM public.artists AS ar WHERE EXISTS (SELECT 1 FROM requete)
    UNION ALL
    SELECT 'organisateur', o.id, NULL, public.app_search_normalize(o.name)
    FROM public.organizers AS o WHERE EXISTS (SELECT 1 FROM requete)
    UNION ALL
    SELECT 'categorie', c.id, upper(btrim(c.name)), public.app_search_normalize(c.name)
    FROM public.categories AS c WHERE EXISTS (SELECT 1 FROM requete)
    UNION ALL
    SELECT 'tag', t.id, NULL, public.app_search_normalize(t.name)
    FROM public.tags AS t WHERE EXISTS (SELECT 1 FROM requete)
    UNION ALL
    SELECT 'ville', ci.id, NULL, public.app_search_normalize(ci.label)
    FROM public.cities AS ci WHERE EXISTS (SELECT 1 FROM requete)
  ),
  trouves AS MATERIALIZED (
    SELECT
      n.sorte,
      n.id,
      n.cle,
      m.word,
      s.score,
      q.nombre_mots > 1 AND strpos(' ' || n.texte, ' ' || q.phrase) > 0 AS phrase
    FROM noms AS n
    CROSS JOIN requete AS q
    CROSS JOIN mots AS m
    CROSS JOIN LATERAL (
      SELECT public.app_search_word_score(m.word, m.word_query, m.word_prefix, m.word_pattern, n.texte) AS score
    ) AS s
    WHERE s.score > 0
  ),
  evenements AS MATERIALIZED (
    SELECT
      e.id,
      e.date,
      e.category,
      e.tag_ids,
      e.location_id,
      e.room_id,
      coalesce(e.city_id, l.city_id) AS ville,
      public.app_search_normalize(e.title) AS titre,
      lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(e.description, ''))) AS description
    FROM public.app_events_in_range(
      date_trunc('day', coalesce(app_search.at_time, now() AT TIME ZONE 'Europe/Paris')),
      NULL,
      app_search.city_ids,
      NULL,
      app_search.at_time,
      zone_city => app_search.zone_city,
      zone_km => app_search.zone_km
    ) AS e
    LEFT JOIN public.locations AS l ON l.id = e.location_id
    WHERE EXISTS (SELECT 1 FROM requete)
  ),
  -- (événement, mot) trouvés dans un nom lié : qui et où 0,6 ; quoi et ville 0,45.
  liens AS (
    SELECT e.id AS event_id, t.word, 0.6 * t.score AS score, CASE WHEN t.phrase THEN 0.6 ELSE 0 END AS phrase
    FROM evenements AS e JOIN trouves AS t ON t.sorte = 'lieu' AND t.id = e.location_id
    UNION ALL
    SELECT e.id, t.word, 0.6 * t.score, CASE WHEN t.phrase THEN 0.6 ELSE 0 END
    FROM evenements AS e JOIN trouves AS t ON t.sorte = 'salle' AND t.id = e.room_id
    UNION ALL
    SELECT ea.event_id, t.word, 0.6 * t.score, CASE WHEN t.phrase THEN 0.6 ELSE 0 END
    FROM trouves AS t
    JOIN public.event_artists AS ea ON t.sorte = 'artiste' AND ea.artist_id = t.id
    UNION ALL
    SELECT eo.event_id, t.word, 0.6 * t.score, CASE WHEN t.phrase THEN 0.6 ELSE 0 END
    FROM trouves AS t
    JOIN public.event_organizers AS eo ON t.sorte = 'organisateur' AND eo.organizer_id = t.id
    UNION ALL
    SELECT eo.event_id, t.word, 0.6 * t.score, CASE WHEN t.phrase THEN 0.6 ELSE 0 END
    FROM trouves AS t
    JOIN public.event_organizers AS eo ON t.sorte = 'lieu' AND eo.location_id = t.id
    UNION ALL
    SELECT e.id, t.word, 0.45 * t.score, CASE WHEN t.phrase THEN 0.45 ELSE 0 END
    FROM evenements AS e
    JOIN trouves AS t ON t.sorte = 'categorie' AND (e.category = t.id::text OR upper(btrim(e.category)) = t.cle)
    UNION ALL
    SELECT e.id, t.word, 0.45 * t.score, CASE WHEN t.phrase THEN 0.45 ELSE 0 END
    FROM evenements AS e JOIN trouves AS t ON t.sorte = 'tag' AND t.id = ANY (e.tag_ids)
    UNION ALL
    SELECT e.id, t.word, 0.45 * t.score, CASE WHEN t.phrase THEN 0.45 ELSE 0 END
    FROM evenements AS e JOIN trouves AS t ON t.sorte = 'ville' AND t.id = e.ville
  ),
  meilleurs AS (
    SELECT li.event_id, li.word, max(li.score) AS score, max(li.phrase) AS phrase
    FROM liens AS li
    GROUP BY li.event_id, li.word
  ),
  par_mot AS (
    SELECT
      e.id,
      e.date,
      e.titre,
      e.description,
      m.word_prefix,
      m.word_query,
      coalesce(b.phrase, 0) AS phrase,
      greatest(
        public.app_search_word_score(m.word, m.word_query, m.word_prefix, m.word_pattern,
          e.titre, to_tsvector('pg_catalog.french', e.titre)),
        coalesce(b.score, 0)
      ) AS ailleurs
    FROM evenements AS e
    CROSS JOIN mots AS m
    LEFT JOIN meilleurs AS b ON b.event_id = e.id AND b.word = m.word
  ),
  scores AS (
    SELECT
      p.id,
      p.date,
      avg(p.meilleur)
        + CASE WHEN min(q.nombre_mots) > 1 THEN 0.4 * greatest(
            CASE WHEN strpos(' ' || min(p.titre), ' ' || min(q.phrase)) > 0 THEN 1 ELSE 0 END,
            max(p.phrase)
          ) ELSE 0 END
        + CASE WHEN min(p.titre) = min(q.phrase) THEN 0.2 ELSE 0 END AS score
    FROM (
      SELECT
        pm.id,
        pm.date,
        pm.titre,
        pm.phrase,
        CASE
          -- La description (0,25 × 0,85 au plus) ne changerait rien : pas de plein texte.
          WHEN pm.ailleurs >= 0.25 * 0.85 THEN pm.ailleurs
          WHEN pm.word_prefix IS NULL OR strpos(pm.description, pm.word_prefix) = 0 THEN pm.ailleurs
          WHEN to_tsvector('pg_catalog.french', pm.description) @@ pm.word_query THEN 0.25 * 0.85
          ELSE pm.ailleurs
        END AS meilleur
      FROM par_mot AS pm
    ) AS p
    CROSS JOIN requete AS q
    GROUP BY p.id, p.date
    HAVING bool_and(p.meilleur > 0)
  )
  SELECT s.id, (row_number() OVER (ORDER BY s.score DESC, s.date, s.id))::integer
  FROM scores AS s
  ORDER BY s.score DESC, s.date, s.id
  LIMIT greatest(1, least(coalesce(app_search.max_results, 30), 100))
$$;

COMMENT ON FUNCTION public.app_search(text, uuid[], timestamp, integer, text, numeric) IS
  'Recherche de l''app : événements à venir (app_events_in_range à partir d''aujourd''hui, heure de Paris, périmètre city_ids) dont chaque mot exigé de la requête se trouve dans le titre, les artistes liés, le lieu, les organisateurs, la catégorie, les tags, la ville ou la description (sans accents ni casse ; mot entier, début de mot, racine française, faute de frappe). Une ligne (event_id, rank) par événement, rank 1 le plus pertinent puis par date ; max_results au plus (1 à 100, 30 par défaut). Appel : rpc/app_search?select=rank,event:events(…)&order=rank. Règle complète : migration 20261020170000.';

GRANT EXECUTE ON FUNCTION public.app_search(text, uuid[], timestamp, integer, text, numeric) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.app_search_names(text, uuid[], timestamp, integer);

CREATE OR REPLACE FUNCTION public.app_search_names(
  query text,
  city_ids uuid[] DEFAULT NULL,
  at_time timestamp DEFAULT NULL,
  max_results integer DEFAULT 10,
  zone_city text DEFAULT NULL,
  zone_km numeric DEFAULT NULL
)
RETURNS TABLE (
  rank integer,
  kind text,
  id uuid,
  name text,
  events_count integer,
  is_organizer boolean,
  image_url text,
  city text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
ROWS 40
AS $$
  WITH mots AS MATERIALIZED (
    SELECT * FROM public.app_search_query_words(app_search_names.query)
  ),
  requete AS MATERIALIZED (
    SELECT min(m.phrase) AS phrase, min(m.word_count) AS nombre_mots
    FROM mots AS m
    HAVING count(*) > 0
  ),
  -- Les noms candidats, normalisés.
  noms AS (
    SELECT 'category'::text AS sorte, c.id, c.name, public.app_search_normalize(c.name) AS texte
    FROM public.categories AS c
    WHERE c.is_active AND EXISTS (SELECT 1 FROM requete)
    UNION ALL
    SELECT 'tag', t.id, t.name, public.app_search_normalize(t.name)
    FROM public.tags AS t
    WHERE EXISTS (SELECT 1 FROM requete)
    UNION ALL
    SELECT 'location', l.id, l.name, public.app_search_normalize(l.name)
    FROM public.locations AS l
    WHERE EXISTS (SELECT 1 FROM requete)
    UNION ALL
    SELECT 'organizer', o.id, o.name, public.app_search_normalize(o.name)
    FROM public.organizers AS o
    WHERE EXISTS (SELECT 1 FROM requete)
  ),
  trouves AS MATERIALIZED (
    SELECT
      n.sorte,
      n.id,
      n.name,
      n.texte,
      s.moyenne
        + CASE WHEN q.nombre_mots > 1 AND strpos(' ' || n.texte, ' ' || q.phrase) > 0 THEN 0.4 ELSE 0 END
        + CASE WHEN n.texte = q.phrase THEN 0.3 ELSE 0 END AS score
    FROM noms AS n
    CROSS JOIN requete AS q
    CROSS JOIN LATERAL (
      SELECT avg(p.score) AS moyenne, bool_and(p.score > 0) AS tous
      FROM mots AS m
      CROSS JOIN LATERAL (
        SELECT public.app_search_word_score(m.word, m.word_query, m.word_prefix, m.word_pattern,
          n.texte, to_tsvector('pg_catalog.french', n.texte)) AS score
      ) AS p
      WHERE m.required
    ) AS s
    WHERE s.tous
  ),
  a_venir AS MATERIALIZED (
    SELECT e.id, e.location_id, e.category, e.tag_ids
    FROM public.app_events_in_range(
      date_trunc('day', coalesce(app_search_names.at_time, now() AT TIME ZONE 'Europe/Paris')),
      NULL,
      app_search_names.city_ids,
      NULL,
      app_search_names.at_time,
      zone_city => app_search_names.zone_city,
      zone_km => app_search_names.zone_km
    ) AS e
    WHERE EXISTS (SELECT 1 FROM trouves)
  ),
  -- Organisateur qui porte le nom d'un lieu : compté avec le lieu, trouvé lui aussi (même nom).
  homonymes AS MATERIALIZED (
    SELECT o.id AS organizer_id, min(l.id::text)::uuid AS location_id
    FROM trouves AS o
    JOIN trouves AS l ON l.sorte = 'location' AND l.texte = o.texte
    WHERE o.sorte = 'organizer'
    GROUP BY o.id
  ),
  -- (nom trouvé, événement à venir) et si le lien en fait un organisateur.
  liens AS (
    SELECT t.id AS entite, a.id AS event_id, false AS organise
    FROM trouves AS t
    JOIN public.categories AS c ON c.id = t.id
    JOIN a_venir AS a ON a.category = c.id::text OR upper(btrim(a.category)) = upper(btrim(c.name))
    WHERE t.sorte = 'category'
    UNION ALL
    SELECT t.id, a.id, false
    FROM trouves AS t
    JOIN a_venir AS a ON t.id = ANY (a.tag_ids)
    WHERE t.sorte = 'tag'
    UNION ALL
    SELECT t.id, a.id, false
    FROM trouves AS t
    JOIN a_venir AS a ON a.location_id = t.id
    WHERE t.sorte = 'location'
    UNION ALL
    SELECT t.id, a.id, true
    FROM trouves AS t
    JOIN public.event_organizers AS eo ON eo.location_id = t.id
    JOIN a_venir AS a ON a.id = eo.event_id
    WHERE t.sorte = 'location'
    UNION ALL
    SELECT coalesce(h.location_id, t.id), a.id, true
    FROM trouves AS t
    JOIN public.event_organizers AS eo ON eo.organizer_id = t.id
    JOIN a_venir AS a ON a.id = eo.event_id
    LEFT JOIN homonymes AS h ON h.organizer_id = t.id
    WHERE t.sorte = 'organizer'
  ),
  comptes AS (
    SELECT li.entite, count(DISTINCT li.event_id)::integer AS nombre, bool_or(li.organise) AS organise
    FROM liens AS li
    GROUP BY li.entite
  ),
  classes AS (
    SELECT
      t.sorte,
      t.id,
      t.name,
      c.nombre,
      c.organise,
      row_number() OVER (PARTITION BY t.sorte ORDER BY t.score DESC, c.nombre DESC, t.texte, t.id) AS rang
    FROM trouves AS t
    JOIN comptes AS c ON c.entite = t.id
    WHERE NOT EXISTS (SELECT 1 FROM homonymes AS h WHERE h.organizer_id = t.id)
  )
  SELECT
    (row_number() OVER (
      ORDER BY CASE k.sorte WHEN 'category' THEN 1 WHEN 'tag' THEN 2 WHEN 'location' THEN 3 ELSE 4 END, k.rang
    ))::integer,
    k.sorte,
    k.id,
    k.name,
    k.nombre,
    CASE k.sorte WHEN 'location' THEN k.organise ELSE k.sorte = 'organizer' END,
    CASE k.sorte
      WHEN 'location' THEN (SELECT nullif(btrim(l.image_url), '') FROM public.locations AS l WHERE l.id = k.id)
      WHEN 'organizer' THEN (
        SELECT coalesce(nullif(btrim(o.logo_url), ''), nullif(btrim(o.icon_url), ''))
        FROM public.organizers AS o
        WHERE o.id = k.id
      )
    END,
    CASE k.sorte WHEN 'location' THEN (
      SELECT ci.label
      FROM public.locations AS l
      JOIN public.cities AS ci ON ci.id = l.city_id
      WHERE l.id = k.id
    ) END
  FROM classes AS k
  WHERE k.rang <= greatest(1, least(coalesce(app_search_names.max_results, 10), 50))
  ORDER BY
    CASE k.sorte WHEN 'category' THEN 1 WHEN 'tag' THEN 2 WHEN 'location' THEN 3 ELSE 4 END,
    k.rang
$$;

COMMENT ON FUNCTION public.app_search_names(text, uuid[], timestamp, integer, text, numeric) IS
  'Recherche de l''app : catégories, tags, lieux et organisateurs dont le nom correspond à la requête (règles d''app_search), avec leur nombre d''événements à venir (comptes d''app_category_counts, app_tag_counts, app_organizer_counts) ; au moins un ; max_results au plus de chaque sorte (1 à 50, 10 par défaut).';

GRANT EXECUTE ON FUNCTION public.app_search_names(text, uuid[], timestamp, integer, text, numeric) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.app_see_also(uuid, uuid[], timestamp, integer);

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
    SELECT e.id, e.date, e.location_id, e.title
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
    SELECT li.source, a.id, a.date, coalesce(se.series_id, a.id) AS serie
    FROM liens AS li
    JOIN a_venir AS a ON a.id = li.event_id
    LEFT JOIN series AS se ON se.event_id = a.id
  ),
  -- La source retenue : la première qui a une autre série que celle de la fiche.
  source AS MATERIALIZED (
    SELECT s.sorte, s.id, coalesce(l.name, o.name) AS nom, k.total
    FROM candidates AS s
    CROSS JOIN serie_courante AS sc
    CROSS JOIN LATERAL (
      SELECT
        count(*) AS total,
        count(DISTINCT x.serie) FILTER (WHERE x.serie <> sc.serie) AS autres
      FROM evenements_sources AS x
      WHERE x.source = s.id
    ) AS k
    LEFT JOIN public.locations AS l ON s.sorte = 'location' AND l.id = s.id
    LEFT JOIN public.organizers AS o ON s.sorte = 'organizer' AND o.id = s.id
    WHERE k.autres > 0
    ORDER BY s.priorite, k.autres DESC, coalesce(l.name, o.name), s.id
    LIMIT 1
  ),
  -- « Aussi à » : la première date de chaque série de la source, sauf celle de la fiche.
  rangee_lieu AS MATERIALIZED (
    SELECT p.id, p.serie, row_number() OVER (ORDER BY p.date, p.id) AS ordre
    FROM (
      SELECT DISTINCT ON (x.serie) x.id, x.date, x.serie
      FROM source AS s
      JOIN evenements_sources AS x ON x.source = s.id
      CROSS JOIN serie_courante AS sc
      WHERE x.serie <> sc.serie
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
    SELECT e.id, e.date, e.end_date, nullif(btrim(e.category), '') AS categorie, e.tag_ids
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
    -- Ni la série de la fiche (l'événement compris), ni celles de la rangée « Aussi à ».
    WHERE n.serie <> sc.serie
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
  'Fiche de l''app, « À voir aussi » : section place, les prochains événements du lieu de l''événement (ceux de sa page), à défaut de l''organisateur qui en a le plus, par date, avec la source (source_kind, source_id, source_name, source_events_count) ; section genre, ceux de la même catégorie ou d''un tag commun, à 7 jours au plus de sa date, dans le périmètre city_ids, sans ceux de la première rangée, les plus proches retenus puis rendus par date. À venir (app_events_in_range), une ligne par série (app_event_series ; un événement seul est la sienne), sans la série de la fiche ; max_results par rangée (1 à 20, 3 par défaut) ; rank pour l''ordre. Appel : rpc/app_see_also?select=section,rank,…,event:events(…)&order=rank. Règle complète : migrations 20261021110000 et 20261021170000.';

GRANT EXECUTE ON FUNCTION public.app_see_also(uuid, uuid[], timestamp, integer, text, numeric) TO anon, authenticated;

-- L'accueil « Toutes les dates » et « À la une » : app_events() dans la zone, les filtres PostgREST
-- (dates, is_featured, select, order) par-dessus comme sur app_events(). Sans zone : app_events().
CREATE OR REPLACE FUNCTION public.app_events_in_zone(
  zone_city text DEFAULT NULL,
  zone_km numeric DEFAULT NULL
)
RETURNS SETOF public.events
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT e.*
  FROM (
    SELECT z.city_ids AS zone_villes, z.center_lat AS zone_lat, z.center_lng AS zone_lng, z.radius_km AS zone_km
    FROM (SELECT) AS un
    LEFT JOIN LATERAL public.app_zone(app_events_in_zone.zone_city, app_events_in_zone.zone_km) AS z ON true
    OFFSET 0
  ) AS b
  CROSS JOIN public.app_events() AS e
  LEFT JOIN public.locations AS l ON l.id = e.location_id
  WHERE public.app_in_zone(
    coalesce(e.city_id, l.city_id),
    coalesce(l.latitude, e.latitude),
    coalesce(l.longitude, e.longitude),
    b.zone_villes,
    b.zone_lat,
    b.zone_lng,
    b.zone_km
  )
$$;

COMMENT ON FUNCTION public.app_events_in_zone(text, numeric) IS
  'Événements de app_events() dans la zone de l''app (zone_city, zone_km ; règle app_in_zone) : l''accueil « Toutes les dates » et « À la une », avec les filtres PostgREST par-dessus. Sans zone ou ville inconnue : tous. Migration 20261021220000.';

GRANT EXECUTE ON FUNCTION public.app_events_in_zone(text, numeric) TO anon, authenticated;

-- Les grands événements de la zone : leur ville, leur centre sur la carte, l'un de leurs lieux, ou l'un de
-- leurs événements visibles dans l'app. La RLS de major_events s'applique (approuvés pour tous) ; l'app
-- filtre le statut et l'ordre par-dessus.
CREATE OR REPLACE FUNCTION public.app_major_events_in_zone(
  zone_city text DEFAULT NULL,
  zone_km numeric DEFAULT NULL
)
RETURNS SETOF public.major_events
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT m.*
  FROM (
    SELECT z.city_ids AS zone_villes, z.center_lat AS zone_lat, z.center_lng AS zone_lng, z.radius_km AS zone_km
    FROM (SELECT) AS un
    LEFT JOIN LATERAL public.app_zone(app_major_events_in_zone.zone_city, app_major_events_in_zone.zone_km) AS z
      ON true
    OFFSET 0
  ) AS b
  CROSS JOIN public.major_events AS m
  WHERE public.app_in_zone(
      m.city_id, m.map_center_latitude, m.map_center_longitude, b.zone_villes, b.zone_lat, b.zone_lng, b.zone_km
    )
    OR EXISTS (
      SELECT 1
      FROM public.major_event_locations AS ml
      JOIN public.locations AS l ON l.id = ml.location_id
      WHERE ml.major_event_id = m.id
        AND public.app_in_zone(l.city_id, l.latitude, l.longitude, b.zone_villes, b.zone_lat, b.zone_lng, b.zone_km)
    )
    OR EXISTS (
      SELECT 1
      FROM public.major_event_events AS me
      JOIN public.app_events() AS e ON e.id = me.event_id
      LEFT JOIN public.locations AS l ON l.id = e.location_id
      WHERE me.major_event_id = m.id
        AND public.app_in_zone(
          coalesce(e.city_id, l.city_id),
          coalesce(l.latitude, e.latitude),
          coalesce(l.longitude, e.longitude),
          b.zone_villes,
          b.zone_lat,
          b.zone_lng,
          b.zone_km
        )
    )
$$;

COMMENT ON FUNCTION public.app_major_events_in_zone(text, numeric) IS
  'Grands événements dans la zone de l''app (règle app_in_zone) : leur ville ou leur centre sur la carte, l''un de leurs lieux, ou l''un de leurs événements visibles dans l''app. Sans zone ou ville inconnue : tous. Migration 20261021220000.';

GRANT EXECUTE ON FUNCTION public.app_major_events_in_zone(text, numeric) TO anon, authenticated;

-- L'écran « Ville et rayon » : pour chaque rayon de radii (10 au plus), les événements à venir de la zone,
-- comptés comme l'accueil sur « Tout » : app_events_in_range à partir d'aujourd'hui 0 h (heure de Paris, ou
-- at_time), sans ceux retirés de l'accueil (hide_from_home). Dans l'ordre de radii.
CREATE OR REPLACE FUNCTION public.app_zone_counts(
  zone_city text,
  radii numeric[] DEFAULT ARRAY[5, 10, 25, 50]::numeric[],
  at_time timestamp DEFAULT NULL
)
RETURNS TABLE (
  radius_km numeric,
  events_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    r.km,
    (
      SELECT count(*)::integer
      FROM public.app_events_in_range(
        date_trunc('day', coalesce(app_zone_counts.at_time, now() AT TIME ZONE 'Europe/Paris')),
        NULL,
        NULL,
        NULL,
        app_zone_counts.at_time,
        zone_city => app_zone_counts.zone_city,
        zone_km => r.km
      ) AS e
      WHERE NOT e.hide_from_home
    )
  FROM (
    SELECT x.km, x.ordre
    FROM unnest(coalesce(app_zone_counts.radii, '{}'::numeric[])) WITH ORDINALITY AS x(km, ordre)
    WHERE x.km IS NOT NULL
    ORDER BY x.ordre
    LIMIT 10
  ) AS r
  ORDER BY r.ordre
$$;

COMMENT ON FUNCTION public.app_zone_counts(text, numeric[], timestamp) IS
  'Écran « Ville et rayon » de l''app : pour chaque rayon de radii (10 au plus, dans l''ordre), le nombre d''événements à venir de la zone (zone_city, rayon) comme l''accueil sur « Tout » : app_events_in_range à partir d''aujourd''hui (heure de Paris, ou at_time), sans hide_from_home. Migration 20261021220000.';

GRANT EXECUTE ON FUNCTION public.app_zone_counts(text, numeric[], timestamp) TO anon, authenticated;

-- Les villes de l'app (migration 20261018200000) : le même regroupement (app_city_groups), une colonne slug,
-- les événements à venir comptés par app_events_in_range (à partir d'aujourd'hui, heure de Paris : la règle
-- de l'accueil et des comptes ; sans hide_from_home), les récents comme avant (commencés dans les 120 derniers
-- jours, ni à venir). Seules les villes qui ont un centre et des événements, à venir ou récents. La forme de
-- la réponse ne change que par slug, et at_time (pour les tests) a une valeur par défaut : les versions
-- installées de l'app l'appellent et la lisent comme avant.
DROP FUNCTION IF EXISTS public.app_cities();

CREATE OR REPLACE FUNCTION public.app_cities(at_time timestamp DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  slug text,
  label text,
  center_lat double precision,
  center_lng double precision,
  search_aliases text[],
  source_ids uuid[],
  upcoming_events_count integer,
  recent_events_count integer,
  next_event_date timestamptz,
  last_event_date timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH groupes AS (
    SELECT g.*
    FROM public.app_city_groups() AS g
  ),
  -- events.date est l'heure de Paris étiquetée UTC : les bornes aussi.
  bornes AS (
    SELECT
      date_trunc('day', coalesce(app_cities.at_time, now() AT TIME ZONE 'Europe/Paris')) AS aujourdhui,
      coalesce(app_cities.at_time, now() AT TIME ZONE 'Europe/Paris') AS maintenant
  ),
  a_venir AS (
    SELECT e.id, coalesce(e.city_id, l.city_id) AS city_id, e.date
    FROM bornes AS b
    CROSS JOIN LATERAL public.app_events_in_range(b.aujourdhui, NULL, NULL, NULL, app_cities.at_time) AS e
    LEFT JOIN public.locations AS l ON l.id = e.location_id
    WHERE NOT e.hide_from_home
  ),
  recents AS (
    SELECT coalesce(e.city_id, l.city_id) AS city_id, e.date
    FROM bornes AS b
    CROSS JOIN public.app_events() AS e
    LEFT JOIN public.locations AS l ON l.id = e.location_id
    WHERE e.date >= (b.aujourdhui - interval '120 days') AT TIME ZONE 'UTC'
      AND e.date < b.maintenant AT TIME ZONE 'UTC'
      AND NOT EXISTS (SELECT 1 FROM a_venir AS a WHERE a.id = e.id)
  ),
  activite AS (
    SELECT
      g.group_key,
      (SELECT count(*) FROM a_venir AS a WHERE a.city_id = ANY (g.source_ids)) AS a_venir,
      (SELECT min(a.date) FROM a_venir AS a WHERE a.city_id = ANY (g.source_ids)) AS prochain,
      (SELECT count(*) FROM recents AS r WHERE r.city_id = ANY (g.source_ids)) AS recents,
      (SELECT max(r.date) FROM recents AS r WHERE r.city_id = ANY (g.source_ids)) AS dernier
    FROM groupes AS g
  )
  SELECT
    g.id,
    g.slug,
    g.label,
    g.center_lat,
    g.center_lng,
    g.search_aliases,
    g.source_ids,
    act.a_venir::integer,
    act.recents::integer,
    act.prochain,
    act.dernier
  FROM groupes AS g
  JOIN activite AS act ON act.group_key = g.group_key
  WHERE g.center_lat IS NOT NULL
    AND g.center_lng IS NOT NULL
    AND (act.a_venir > 0 OR act.recents > 0)
  ORDER BY g.label, g.id
$$;

COMMENT ON FUNCTION public.app_cities(timestamp) IS
  'Villes proposées dans l''app (app_city_groups : cities actives regroupées par libellé d''affichage) qui ont un centre et des événements : à venir (app_events_in_range à partir d''aujourd''hui, heure de Paris, sans hide_from_home), récents (commencés dans les 120 derniers jours), prochaine et dernière date ; slug de la représentante, pour la zone (app_zone). « Aujourd''hui » : heure de Paris, ou at_time. Migrations 20261018200000 et 20261021220000.';

GRANT EXECUTE ON FUNCTION public.app_cities(timestamp) TO anon, authenticated;

-- Vérification (SQL Editor) :
-- select label, slug, upcoming_events_count, recent_events_count from public.app_cities();
-- select * from public.app_zone_counts('orleans');
-- select count(*) from public.app_events_in_zone('orleans', 5) where date >= now();

-- Rollback : recréer les fonctions des migrations citées en tête (leurs anciennes signatures), puis
-- DROP FUNCTION IF EXISTS public.app_zone_counts(text, numeric[], timestamp);
-- DROP FUNCTION IF EXISTS public.app_major_events_in_zone(text, numeric);
-- DROP FUNCTION IF EXISTS public.app_events_in_zone(text, numeric);
-- DROP FUNCTION IF EXISTS public.app_in_zone(uuid, numeric, numeric, uuid[], double precision, double precision, double precision);
-- DROP FUNCTION IF EXISTS public.app_zone(text, numeric);
-- DROP FUNCTION IF EXISTS public.app_city_groups();
-- DROP FUNCTION IF EXISTS public.app_distance_km(double precision, double precision, double precision, double precision);
