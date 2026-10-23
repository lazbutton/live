-- Festivals : sur « Tout », un festival qui a un programme compte par ses événements, pas sa fiche en plus.
--
-- ../live/docs/FESTIVALS.md (§ 3) et l'accueil de l'app (étape 3, PR lazbutton/live-app#168) : sur « Tout », un
-- festival est une carte, ses événements dedans, et les nombres de la page (« Tout ce soir · N », fins de liste)
-- comptent ses événements, chacun à sa date, sans sa fiche (EventsListPageData.build,
-- lib/features/events/presentation/view_models/events_list_content.dart). Les nombres lus en SQL qui décrivent
-- cette liste disent la même chose (U3) ; ils comptaient la fiche en plus, un de trop chaque jour du festival.
--
-- La règle, celle de l'app : une fiche n'est pas comptée quand l'index des festivals de l'accueil
-- (app_festival_events(at_time), lu par l'app une fois, toutes villes, par utilisateur) a au moins une ligne pour
-- elle, c'est-à-dire un événement à venir rattaché, visible pour l'utilisateur (ni masqué, ni d'un auteur
-- bloqué ; retiré de l'accueil compris). Une fiche sans programme compte comme avant. Seulement sur « Tout » :
-- sur une page de catégorie, rien n'est retiré (la page « Festival » montre les festivals).
--
-- - app_event_counts(…) : sur « Tout » (category vide), ces fiches ne comptent plus, ni dans events_count ni
--   dans starting_count : le calendrier « Quand ? », ses points de densité, ses raccourcis, la suite d'une liste
--   courte, « Élargir ».
-- - app_zone_counts(…) : « Ville et rayon », comptés comme l'accueil sur « Tout ».
-- - app_cities(…) : upcoming_events_count, comme l'accueil sur « Tout » ; la liste des villes (une ville qui n'a
--   que des fiches à venir y reste), la prochaine date et les récents ne changent pas.
--
-- Rien d'autre ne change : les listes (app_events_in_range, app_events_in_zone) gardent la fiche, que l'app
-- place en carte ; les comptes d'une catégorie, d'un tag, d'un lieu ou d'un organisateur, de la recherche, de
-- « À voir aussi » et des suivis (app_category_counts, app_tag_counts, app_organizer_counts, app_search_names,
-- app_see_also, app_follows) décrivent des pages où l'app ne regroupe pas les festivals.
--
-- Coût : app_festival_events est lue une fois par appel (MATERIALIZED), et seulement sur « Tout » pour
-- app_event_counts. Mêmes signatures, mêmes colonnes : CREATE OR REPLACE, rien à changer dans l'app.
-- `language sql`, `stable`, `security invoker`, sans clause SET ; tous les objets sont qualifiés. Prérequis :
-- 20261021220000_create_app_zone.sql (dernières définitions des trois fonctions), 20261023120000_create_festivals.sql
-- (app_festival_events). À appliquer d'un bloc (`psql --single-transaction`) ; pas de BEGIN ni de COMMIT ici.

-- app_event_counts ---------------------------------------------------------------------------------------------
--
-- La définition de 20261021220000 ; sur « Tout », les fiches des festivals qui ont un programme en moins.
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
  -- Les festivals qui ont un programme : l'index de l'accueil (app_festival_events), lu une fois, et
  -- seulement sur « Tout ».
  programmes AS MATERIALIZED (
    SELECT DISTINCT f.festival_id
    FROM public.app_festival_events(app_event_counts.at_time) AS f
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
    -- Sur « Tout », l'accueil n'affiche pas les événements retirés de l'accueil, et un festival qui a un
    -- programme y est une carte : ses événements comptent, chacun à sa date, pas sa fiche en plus.
    WHERE nullif(btrim(app_event_counts.category), '') IS NOT NULL
      OR (
        NOT e.hide_from_home
        AND NOT EXISTS (SELECT 1 FROM programmes AS p WHERE p.festival_id = e.id)
      )
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
  'Comptes du calendrier de l''app : pour chaque plage {start, end, key} de ranges (heure de Paris), events_count (événements de app_events_in_range, une fois chacun ; sur « Tout », sans hide_from_home ni la fiche d''un festival qui a un programme dans app_festival_events : ses événements comptent, pas elle) et starting_count (ceux qui commencent dans la plage). free et family : seulement les gratuits, ou en famille (règles d''app_events_in_range, migration 20261021160000). Migrations 20261021220000 et 20261023170000.';

GRANT EXECUTE ON FUNCTION public.app_event_counts(jsonb, uuid[], text, timestamp, boolean, boolean, text, numeric)
  TO anon, authenticated;

-- app_zone_counts ----------------------------------------------------------------------------------------------
--
-- La définition de 20261021220000 ; les fiches des festivals qui ont un programme en moins, comme sur « Tout ».
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
  -- Les festivals qui ont un programme (app_festival_events), lus une fois pour tous les rayons.
  WITH programmes AS MATERIALIZED (
    SELECT DISTINCT f.festival_id
    FROM public.app_festival_events(app_zone_counts.at_time) AS f
  )
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
        AND NOT EXISTS (SELECT 1 FROM programmes AS p WHERE p.festival_id = e.id)
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
  'Écran « Ville et rayon » de l''app : pour chaque rayon de radii (10 au plus, dans l''ordre), le nombre d''événements à venir de la zone (zone_city, rayon) comme l''accueil sur « Tout » : app_events_in_range à partir d''aujourd''hui (heure de Paris, ou at_time), sans hide_from_home ni la fiche d''un festival qui a un programme dans app_festival_events. Migrations 20261021220000 et 20261023170000.';

GRANT EXECUTE ON FUNCTION public.app_zone_counts(text, numeric[], timestamp) TO anon, authenticated;

-- app_cities ---------------------------------------------------------------------------------------------------
--
-- La définition de 20261021220000 ; upcoming_events_count sans les fiches des festivals qui ont un programme,
-- comme sur « Tout ». Elles restent dans a_venir : une ville qui n'a qu'elles à venir reste dans la liste, et ni
-- la prochaine date ni les récents ne changent.
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
  -- Les festivals qui ont un programme (app_festival_events), lus une fois.
  programmes AS MATERIALIZED (
    SELECT DISTINCT f.festival_id
    FROM public.app_festival_events(app_cities.at_time) AS f
  ),
  a_venir AS (
    SELECT
      e.id,
      coalesce(e.city_id, l.city_id) AS city_id,
      e.date,
      -- Compté comme sur « Tout » : pas la fiche d'un festival qui a un programme.
      NOT EXISTS (SELECT 1 FROM programmes AS p WHERE p.festival_id = e.id) AS compte
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
      (SELECT count(*) FROM a_venir AS a WHERE a.city_id = ANY (g.source_ids) AND a.compte) AS a_venir_comptes,
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
    act.a_venir_comptes::integer,
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
  'Villes proposées dans l''app (app_city_groups : cities actives regroupées par libellé d''affichage) qui ont un centre et des événements : à venir (app_events_in_range à partir d''aujourd''hui, heure de Paris, sans hide_from_home ; upcoming_events_count comme l''accueil sur « Tout », sans la fiche d''un festival qui a un programme dans app_festival_events), récents (commencés dans les 120 derniers jours), prochaine et dernière date ; slug de la représentante, pour la zone (app_zone). « Aujourd''hui » : heure de Paris, ou at_time. Migrations 20261018200000, 20261021220000 et 20261023170000.';

GRANT EXECUTE ON FUNCTION public.app_cities(timestamp) TO anon, authenticated;

-- Vérification (SQL Editor) : la zone d'Orléans à 25 km, sans les fiches des festivals qui ont un programme.
-- select * from public.app_zone_counts('orleans', array[25]);
-- select count(*) from public.app_events_in_range(date_trunc('day', now() at time zone 'Europe/Paris'), null,
--   null, null, null, zone_city => 'orleans', zone_km => 25) as e
-- where not e.hide_from_home and e.id not in (select festival_id from public.app_festival_events());

-- Rollback : recréer app_event_counts, app_zone_counts et app_cities de 20261021220000_create_app_zone.sql.
