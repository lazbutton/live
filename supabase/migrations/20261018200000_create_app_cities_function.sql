-- Villes proposées dans l'app publique, avec leur activité : une seule définition.
--
-- L'app Flutter lit `supabase.rpc('app_cities', get: true)` (choix des villes dans les
-- réglages, suggestions, recherche) au lieu de recalculer en Dart, à partir de `cities` et
-- des lignes de `app_events()`, les regroupements et les comptes ci-dessous.
--
-- Prérequis : 20261017120000_create_app_events_function.sql (app_events()) et
-- 20260322123000_fix_city_extraction_and_cleanup_existing_cities.sql
-- (extract_city_label_from_address, normalize_city_label : les règles qui ont créé les villes).
--
-- Une ligne par ville affichée :
-- - Villes : `cities` actives, regroupées par libellé d'affichage
--   (extract_city_label_from_address : « 45000 Orléans » → « Orléans ») comparé normalisé
--   (normalize_city_label). Dans un groupe, les villes sont prises dans l'ordre de `label`.
--   - id : la première ville au libellé déjà propre (sans chiffre, et égal au libellé
--     d'affichage une fois normalisé), sinon la première ville ;
--   - label : le libellé d'affichage de la première ville ;
--   - center_lat / center_lng : moyenne des centres renseignés (latitude et longitude) ;
--   - search_aliases : les libellés bruts qui diffèrent du libellé d'affichage normalisé ;
--   - source_ids : toutes les villes du groupe (l'app y rattache une ville enregistrée).
-- - Activité : événements de app_events() (donc visibles dans l'app) qui commencent entre
--   aujourd'hui - 120 jours et aujourd'hui + 365 jours, rattachés à events.city_id, à défaut
--   à la ville de leur lieu. « Aujourd'hui » = minuit UTC, comme l'ancien calcul de l'app.
--   - à venir : commence aujourd'hui ou après, ou n'est pas encore fini (end_date > now()) ;
--     next_event_date = le plus petit début ;
--   - récents : les autres ; last_event_date = le plus grand début.
--
-- `security invoker` : la RLS de l'appelant s'applique à cities, events et locations, comme
-- aux deux requêtes de l'app que la fonction remplace. Pas de clause SET (comme app_events()) :
-- tous les objets sont qualifiés par leur schéma.

CREATE OR REPLACE FUNCTION public.app_cities()
RETURNS TABLE (
  id uuid,
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
  WITH villes AS (
    SELECT *
    FROM (
      SELECT
        c.id,
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
  ),
  bornes AS (
    SELECT
      now() AS maintenant,
      j.jour AT TIME ZONE 'UTC' AS aujourdhui,
      (j.jour - interval '120 days') AT TIME ZONE 'UTC' AS debut,
      (j.jour + interval '365 days') AT TIME ZONE 'UTC' AS fin
    FROM (SELECT date_trunc('day', now() AT TIME ZONE 'UTC') AS jour) AS j
  ),
  evenements AS (
    SELECT
      coalesce(e.city_id, l.city_id) AS city_id,
      e.date,
      e.date >= b.aujourdhui
        OR (e.end_date IS NOT NULL AND e.end_date > b.maintenant) AS a_venir
    FROM public.app_events() AS e
    LEFT JOIN public.locations AS l ON l.id = e.location_id
    CROSS JOIN bornes AS b
    WHERE e.date >= b.debut
      AND e.date <= b.fin
  ),
  activite AS (
    SELECT
      v.cle,
      count(*) FILTER (WHERE ev.a_venir) AS a_venir,
      count(*) FILTER (WHERE NOT ev.a_venir) AS recents,
      min(ev.date) FILTER (WHERE ev.a_venir) AS prochain,
      max(ev.date) FILTER (WHERE NOT ev.a_venir) AS dernier
    FROM evenements AS ev
    JOIN villes AS v ON v.id = ev.city_id
    GROUP BY v.cle
  )
  SELECT
    g.id,
    g.libelle AS label,
    g.center_lat::double precision AS center_lat,
    g.center_lng::double precision AS center_lng,
    coalesce(a.search_aliases, '{}'::text[]) AS search_aliases,
    g.source_ids,
    coalesce(act.a_venir, 0)::integer AS upcoming_events_count,
    coalesce(act.recents, 0)::integer AS recent_events_count,
    act.prochain AS next_event_date,
    act.dernier AS last_event_date
  FROM groupes AS g
  LEFT JOIN alias AS a ON a.cle = g.cle
  LEFT JOIN activite AS act ON act.cle = g.cle
  ORDER BY g.libelle, g.id
$$;

COMMENT ON FUNCTION public.app_cities() IS
  'Villes proposées dans l''app (cities actives regroupées par libellé d''affichage) et leur activité d''après app_events() : événements à venir / récents, prochaine et dernière date. Seule source de ce calcul pour l''app Flutter.';

GRANT EXECUTE ON FUNCTION public.app_cities() TO anon, authenticated;

-- Vérification (SQL Editor) : une ligne par ville active, comptes cohérents avec app_events().
-- select label, upcoming_events_count, recent_events_count, next_event_date, last_event_date
-- from public.app_cities();

-- Rollback :
-- DROP FUNCTION IF EXISTS public.app_cities();
