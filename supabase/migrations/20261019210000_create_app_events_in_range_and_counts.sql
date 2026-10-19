-- Calendrier « Quand ? » de l'app : événements d'une plage et comptes par plage, une seule définition.
--
-- Refonte de l'app (../live/docs/MAQUETTES_REFONTE.md, « Calendrier ») : le calendrier remplace la
-- feuille de périodes. Il affiche, pour chaque jour, des points de densité et, pour chaque raccourci
-- (Ce soir, Demain, Ce week-end, Semaine prochaine, Vacances…), un nombre d'événements ; ces comptes
-- viennent d'ici, pas d'un calcul en Dart. Contrat pour l'app : docs/API_APP.md.
--
-- - app_event_in_range(event_date, event_end_date, range_start, range_end) : les règles 1 et 2
--   ci-dessous (appartenance d'un événement à une plage, sans « terminé »), partagées par les deux
--   fonctions suivantes ;
-- - app_events_in_range(range_start, range_end, city_ids, category, at_time) : les lignes de
--   app_events() qui appartiennent à la plage [range_start, range_end), dans le périmètre et la
--   catégorie demandés, sans ce que l'utilisateur a masqué ni les auteurs qu'il a bloqués.
--   `setof public.events` comme app_events() : l'app y garde son select, ses jointures (locations…),
--   son tri et sa pagination.
-- - app_event_counts(ranges, city_ids, category, at_time) : pour chaque plage de `ranges`, le nombre
--   de ces événements (events_count) et le nombre de ceux qui y commencent (starting_count).
--
-- Dates : events.date et end_date contiennent l'heure de Paris étiquetée UTC (docs/API_APP.md,
-- conventions). Les bornes reçues sont des `timestamp` sans fuseau, cette heure de Paris : un
-- décalage envoyé avec la date (« Z », « +02:00 ») est ignoré par Postgres. « Maintenant » est l'heure
-- de Paris (now() AT TIME ZONE 'Europe/Paris'), ou `at_time` s'il est fourni (tests, scénarios).
--
-- Règle d'appartenance d'un événement à une plage [début, fin), reprise de la liste de l'accueil de
-- l'app (lib/services/event_service.dart, _getApprovedEventsFromNetwork : événements qui commencent
-- dans la plage, plus ceux « en cours » de plus de 12 h ; puis le filtre de période de
-- EventsListLogic.getFilteredEvents) :
-- 1. il commence dans la plage : début <= date < fin ;
-- 2. ou il dure plus de 12 h et il a commencé avant la plage sans être fini à son début :
--    date < début < end_date. « Plus de 12 h » au sens de l'app (`Duration.inHours > 12`, en heures
--    entières, dans EventDateLine et la requête des événements en cours) : end_date - date >= 13 h.
--    Un événement plus court qui passe minuit (20:30 → 02:30) n'appartient qu'à son jour de début.
--    Un événement sur plusieurs jours compte donc une fois dans chaque plage qu'il chevauche ;
-- 3. et il n'est pas terminé : end_date > maintenant ; sans end_date, il se termine à minuit le soir
--    de son début (« un événement sans heure de fin n'est jamais terminé, il reste affiché toute la
--    journée », décision 1 des maquettes : les événements du jour terminés quittent l'accueil). Ne
--    joue que sur une plage qui contient maintenant (ou passée).
-- Une plage vide ou à l'envers (fin <= début) ne contient rien. Bornes nulles : sans limite.
--
-- Écarts assumés avec l'app actuelle, qui filtre en Dart les événements déjà chargés :
-- - elle compare end_date à l'instant UTC (`DateTime.now().toUtc()`), 1 à 2 h plus tôt que l'heure
--   de Paris des dates en base ; ici, tout est en heure de Paris ;
-- - elle charge au plus 200 événements par plage (limite atteinte sur « Tout ») et fusionne son
--   cache : sa liste peut montrer moins (ou, par le cache, un événement de la veille qui passe
--   minuit). Ces fonctions portent sur toute la base ;
-- - elle filtre encore en Dart au rayon autour des villes choisies (CityEventMatching), non repris :
--   le périmètre est celui envoyé au serveur (city_ids).
--
-- Périmètre : city_ids = les ids envoyés par l'app (`effectiveCityIds`, comme son filtre
-- `city_id=in.(…)`), comparés à events.city_id, à défaut à la ville du lieu (comme app_cities()).
-- Null ou vide : toutes les villes.
-- Catégorie : son id ou son nom (insensible à la casse), comme l'app, qui compare events.category
-- (un id ou, pour quelques lignes anciennes, un nom) au nom de la catégorie choisie. Null : toutes.
-- Par utilisateur (auth.uid(), rien pour un appel sans session) : sans ses événements masqués
-- (user_hidden_events) ni ceux des auteurs qu'il a bloqués (blocked_users), comme les filtres Dart
-- de l'accueil (EventHideService, BlockedUserService).
-- Comptes seulement : sur « Tout » (category nulle), sans les événements retirés de l'accueil
-- (hide_from_home), comme l'accueil ; la liste les filtre elle-même (`hide_from_home=is.false`).
--
-- `language sql`, `stable`, `security invoker`, sans clause SET, comme app_events() : la RLS de
-- l'appelant s'applique (events, locations, categories, user_hidden_events, blocked_users) et
-- Postgres peut « inliner » app_events_in_range dans la requête de l'app. Tous les objets sont
-- qualifiés par leur schéma. Prérequis : 20261017120000_create_app_events_function.sql (app_events()),
-- 20260324100000_create_content_reports_and_blocked_users.sql (blocked_users),
-- 20260322110000_create_cities_and_link_locations.sql (locations.city_id) et
-- 20260322150000_add_city_id_to_events.sql (events.city_id).

