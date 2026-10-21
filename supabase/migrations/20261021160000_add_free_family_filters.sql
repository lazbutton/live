-- « Gratuit » et « En famille » : deux filtres de l'app, comptés et appliqués en SQL (U5).
--
-- Améliorations de l'app (../live/docs/AMELIORATIONS.md, U5 ; planches du lot 3 dans
-- ../live/docs/MAQUETTES_REFONTE.md) : deux tuiles en tête des catégories de la recherche
-- (« Gratuit · 20 à venir », « En famille · 27 à venir ») et l'accueil filtré, avec « 20 événements
-- gratuits à venir. ». Les deux règles vivent ici, pas en Dart :
-- - gratuit : events.price_kind = 'free' (tous les prix connus à 0 ; colonne générée, migration
--   20261020100000) ;
-- - en famille : events.is_young_audience, ou le tag « Jeune Public » (décision du 2026-10-21 : le tag
--   faisait doublon avec la case ; le 2026-10-21, les 24 événements à venir qui l'ont ont aussi la
--   case, 43 en tout). Le tag est reconnu par son nom (casse et espaces ignorés), pas par son id, que
--   l'app ne connaît pas. Aucune donnée n'est écrite.
--
-- - app_events_in_range(…, free, family) : deux paramètres de plus, faux par défaut ; vrais, ils ne
--   gardent que les événements gratuits, ou en famille. Les appels existants (cinq arguments au plus :
--   app_event_counts, app_category_counts, app_tag_counts, app_organizer_counts, app_search,
--   app_see_also, suivis) ne changent pas ;
-- - app_event_counts(…, free, family) : les mêmes, transmis à app_events_in_range ; l'accueil filtré, la
--   feuille « Quand ? » sur l'accueil filtré et les tuiles de la recherche comptent avec eux (une plage
--   à partir d'aujourd'hui, sans fin, category nulle : comme l'accueil, sans hide_from_home ; la tuile
--   compte donc ce que l'accueil filtré montre).
--
-- Changer la liste des paramètres change la signature : l'ancienne fonction est supprimée avant de créer
-- la nouvelle (deux versions feraient hésiter PostgREST, PGRST203). Les fonctions `language sql` qui
-- l'appellent n'en dépendent pas pour Postgres (corps en texte) : elles appellent la nouvelle, leurs
-- arguments manquants prenant les valeurs par défaut. À appliquer d'un bloc (`psql --single-transaction`,
-- ou un seul envoi dans le SQL Editor) : entre la suppression et la création, l'app n'aurait plus de
-- fonction. Pas de BEGIN ni de COMMIT ici : une répétition dans une transaction annulée reste annulée.
--
-- Les bornes et le tag « Jeune Public » sont calculés une fois, dans la sous-requête `b` (OFFSET 0),
-- comme les bornes de date : les conditions sur events n'y appellent rien de non « leakproof » avant les
-- politiques de la RLS (migration 20261019210000). Prérequis : 20261019210000 (fonctions remplacées),
-- 20261019120000 (is_young_audience), 20261020100000 (price_kind).

DROP FUNCTION IF EXISTS public.app_event_counts(jsonb, uuid[], text, timestamp);
DROP FUNCTION IF EXISTS public.app_events_in_range(timestamp, timestamp, uuid[], text, timestamp);

CREATE OR REPLACE FUNCTION public.app_events_in_range(
  range_start timestamp,
  range_end timestamp DEFAULT NULL,
  city_ids uuid[] DEFAULT NULL,
  category text DEFAULT NULL,
  at_time timestamp DEFAULT NULL,
  free boolean DEFAULT false,
  family boolean DEFAULT false
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
      ) AS jeune_public
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

COMMENT ON FUNCTION public.app_events_in_range(timestamp, timestamp, uuid[], text, timestamp, boolean, boolean) IS
  'Événements de app_events() dans la plage [range_start, range_end) (heure de Paris) : commencent dans la plage, ou durent plus de 12 h et ont commencé avant ; pas terminés. Périmètre (city_ids, à défaut la ville du lieu), catégorie (id ou nom), gratuits seulement (free : price_kind = free), en famille seulement (family : is_young_audience ou le tag « Jeune Public »), sans les événements masqués par l''utilisateur ni ceux des auteurs bloqués. Règles : migrations 20261019210000 et 20261021160000.';

GRANT EXECUTE ON FUNCTION public.app_events_in_range(timestamp, timestamp, uuid[], text, timestamp, boolean, boolean)
  TO anon, authenticated;

-- Comptes du calendrier, et des filtres « Gratuit » et « En famille » : comme avant (20261019210000),
-- avec free et family transmis à app_events_in_range.
CREATE OR REPLACE FUNCTION public.app_event_counts(
  ranges jsonb,
  city_ids uuid[] DEFAULT NULL,
  category text DEFAULT NULL,
  at_time timestamp DEFAULT NULL,
  free boolean DEFAULT false,
  family boolean DEFAULT false
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
      app_event_counts.family
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

COMMENT ON FUNCTION public.app_event_counts(jsonb, uuid[], text, timestamp, boolean, boolean) IS
  'Comptes du calendrier de l''app : pour chaque plage {start, end, key} de ranges (heure de Paris), events_count (événements de app_events_in_range, une fois chacun ; sans hide_from_home sur « Tout ») et starting_count (ceux qui commencent dans la plage). free et family : seulement les gratuits, ou en famille (règles d''app_events_in_range, migration 20261021160000).';

GRANT EXECUTE ON FUNCTION public.app_event_counts(jsonb, uuid[], text, timestamp, boolean, boolean)
  TO anon, authenticated;

-- Vérification (SQL Editor) : gratuits et en famille à venir, toutes villes (l'accueil, sans
-- hide_from_home).
-- select 'gratuits' as filtre, events_count
-- from public.app_event_counts(
--   jsonb_build_array(jsonb_build_object('start', date_trunc('day', now() at time zone 'Europe/Paris'))),
--   free => true)
-- union all
-- select 'en famille', events_count
-- from public.app_event_counts(
--   jsonb_build_array(jsonb_build_object('start', date_trunc('day', now() at time zone 'Europe/Paris'))),
--   family => true);

-- Rollback : recréer les deux fonctions de 20261019210000_create_app_events_in_range_and_counts.sql
-- après :
-- DROP FUNCTION IF EXISTS public.app_event_counts(jsonb, uuid[], text, timestamp, boolean, boolean);
-- DROP FUNCTION IF EXISTS public.app_events_in_range(timestamp, timestamp, uuid[], text, timestamp, boolean, boolean);
