-- Recherche de l'app : catégories et tags populaires avec leur nombre d'événements à venir.
--
-- Refonte de l'app (../live/docs/MAQUETTES_REFONTE.md, « Recherche ») : des tuiles de catégories
-- (« Spectacle, 205 à venir ») et des tags populaires (« #Théâtre 73 »), dans le périmètre de
-- l'utilisateur ; toucher un tag ouvre ses événements. Ces comptes viennent d'ici, pas d'un calcul en
-- Dart. Contrat pour l'app : docs/API_APP.md.
--
-- « À venir » = app_events_in_range(aujourd'hui 0 h, sans fin, city_ids) : commence aujourd'hui ou
-- après, ou dure plus de 12 h et n'est pas fini ; pas terminé (règle complète et périmètre :
-- 20261019210000_create_app_events_in_range_and_counts.sql). « Aujourd'hui » et « maintenant » sont
-- l'heure de Paris, ou `at_time` s'il est fourni. Sans les événements masqués par l'utilisateur ni
-- ceux des auteurs qu'il a bloqués ; avec ceux retirés de l'accueil (hide_from_home) : la recherche
-- n'est pas l'accueil.
--
-- - app_category_counts(city_ids, at_time) : une ligne par catégorie active, même sans événement,
--   la plus fournie d'abord. events.category contient un id de catégorie ou, pour quelques lignes
--   anciennes, son nom : les deux comptent (comme le filtre de catégorie de l'app). Un événement
--   d'une catégorie inactive ou inconnue ne compte nulle part.
-- - app_tag_counts(city_ids, max_tags, at_time) : les tags d'au moins un événement à venir, le plus
--   fourni d'abord (à égalité, par nom), max_tags au plus (20 par défaut, entre 1 et 100).
--
-- Recherche par tag : rpc/app_events_in_range (range_start = aujourd'hui) avec le filtre PostgREST
-- `tag_ids=cs.{<id du tag>}` (docs/API_APP.md). Pas d'index GIN sur events.tag_ids : sous la RLS,
-- Postgres évalue `@>` (fonction arraycontains, non « leakproof ») après les politiques de events et
-- n'utilise pas un tel index pour l'app (vérifié : il ne sert qu'à une requête qui passe outre la
-- RLS). La requête passe par idx_events_approved_visible_date.
--
-- `language sql`, `stable`, `security invoker`, sans clause SET, comme app_events() ; tous les objets
-- sont qualifiés. Prérequis : 20261019210000_create_app_events_in_range_and_counts.sql.

CREATE OR REPLACE FUNCTION public.app_category_counts(
  city_ids uuid[] DEFAULT NULL,
  at_time timestamp DEFAULT NULL
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
      app_category_counts.at_time
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

COMMENT ON FUNCTION public.app_category_counts(uuid[], timestamp) IS
  'Recherche de l''app : catégories actives et leur nombre d''événements à venir (app_events_in_range à partir d''aujourd''hui, heure de Paris) dans le périmètre city_ids, la plus fournie d''abord.';

GRANT EXECUTE ON FUNCTION public.app_category_counts(uuid[], timestamp) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_tag_counts(
  city_ids uuid[] DEFAULT NULL,
  max_tags integer DEFAULT 20,
  at_time timestamp DEFAULT NULL
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
    app_tag_counts.at_time
  ) AS e
  CROSS JOIN LATERAL unnest(e.tag_ids) AS x(tag_id)
  JOIN public.tags AS t ON t.id = x.tag_id
  GROUP BY t.id, t.name
  ORDER BY count(DISTINCT e.id) DESC, t.name
  LIMIT greatest(1, least(coalesce(app_tag_counts.max_tags, 20), 100))
$$;

COMMENT ON FUNCTION public.app_tag_counts(uuid[], integer, timestamp) IS
  'Recherche de l''app : tags populaires, avec leur nombre d''événements à venir (app_events_in_range à partir d''aujourd''hui, heure de Paris) dans le périmètre city_ids, le plus fourni d''abord ; max_tags au plus (1 à 100, 20 par défaut).';

GRANT EXECUTE ON FUNCTION public.app_tag_counts(uuid[], integer, timestamp) TO anon, authenticated;

-- Vérification (SQL Editor) :
-- select name, events_count from public.app_category_counts();
-- select name, events_count from public.app_tag_counts(max_tags => 6);

-- Rollback :
-- DROP FUNCTION IF EXISTS public.app_tag_counts(uuid[], integer, timestamp);
-- DROP FUNCTION IF EXISTS public.app_category_counts(uuid[], timestamp);
