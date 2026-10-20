-- Fiche de l'app : nombre d'événements à venir de chaque organisateur, une seule définition.
--
-- Refonte de l'app (../live/docs/MAQUETTES_REFONTE.md, fiche) : sous « Organisé par », chaque
-- organisateur affiche « 40 événements à venir » (décision de l'utilisateur, 2026-10-20). Ce compte
-- vient d'ici, pas d'un calcul en Dart sur les seuls événements chargés. Contrat : docs/API_APP.md.
--
-- app_organizer_counts(organizer_ids, city_ids, at_time) : une ligne par id demandé qui existe.
-- Un organisateur de l'app est une ligne de `organizers`, ou un lieu (`locations`) relié comme
-- organisateur (event_organizers.location_id, lieu `is_organizer`) : les deux sortes d'id sont acceptées.
-- - organisateur (kind = 'organizer') : ses événements par event_organizers.organizer_id ;
-- - lieu (kind = 'location') : les événements qu'il organise (event_organizers.location_id) et ceux qui
--   s'y tiennent (events.location_id), chacun une fois, comme la page d'un lieu dans l'app : un lieu
--   qui organise ses propres soirées ne les compte pas deux fois.
-- « À venir » : app_events_in_range(aujourd'hui 0 h, sans fin, city_ids), comme les comptes de la
-- recherche (20261019212000) : commence aujourd'hui ou après, ou dure plus de 12 h et n'est pas fini ;
-- pas terminé ; heure de Paris, ou `at_time` s'il est fourni. Sans les événements masqués par
-- l'utilisateur ni ceux des auteurs qu'il a bloqués ; avec ceux retirés de l'accueil.
-- city_ids : null ou vide, toutes les villes (la fiche) ; sinon le périmètre de l'app.
-- Ids inconnus ou nuls : pas de ligne ; ids en double : une ligne ; au plus 200 ids par appel.
--
-- `language sql`, `stable`, `security invoker`, sans clause SET, comme app_events() ; la RLS de
-- l'appelant s'applique (events, event_organizers, organizers, locations). Prérequis :
-- 20261019210000_create_app_events_in_range_and_counts.sql (app_events_in_range()).

CREATE OR REPLACE FUNCTION public.app_organizer_counts(
  organizer_ids uuid[],
  city_ids uuid[] DEFAULT NULL,
  at_time timestamp DEFAULT NULL
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
      app_organizer_counts.at_time
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

COMMENT ON FUNCTION public.app_organizer_counts(uuid[], uuid[], timestamp) IS
  'Fiche de l''app : nombre d''événements à venir (app_events_in_range à partir d''aujourd''hui, heure de Paris) de chaque organisateur demandé : organizers par event_organizers.organizer_id ; lieu par event_organizers.location_id et events.location_id, chaque événement une fois.';

GRANT EXECUTE ON FUNCTION public.app_organizer_counts(uuid[], uuid[], timestamp) TO anon, authenticated;

-- Vérification (SQL Editor) : les lieux organisateurs les plus actifs.
-- select l.name, c.events_count
-- from public.app_organizer_counts(array(select id from public.locations where is_organizer)) as c
-- join public.locations as l on l.id = c.organizer_id
-- order by c.events_count desc limit 5;

-- Rollback :
-- DROP FUNCTION IF EXISTS public.app_organizer_counts(uuid[], uuid[], timestamp);
