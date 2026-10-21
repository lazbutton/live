-- Fiche de l'app : « À voir aussi », deux rangées en bas de la fiche, une seule définition.
--
-- Audit UI/UX du 2026-10-20 (../live/docs/AMELIORATIONS.md, U11) : la fiche s'arrêtait sur « Organisé
-- par » ; pour continuer, il fallait revenir. Elle finit désormais par deux rangées au plus, chacune
-- masquée si elle est vide (maquettes, lot 1 : « Fiche, À voir aussi ») : « Aussi à <lieu> » et « Dans
-- le même genre ». Les deux viennent d'ici, en un seul appel, pas d'un calcul en Dart sur les seuls
-- événements chargés. Contrat pour l'app : docs/API_APP.md (« Fiche : app_see_also »).
--
-- app_see_also(event_id, city_ids, at_time, max_results) : une ligne par événement proposé, de la table
-- app_see_also_results, toujours vide, dont la clé étrangère vers events permet à l'app d'embarquer
-- l'événement avec son select habituel et de trier les lignes, en un seul appel :
-- rpc/app_see_also?select=section,rank,source_kind,source_id,source_name,source_events_count,event:events(…)&order=rank
-- (un `setof events` trié par la fonction perdrait son ordre dans PostgREST, comme pour app_search).
--
-- L'événement de la fiche (event_id) est lu dans events sous la RLS de l'appelant : un événement qu'il
-- peut voir (publié, ou le sien en attente) ; inconnu ou invisible, aucune ligne. Les événements
-- proposés viennent tous d'app_events_in_range, donc d'app_events() : visibles dans l'app, à venir
-- (à partir d'aujourd'hui 0 h, expositions en cours comprises, pas terminés ; heure de Paris, ou
-- `at_time`), sans ceux que l'utilisateur a masqués ni ceux des auteurs qu'il a bloqués, avec ceux
-- retirés de l'accueil (hide_from_home), comme la recherche et les pages de lieu. L'événement de la
-- fiche n'est jamais proposé.
--
-- Une ligne par spectacle : des événements de même titre (sans accents, casse ni ponctuation, comme la
-- recherche : app_search_normalize) sont les dates d'un même spectacle (la moitié des événements à venir
-- le 2026-10-21 : « Les Croquis du TTN », 7 dates en 3 jours). Chaque rangée n'en montre que la première
-- date (« Dans le même genre » : la plus proche), et jamais celles du spectacle de la fiche (ses autres
-- dates, U14). Les comptes comptent chaque date, comme les pages.
--
-- « Aussi à <lieu> » (section = 'place'), au plus max_results :
-- - la source est le lieu de l'événement (events.location_id) : ses événements à venir, ceux de sa page
--   et du compte d'app_organizer_counts (ceux qui s'y tiennent et ceux qu'il organise, chacun une fois),
--   toutes villes, comme la page du lieu ;
-- - si le lieu n'a pas d'autre spectacle, ou si l'événement n'a pas de lieu : celui de ses organisateurs
--   (event_organizers : un organisateur, ou un autre lieu qui organise, compté comme sa page) qui a le
--   plus d'autres spectacles ; à égalité, par nom puis id ; aucun : pas de rangée ;
-- - par date (une exposition en cours d'abord), puis id : le début de la page de la source, une ligne par
--   spectacle ;
-- - chaque ligne porte sa source : source_kind ('location' : page d'un lieu ; 'organizer' : page d'un
--   organisateur), source_id, source_name et source_events_count, son nombre d'événements à venir,
--   l'événement de la fiche compris s'il est à venir : le nombre de sa page et d'app_organizer_counts
--   (« Les 41 événements du lieu », maquette A).
--
-- « Dans le même genre » (section = 'genre'), au plus max_results :
-- - autour de la date : les événements d'une plage d'app_events_in_range de 7 jours avant à 7 jours
--   après le jour de l'événement ([jour − 7 j, jour + 8 j)), sans le passé ; le jour est celui de
--   l'événement, ou aujourd'hui s'il a commencé avant (exposition en cours, événement passé) ;
-- - dans le périmètre city_ids (null ou vide : toutes les villes), comme la recherche ;
-- - de la même catégorie (par id ou par nom, comme le filtre de catégorie de l'app) ou avec au moins un
--   tag en commun ;
-- - sans les spectacles de la rangée « Aussi à » ;
-- - retenus du plus proche au moins proche : le nombre de tags en commun, plus 1 pour la même catégorie ;
--   puis le plus près de l'événement dans le temps (0 pour un événement en cours à ce moment) ; puis par
--   date et id ; les max_results retenus sont rendus par date, puis id.
--
-- rank : à partir de 1, la rangée « Aussi à » d'abord, puis « Dans le même genre » ; l'app trie dessus
-- (order=rank). max_results : par rangée, 1 à 20, 3 par défaut (trois lignes par rangée sur les
-- maquettes). city_ids et at_time : conventions des fonctions de l'app (docs/API_APP.md).
--
-- `language sql`, `stable`, `security invoker`, sans clause SET, comme app_events() : la RLS de
-- l'appelant s'applique (events, event_organizers, locations, organizers, categories). Tous les objets
-- sont qualifiés par leur schéma. Prérequis : 20261019210000_create_app_events_in_range_and_counts.sql
-- (app_events_in_range) et 20261020170000_create_app_search.sql (app_search_normalize).

-- Type des lignes d'app_see_also : toujours vide (aucune écriture, RLS sans politique, aucun droit).
CREATE TABLE IF NOT EXISTS public.app_see_also_results (
  section text NOT NULL,
  rank integer NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  source_kind text,
  source_id uuid,
  source_name text,
  source_events_count integer
);

COMMENT ON TABLE public.app_see_also_results IS
  'Toujours vide : type des lignes d''app_see_also() (un événement proposé en bas d''une fiche, sa rangée et son rang ; la source de la rangée « Aussi à »). Sa clé étrangère vers events permet à PostgREST d''embarquer l''événement : rpc/app_see_also?select=section,rank,…,event:events(…)&order=rank.';

ALTER TABLE public.app_see_also_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_see_also_results FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_see_also(
  event_id uuid,
  city_ids uuid[] DEFAULT NULL,
  at_time timestamp DEFAULT NULL,
  max_results integer DEFAULT 3
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
      public.app_search_normalize(e.title) AS titre,
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
  -- Leurs événements à venir, avec le titre qui regroupe les dates d'un spectacle.
  evenements_sources AS MATERIALIZED (
    SELECT li.source, a.id, a.date, public.app_search_normalize(a.title) AS titre
    FROM liens AS li
    JOIN a_venir AS a ON a.id = li.event_id
  ),
  -- La source retenue : la première qui a un autre spectacle que celui de la fiche.
  source AS MATERIALIZED (
    SELECT s.sorte, s.id, coalesce(l.name, o.name) AS nom, k.total
    FROM candidates AS s
    CROSS JOIN courant AS c
    CROSS JOIN LATERAL (
      SELECT
        count(*) AS total,
        count(DISTINCT x.titre) FILTER (WHERE x.titre <> c.titre) AS autres
      FROM evenements_sources AS x
      WHERE x.source = s.id
    ) AS k
    LEFT JOIN public.locations AS l ON s.sorte = 'location' AND l.id = s.id
    LEFT JOIN public.organizers AS o ON s.sorte = 'organizer' AND o.id = s.id
    WHERE k.autres > 0
    ORDER BY s.priorite, k.autres DESC, coalesce(l.name, o.name), s.id
    LIMIT 1
  ),
  -- « Aussi à » : la première date de chaque spectacle de la source, sauf celui de la fiche.
  rangee_lieu AS MATERIALIZED (
    SELECT p.id, p.titre, row_number() OVER (ORDER BY p.date, p.id) AS ordre
    FROM (
      SELECT DISTINCT ON (x.titre) x.id, x.date, x.titre
      FROM source AS s
      JOIN evenements_sources AS x ON x.source = s.id
      CROSS JOIN courant AS c
      WHERE x.titre <> c.titre
      ORDER BY x.titre, x.date, x.id
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
    SELECT e.id, e.date, e.end_date, e.title, nullif(btrim(e.category), '') AS categorie, e.tag_ids
    FROM bornes AS b
    CROSS JOIN LATERAL public.app_events_in_range(
      greatest(b.aujourdhui, b.jour - interval '7 days'),
      b.jour + interval '8 days',
      app_see_also.city_ids,
      NULL,
      app_see_also.at_time
    ) AS e
  ),
  genre AS (
    SELECT
      x.id,
      x.date,
      n.titre,
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
    CROSS JOIN LATERAL (SELECT public.app_search_normalize(x.title) AS titre) AS n
    CROSS JOIN courant AS c
    CROSS JOIN bornes AS b
    LEFT JOIN categorie AS k ON true
    -- Ni le spectacle de la fiche (l'événement compris), ni ceux de la rangée « Aussi à ».
    WHERE n.titre <> c.titre
      AND NOT EXISTS (SELECT 1 FROM rangee_lieu AS r WHERE r.titre = n.titre)
  ),
  -- La date la plus proche de chaque spectacle, puis les plus proches.
  rangee_genre AS MATERIALIZED (
    SELECT p.id, p.date
    FROM (
      SELECT DISTINCT ON (g.titre) g.id, g.date, g.score, g.ecart
      FROM genre AS g
      WHERE g.score > 0
      ORDER BY g.titre, g.score DESC, g.ecart, g.date, g.id
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

COMMENT ON FUNCTION public.app_see_also(uuid, uuid[], timestamp, integer) IS
  'Fiche de l''app, « À voir aussi » : section place, les prochains événements du lieu de l''événement (ceux de sa page), à défaut de l''organisateur qui en a le plus, par date, avec la source (source_kind, source_id, source_name, source_events_count) ; section genre, ceux de la même catégorie ou d''un tag commun, à 7 jours au plus de sa date, dans le périmètre city_ids, sans ceux de la première rangée, les plus proches retenus puis rendus par date. À venir (app_events_in_range), une ligne par spectacle (même titre normalisé), sans le spectacle de la fiche ; max_results par rangée (1 à 20, 3 par défaut) ; rank pour l''ordre. Appel : rpc/app_see_also?select=section,rank,…,event:events(…)&order=rank. Règle complète : migration 20261021110000.';

GRANT EXECUTE ON FUNCTION public.app_see_also(uuid, uuid[], timestamp, integer) TO anon, authenticated;

-- Vérification (SQL Editor) : « À voir aussi » d'un événement du Théâtre d'Orléans.
-- select s.section, s.rank, e.title, e.date, s.source_name, s.source_events_count
-- from public.app_see_also((
--   select id from public.app_events_in_range(date_trunc('day', now() at time zone 'Europe/Paris'))
--   where location_id = '78d1fda4-3d58-412f-8105-b35a04227428' order by date limit 1
-- )) as s
-- join public.events as e on e.id = s.event_id
-- order by s.rank;

-- Rollback :
-- DROP FUNCTION IF EXISTS public.app_see_also(uuid, uuid[], timestamp, integer);
-- DROP TABLE IF EXISTS public.app_see_also_results;
