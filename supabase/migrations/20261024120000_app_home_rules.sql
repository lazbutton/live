-- L'accueil de l'app : ses dernières règles en Dart passent en SQL.
--
-- ../live/docs/fonctionnalites/accueil.md (« Règles », « Ce qui reste ») et ../live/docs/FEUILLE_DE_ROUTE.md (§ 2,
-- « Des règles encore en Dart », 2026-10-24). « Toutes les dates » et « À la une » lisaient app_events_in_zone, puis
-- l'app retirait elle-même, en Dart, les événements en cours de 12 h ou moins, ceux que l'utilisateur a masqués, ceux
-- des auteurs qu'il a bloqués et, sur « Tout », ceux retirés de l'accueil (hide_from_home) ; pour une catégorie, elle
-- comparait events.category à son id et à son nom. Désormais l'accueil lit app_events_in_range, qui a déjà les trois
-- premières règles (migration 20261019210000), et :
--
-- 1. app_on_tout(events) : la règle de « Tout », la première page de l'accueil. Un événement y est s'il n'est pas
--    retiré de l'accueil (hide_from_home : « Masquer de l'accueil » dans l'admin, qui « reste visible dans les
--    catégories »). Une fonction de la ligne, que PostgREST rend comme une colonne calculée : l'app la lit
--    (`select=…,app_on_tout`) dans les listes qui servent à la fois « Tout » et les pages de catégorie, et la filtre
--    (`app_on_tout=is.true`) dans celles de « Tout » seul (« À la une », la carte du soir sans catégorie). Les
--    nombres de « Tout » la lisent aussi : app_event_counts sans catégorie, app_zone_counts, app_cities.
-- 2. app_events_in_range : plus rien n'y est relu pour chaque événement. Les événements masqués et les auteurs
--    bloqués en sous-requêtes non corrélées (NOT IN), chacune calculée une fois par requête (un sous-plan haché),
--    auth.uid() lu une fois ((SELECT auth.uid()), une InitPlan) : les NOT EXISTS corrélés relisaient
--    user_hidden_events pour chaque événement, et auth.uid() pour chacune de ses lignes (en local, 200 cartes pour
--    un compte qui a masqué 40 événements : ~50 ms au lieu de ~5 ms). La catégorie demandée (son id ou son nom)
--    résolue une fois, puis comparée à events.category, qui est son id (point 3) : un EXISTS sur categories, et sa
--    RLS, tournait pour chaque événement d'une autre catégorie. Même signature ; mêmes lignes, sauf pour une
--    catégorie créée après des événements qui portaient déjà son nom (ils ne sont reconnus que par ce nom).
-- 3. events.category : l'id de sa catégorie. Le trigger events_normalize_category, avant les autres, remplace à
--    l'écriture un nom de catégorie (casse et espaces ignorés) par son id : la catégorie d'une demande de l'app,
--    reprise telle quelle par le formulaire de l'admin (event-request-utils.ts), arrive ainsi en capitales, comme
--    dans quelques lignes anciennes. Les lignes existantes sont converties ici. Un texte qui n'est le nom d'aucune
--    catégorie reste tel quel. Le paramètre `category` des fonctions accepte toujours l'id ou le nom (les versions
--    installées de l'app envoient le nom de la catégorie choisie).
--
-- Rien d'autre ne change : app_events_in_zone reste (les versions installées de l'app la lisent), comme la RLS et les
-- autres fonctions. Mêmes signatures : CREATE OR REPLACE. Les fonctions de l'app : `language sql`, `stable` ou
-- `immutable`, `security invoker`, sans clause SET ; la résolution d'une catégorie : `security definer` et
-- `SET search_path = ''` (la RLS de categories cache les catégories inactives), fermée à anon et authenticated ; tous
-- les objets sont qualifiés. Prérequis : 20261021220000_create_app_zone.sql (app_events_in_range),
-- 20261023170000_count_festival_programmes.sql (app_event_counts, app_zone_counts, app_cities). À appliquer d'un bloc
-- (`psql --single-transaction`) ; pas de BEGIN ni de COMMIT ici.

-- app_on_tout --------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_on_tout(e public.events)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NOT e.hide_from_home
$$;

COMMENT ON FUNCTION public.app_on_tout(public.events) IS
  'Règle de « Tout », la première page de l''accueil de l''app : un événement y est s''il n''est pas retiré de l''accueil (hide_from_home ; il reste dans sa catégorie). Colonne calculée pour PostgREST (select=…,app_on_tout ; filtre app_on_tout=is.true), lue aussi par les nombres de « Tout » (app_event_counts sans catégorie, app_zone_counts, app_cities). Migration 20261024120000.';

GRANT EXECUTE ON FUNCTION public.app_on_tout(public.events) TO anon, authenticated;