CREATE OR REPLACE FUNCTION public.app_event_in_range(
  event_date timestamptz,
  event_end_date timestamptz,
  range_start timestamptz,
  range_end timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  -- Règles 1 et 2, quand début < fin : il commence avant la fin de la plage ; il commence dans la
  -- plage, ou bien il finit après son début et dure 13 h ou plus. Écrites en conditions séparées
  -- pour que Postgres borne date par son index même sous la RLS : seules des comparaisons de dates
  -- (opérateurs « leakproof ») passent avant les politiques de events, la soustraction vient après.
  -- Null (et non faux) quand end_date est null hors de la règle 1 : un WHERE ou un ON l'écarte de
  -- même (un coalesce cacherait les comparaisons à l'index).
  SELECT range_start < range_end
    AND event_date < range_end
    AND (event_date >= range_start OR event_end_date > range_start)
    AND (event_date >= range_start OR event_end_date - event_date >= interval '13 hours')
$$;

COMMENT ON FUNCTION public.app_event_in_range(timestamptz, timestamptz, timestamptz, timestamptz) IS
  'Vrai si l''événement (date, end_date) appartient à la plage [range_start, range_end) : il y commence, ou dure 13 h ou plus et a commencé avant sans être fini au début de la plage (faux ou null sinon). Dates en heure de Paris étiquetée UTC. Règle des fonctions du calendrier de l''app (migration 20261019210000).';

GRANT EXECUTE ON FUNCTION public.app_event_in_range(timestamptz, timestamptz, timestamptz, timestamptz)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_events_in_range(
  range_start timestamp,
  range_end timestamp DEFAULT NULL,
  city_ids uuid[] DEFAULT NULL,
  category text DEFAULT NULL,
  at_time timestamp DEFAULT NULL
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
      nullif(btrim(app_events_in_range.category), '') AS categorie
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
    -- Périmètre : ville de l'événement, à défaut celle de son lieu.
    AND (
      app_events_in_range.city_ids IS NULL
      OR cardinality(app_events_in_range.city_ids) = 0
      OR coalesce(e.city_id, l.city_id) = ANY (app_events_in_range.city_ids)
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

COMMENT ON FUNCTION public.app_events_in_range(timestamp, timestamp, uuid[], text, timestamp) IS
  'Événements de app_events() dans la plage [range_start, range_end) (heure de Paris) : commencent dans la plage, ou durent plus de 12 h et ont commencé avant ; pas terminés. Périmètre (city_ids, à défaut la ville du lieu), catégorie (id ou nom), sans les événements masqués par l''utilisateur ni ceux des auteurs bloqués. Règle complète : migration 20261019210000.';

GRANT EXECUTE ON FUNCTION public.app_events_in_range(timestamp, timestamp, uuid[], text, timestamp)
  TO anon, authenticated;

-- Comptes du calendrier. `ranges` : tableau JSON de plages {"start": …, "end": …, "key": …}, dans
-- l'ordre voulu (au plus 500, les suivantes sont ignorées). Une ligne par plage, dans le même ordre,
-- même vide :
-- - range_index : position de la plage dans `ranges`, à partir de 0 ; range_key : sa clé (texte
--   libre de l'app, null sans clé) ; range_start / range_end : ses bornes lues ;
-- - events_count : événements de la plage selon app_events_in_range (ce que la liste montrera pour
--   cette plage), chacun compté une fois, sans hide_from_home sur « Tout » ;
-- - starting_count : ceux d'entre eux qui commencent dans la plage (sans les événements de plus de
--   12 h commencés avant). Ce sont les comptes des maquettes : une exposition de plusieurs mois
--   ajoute 1 à events_count chaque jour, pas à starting_count.
CREATE OR REPLACE FUNCTION public.app_event_counts(
  ranges jsonb,
  city_ids uuid[] DEFAULT NULL,
  category text DEFAULT NULL,
  at_time timestamp DEFAULT NULL
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
      app_event_counts.at_time
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

COMMENT ON FUNCTION public.app_event_counts(jsonb, uuid[], text, timestamp) IS
  'Comptes du calendrier de l''app : pour chaque plage {start, end, key} de ranges (heure de Paris), events_count (événements de app_events_in_range, une fois chacun ; sans hide_from_home sur « Tout ») et starting_count (ceux qui commencent dans la plage).';

GRANT EXECUTE ON FUNCTION public.app_event_counts(jsonb, uuid[], text, timestamp) TO anon, authenticated;

-- Vérification (SQL Editor) : les sept prochains jours, sur toutes les villes.
-- select range_key, events_count, starting_count
-- from public.app_event_counts((
--   select jsonb_agg(jsonb_build_object('key', d::date, 'start', d, 'end', d + interval '1 day') order by d)
--   from generate_series(date_trunc('day', now() at time zone 'Europe/Paris'),
--                        date_trunc('day', now() at time zone 'Europe/Paris') + interval '6 days',
--                        interval '1 day') as d
-- ));

-- Rollback :
-- DROP FUNCTION IF EXISTS public.app_event_counts(jsonb, uuid[], text, timestamp);
-- DROP FUNCTION IF EXISTS public.app_events_in_range(timestamp, timestamp, uuid[], text, timestamp);
-- DROP FUNCTION IF EXISTS public.app_event_in_range(timestamptz, timestamptz, timestamptz, timestamptz);