-- app_events_in_range ------------------------------------------------------------------------------------------
--
-- La définition de 20261021220000 ; la catégorie demandée lue une fois, les masqués et les auteurs bloqués en
-- sous-requêtes non corrélées : plus rien n'est relu à chaque événement.
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
      -- La catégorie demandée, par son id ou son nom, lue une fois : son id (null pour un texte qui ne désigne
      -- aucune catégorie visible).
      (
        SELECT c.id::text
        FROM public.categories AS c
        WHERE c.id::text = lower(btrim(app_events_in_range.category))
          OR upper(btrim(c.name)) = upper(btrim(app_events_in_range.category))
        ORDER BY c.id::text = lower(btrim(app_events_in_range.category)) DESC, c.display_order NULLS LAST, c.id
        LIMIT 1
      ) AS categorie_id,
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
    -- Catégorie : son id (events.category est l'id de sa catégorie, migration 20261024120000), ou le texte reçu tel
    -- quel (un texte qui ne désigne aucune catégorie, gardé dans events.category).
    AND (
      b.categorie IS NULL
      OR e.category = b.categorie_id
      OR upper(btrim(e.category)) = upper(b.categorie)
    )
    -- Gratuit : tous les prix connus à 0.
    AND (NOT b.gratuit OR e.price_kind = 'free')
    -- En famille : la case « jeune public », ou le tag « Jeune Public ».
    AND (NOT b.en_famille OR e.is_young_audience OR e.tag_ids && b.jeune_public)
    -- Par utilisateur : ses événements masqués et les auteurs qu'il a bloqués. Des sous-requêtes non corrélées :
    -- chacune est lue une fois par requête (un sous-plan haché), et auth.uid() une fois (une InitPlan). Un
    -- événement sans auteur n'a pas d'auteur bloqué (NOT IN rendrait null avec une liste non vide).
    AND e.id NOT IN (
      SELECT h.event_id
      FROM public.user_hidden_events AS h
      WHERE h.user_id = (SELECT auth.uid())
    )
    AND (
      e.created_by IS NULL
      OR e.created_by NOT IN (
        SELECT bu.blocked_user_id
        FROM public.blocked_users AS bu
        WHERE bu.blocker_user_id = (SELECT auth.uid())
      )
    )
$$;

COMMENT ON FUNCTION public.app_events_in_range(timestamp, timestamp, uuid[], text, timestamp, boolean, boolean, text, numeric) IS
  'Événements de app_events() dans la plage [range_start, range_end) (heure de Paris) : commencent dans la plage, ou durent plus de 12 h et ont commencé avant ; pas terminés. Zone (zone_city, zone_km : la ville, ou à moins du rayon de son centre ; app_in_zone), ancien périmètre (city_ids, à défaut la ville du lieu), catégorie (id ou nom), gratuits seulement (free : price_kind = free), en famille seulement (family : is_young_audience ou le tag « Jeune Public »), sans les événements masqués par l''utilisateur ni ceux des auteurs bloqués (sous-requêtes lues une fois par requête). Règles : migrations 20261019210000, 20261021160000, 20261021220000 et 20261024120000.';

GRANT EXECUTE ON FUNCTION public.app_events_in_range(timestamp, timestamp, uuid[], text, timestamp, boolean, boolean, text, numeric)
  TO anon, authenticated;

-- Les nombres de « Tout » ------------------------------------------------------------------------------------------
--
-- app_event_counts : la définition de 20261023170000, la règle de « Tout » par app_on_tout.
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
        public.app_on_tout(e)
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
  'Comptes du calendrier de l''app : pour chaque plage {start, end, key} de ranges (heure de Paris), events_count (événements de app_events_in_range, une fois chacun ; sur « Tout », ceux d''app_on_tout (sans hide_from_home) et sans la fiche d''un festival qui a un programme dans app_festival_events : ses événements comptent, pas elle) et starting_count (ceux qui commencent dans la plage). free et family : seulement les gratuits, ou en famille (règles d''app_events_in_range, migration 20261021160000). Migrations 20261021220000, 20261023170000 et 20261024120000.';

GRANT EXECUTE ON FUNCTION public.app_event_counts(jsonb, uuid[], text, timestamp, boolean, boolean, text, numeric)
  TO anon, authenticated;

-- app_zone_counts : la définition de 20261023170000, la règle de « Tout » par app_on_tout.
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
      WHERE public.app_on_tout(e)
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
  'Écran « Ville et rayon » de l''app : pour chaque rayon de radii (10 au plus, dans l''ordre), le nombre d''événements à venir de la zone (zone_city, rayon) comme l''accueil sur « Tout » : app_events_in_range à partir d''aujourd''hui (heure de Paris, ou at_time), ceux d''app_on_tout (sans hide_from_home), sans la fiche d''un festival qui a un programme dans app_festival_events. Migrations 20261021220000, 20261023170000 et 20261024120000.';

GRANT EXECUTE ON FUNCTION public.app_zone_counts(text, numeric[], timestamp) TO anon, authenticated;

-- app_cities : la définition de 20261023170000, la règle de « Tout » par app_on_tout.
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
    WHERE public.app_on_tout(e)
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
  'Villes proposées dans l''app (app_city_groups : cities actives regroupées par libellé d''affichage) qui ont un centre et des événements : à venir (app_events_in_range à partir d''aujourd''hui, heure de Paris, ceux d''app_on_tout (sans hide_from_home) ; upcoming_events_count comme l''accueil sur « Tout », sans la fiche d''un festival qui a un programme dans app_festival_events), récents (commencés dans les 120 derniers jours), prochaine et dernière date ; slug de la représentante, pour la zone (app_zone). « Aujourd''hui » : heure de Paris, ou at_time. Migrations 20261018200000, 20261021220000, 20261023170000 et 20261024120000.';

GRANT EXECUTE ON FUNCTION public.app_cities(timestamp) TO anon, authenticated;

-- events.category : l'id de sa catégorie -----------------------------------------------------------------------
--
-- L'id de la catégorie que désigne un texte : son id (casse et espaces ignorés) ou son nom (de même ; deux
-- catégories du même nom à la casse près : l'active, puis la première par display_order). Null pour un texte qui
-- n'est ni l'un ni l'autre. Toutes les catégories, inactives comprises (security definer) ; pour le trigger et la
-- conversion ci-dessous seulement : ni anon ni authenticated ne l'appellent.
CREATE OR REPLACE FUNCTION public.resolve_event_category(category text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id
  FROM public.categories AS c
  WHERE c.id::text = lower(btrim(resolve_event_category.category))
    OR upper(btrim(c.name)) = upper(btrim(resolve_event_category.category))
  ORDER BY
    c.id::text = lower(btrim(resolve_event_category.category)) DESC,
    c.is_active DESC NULLS LAST,
    c.display_order NULLS LAST,
    c.id
  LIMIT 1
$$;

COMMENT ON FUNCTION public.resolve_event_category(text) IS
  'L''id de la catégorie que désigne un texte : son id ou son nom (casse et espaces ignorés) ; null sinon. Pour events_normalize_category. Migration 20261024120000.';

REVOKE EXECUTE ON FUNCTION public.resolve_event_category(text) FROM PUBLIC, anon, authenticated;

-- À l'écriture d'un événement : un nom de catégorie devient son id ; un texte qui ne désigne aucune catégorie reste.
CREATE OR REPLACE FUNCTION public.normalize_event_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  categorie uuid;
BEGIN
  categorie := public.resolve_event_category(NEW.category);
  IF categorie IS NOT NULL THEN
    NEW.category := categorie::text;
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.normalize_event_category() IS
  'Trigger events_normalize_category : events.category reçoit l''id de la catégorie qu''il désigne (resolve_event_category), à l''insertion et quand il change. Migration 20261024120000.';

REVOKE EXECUTE ON FUNCTION public.normalize_event_category() FROM PUBLIC, anon, authenticated;

-- Son nom le fait passer avant les autres triggers BEFORE d'events (ordre alphabétique) : ils voient l'id.
DROP TRIGGER IF EXISTS events_normalize_category ON public.events;
CREATE TRIGGER events_normalize_category
  BEFORE INSERT OR UPDATE OF category ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_event_category();

-- Les lignes existantes dont le texte désigne une catégorie sans être son id exact.
UPDATE public.events AS e
SET category = r.categorie::text
FROM (
  SELECT ev.id, public.resolve_event_category(ev.category) AS categorie
  FROM public.events AS ev
) AS r
WHERE r.id = e.id
  AND r.categorie IS NOT NULL
  AND e.category IS DISTINCT FROM r.categorie::text;

-- Vérification (SQL Editor) : aucune ligne dont le texte désigne une catégorie sans être son id ; les événements
-- visibles retirés de « Tout ».
-- select count(*) from public.events
-- where public.resolve_event_category(category) is not null
--   and category is distinct from public.resolve_event_category(category)::text;
-- select count(*) filter (where not public.app_on_tout(e)) from public.app_events() as e;

-- Rollback, dans cet ordre (avant la sortie de la version de l'app qui lit app_on_tout) :
-- DROP TRIGGER IF EXISTS events_normalize_category ON public.events;
-- DROP FUNCTION IF EXISTS public.normalize_event_category();
-- DROP FUNCTION IF EXISTS public.resolve_event_category(text);
-- les textes convertis : les remettre depuis la sauvegarde faite avant l'application (id, category) ;
-- recréer app_event_counts, app_zone_counts et app_cities de 20261023170000_count_festival_programmes.sql, puis
-- app_events_in_range de 20261021220000_create_app_zone.sql ;
-- DROP FUNCTION IF EXISTS public.app_on_tout(public.events);
