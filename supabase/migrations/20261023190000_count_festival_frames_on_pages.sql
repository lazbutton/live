-- Festivals : les nombres des pages de lieu, d'organisateur et d'artiste, sans les fiches qu'elles montrent dans
-- leur section « Festivals ».
--
-- Étape 5 de l'app (PR lazbutton/live-app#171, `docs/FESTIVALS.md`, § 3) : la page d'un lieu, d'un organisateur ou
-- d'un artiste montre ses festivals dans une section « Festivals » et retire leurs fiches de sa liste, dont le
-- nombre est celui de la page (PlaceFestivals.withoutFrames, FestivalsRepository.festivalsOfPage). Les nombres lus
-- en SQL pour ces pages (la recherche, « Organisé par », « Les 41 événements du lieu », « Mes suivis ») comptaient
-- encore la fiche : le Dropkick, lieu de la fiche de Fulgurances, en avait un de plus que sur sa page (U3). Comme
-- 20261023170000 pour « Tout ».
--
-- La règle, celle de l'app : une page ne compte pas
-- - la fiche d'un festival qui a un programme, c'est-à-dire au moins une ligne dans app_festival_events pour
--   l'utilisateur (un événement à venir rattaché, visible pour lui) ;
-- - sur la page d'un lieu, la fiche d'un festival dont ce lieu est un des lieux (festival_locations), même sans
--   programme (« programme à venir »).
-- Ses autres événements comptent, ceux des festivals compris.
--
-- - app_organizer_counts(…) : le nombre de la page d'un lieu ou d'un organisateur (« Organisé par », les lieux de
--   la recherche) ;
-- - app_search_names(…) : un lieu ou un organisateur trouvé, le nombre de sa page ; une catégorie et un tag ne
--   changent pas (leurs listes, ouvertes depuis la recherche, gardent la fiche) ; un nom qui n'a plus rien n'est
--   pas proposé (au moins un, comme avant) ;
-- - app_see_also(…) : source_events_count, le nombre de la page de la source (les rangées ne changent pas) ;
-- - app_follows(…) : upcoming_count et new_count, ceux de la page de chaque cible (lieu, organisateur, artiste).
--
-- Rien d'autre ne change : app_search (les événements trouvés : l'app met le festival en tête), app_tag_counts,
-- app_category_counts, les listes. Mêmes signatures, mêmes colonnes : CREATE OR REPLACE, rien à changer dans l'app.
-- `language sql`, `stable`, `security invoker`, sans clause SET ; tous les objets sont qualifiés. Prérequis :
-- 20261023120000_create_festivals.sql, 20261023160000_add_festival_follows_and_see_also.sql (app_see_also).
-- À appliquer d'un bloc (`psql --single-transaction`) ; pas de BEGIN ni de COMMIT ici.

-- app_organizer_counts -------------------------------------------------------------------------------------------
--
-- La définition de 20261021220000 ; le nombre de la page.
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
  -- Les festivals qui ont un programme (l'index de l'accueil, app_festival_events) : sur une page de lieu,
  -- d'organisateur ou d'artiste, leur fiche est dans la section « Festivals », pas dans la liste.
  programmes AS MATERIALIZED (
    SELECT DISTINCT f.festival_id
    FROM public.app_festival_events(app_organizer_counts.at_time) AS f
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
  ),
  -- Le nombre de la page : sans la fiche d'un festival qui a un programme, ni, pour un lieu, celle d'un festival
  -- dont il est un des lieux (festival_locations) : la page les montre dans « Festivals ».
  comptes AS (
    SELECT
      en.id,
      en.kind,
      count(DISTINCT a.id) FILTER (WHERE NOT x.cadre)::integer AS nombre
    FROM entites AS en
    LEFT JOIN liens AS li ON li.entite = en.id
    LEFT JOIN a_venir AS a ON a.id = li.event_id
    LEFT JOIN LATERAL (
      SELECT EXISTS (SELECT 1 FROM programmes AS p WHERE p.festival_id = a.id)
        OR (en.kind = 'location' AND EXISTS (
          SELECT 1
          FROM public.festival_locations AS fl
          WHERE fl.festival_id = a.id
            AND fl.location_id = en.id
        )) AS cadre
    ) AS x ON true
    GROUP BY en.id, en.kind
  )
  SELECT c.id, c.kind, c.nombre
  FROM comptes AS c
  ORDER BY c.nombre DESC, c.id
$$;

COMMENT ON FUNCTION public.app_organizer_counts(uuid[], uuid[], timestamp, text, numeric) IS
  'Fiche de l''app : nombre d''événements à venir (app_events_in_range à partir d''aujourd''hui, heure de Paris) de chaque organisateur demandé : organizers par event_organizers.organizer_id ; lieu par event_organizers.location_id et events.location_id, chaque événement une fois. Sans la fiche d''un festival qui a un programme (app_festival_events), ni, pour un lieu, celle d''un festival dont il est un des lieux (festival_locations) : le nombre de sa page. Migrations 20261021220000 et 20261023190000.';

GRANT EXECUTE ON FUNCTION public.app_organizer_counts(uuid[], uuid[], timestamp, text, numeric) TO anon, authenticated;

-- app_search_names -----------------------------------------------------------------------------------------------
--
-- La définition de 20261021220000 ; le nombre d'un lieu ou d'un organisateur, celui de sa page.
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
  -- Les festivals qui ont un programme (l'index de l'accueil, app_festival_events) : sur une page de lieu,
  -- d'organisateur ou d'artiste, leur fiche est dans la section « Festivals », pas dans la liste.
  programmes AS MATERIALIZED (
    SELECT DISTINCT f.festival_id
    FROM public.app_festival_events(app_search_names.at_time) AS f
  ),
  -- Organisateur qui porte le nom d'un lieu : compté avec le lieu, trouvé lui aussi (même nom).
  homonymes AS MATERIALIZED (
    SELECT o.id AS organizer_id, min(l.id::text)::uuid AS location_id
    FROM trouves AS o
    JOIN trouves AS l ON l.sorte = 'location' AND l.texte = o.texte
    WHERE o.sorte = 'organizer'
    GROUP BY o.id
  ),
  -- (nom trouvé, événement à venir), si le lien en fait un organisateur, s'il compte pour une page de lieu ou
  -- d'organisateur (page), et le lieu de cette page (lieu ; un organisateur homonyme, celui du lieu).
  liens AS (
    SELECT t.id AS entite, a.id AS event_id, false AS organise, false AS page, NULL::uuid AS lieu
    FROM trouves AS t
    JOIN public.categories AS c ON c.id = t.id
    JOIN a_venir AS a ON a.category = c.id::text OR upper(btrim(a.category)) = upper(btrim(c.name))
    WHERE t.sorte = 'category'
    UNION ALL
    SELECT t.id, a.id, false, false, NULL::uuid
    FROM trouves AS t
    JOIN a_venir AS a ON t.id = ANY (a.tag_ids)
    WHERE t.sorte = 'tag'
    UNION ALL
    SELECT t.id, a.id, false, true, t.id
    FROM trouves AS t
    JOIN a_venir AS a ON a.location_id = t.id
    WHERE t.sorte = 'location'
    UNION ALL
    SELECT t.id, a.id, true, true, t.id
    FROM trouves AS t
    JOIN public.event_organizers AS eo ON eo.location_id = t.id
    JOIN a_venir AS a ON a.id = eo.event_id
    WHERE t.sorte = 'location'
    UNION ALL
    SELECT coalesce(h.location_id, t.id), a.id, true, true, h.location_id
    FROM trouves AS t
    JOIN public.event_organizers AS eo ON eo.organizer_id = t.id
    JOIN a_venir AS a ON a.id = eo.event_id
    LEFT JOIN homonymes AS h ON h.organizer_id = t.id
    WHERE t.sorte = 'organizer'
  ),
  -- Le nombre d'un lieu ou d'un organisateur est celui de sa page : sans la fiche d'un festival qui a un
  -- programme, ni, pour un lieu, celle d'un festival dont il est un des lieux. Une catégorie et un tag comptent
  -- tout (leurs listes gardent la fiche). Un nom sans rien d'autre n'est pas proposé (au moins un).
  comptes AS (
    SELECT
      li.entite,
      count(DISTINCT li.event_id) FILTER (WHERE NOT li.cadre)::integer AS nombre,
      bool_or(li.organise) AS organise
    FROM (
      SELECT
        l.entite,
        l.event_id,
        l.organise,
        l.page AND (
          EXISTS (SELECT 1 FROM programmes AS p WHERE p.festival_id = l.event_id)
          OR (l.lieu IS NOT NULL AND EXISTS (
            SELECT 1
            FROM public.festival_locations AS fl
            WHERE fl.festival_id = l.event_id
              AND fl.location_id = l.lieu
          ))
        ) AS cadre
      FROM liens AS l
    ) AS li
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
      AND c.nombre > 0
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
  'Recherche de l''app : catégories, tags, lieux et organisateurs dont le nom correspond à la requête (règles d''app_search), avec leur nombre d''événements à venir (comptes d''app_category_counts, app_tag_counts, app_organizer_counts : un lieu ou un organisateur sans les fiches que sa page montre dans « Festivals ») ; au moins un ; max_results au plus de chaque sorte (1 à 50, 10 par défaut). Migrations 20261021220000 et 20261023190000.';

GRANT EXECUTE ON FUNCTION public.app_search_names(text, uuid[], timestamp, integer, text, numeric) TO anon, authenticated;

-- app_see_also ---------------------------------------------------------------------------------------------------
--
-- La définition de 20261023160000 ; source_events_count, le nombre de la page de la source.
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
  -- Les festivals qui ont un programme (l'index de l'accueil, app_festival_events) : sur une page de lieu,
  -- d'organisateur ou d'artiste, leur fiche est dans la section « Festivals », pas dans la liste.
  programmes AS MATERIALIZED (
    SELECT DISTINCT f.festival_id
    FROM public.app_festival_events(app_see_also.at_time) AS f
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
  -- Leurs événements à venir, avec leur série, et si la page de la source montre la fiche dans « Festivals »
  -- (cadre : un festival qui a un programme ; pour un lieu, aussi un festival dont il est un des lieux).
  evenements_sources AS MATERIALIZED (
    SELECT
      li.source,
      a.id,
      a.date,
      coalesce(se.series_id, a.id) AS serie,
      a.festival,
      EXISTS (SELECT 1 FROM programmes AS p WHERE p.festival_id = a.id)
        OR EXISTS (
          SELECT 1
          FROM candidates AS s
          JOIN public.festival_locations AS fl ON fl.location_id = s.id
          WHERE s.id = li.source
            AND s.sorte = 'location'
            AND fl.festival_id = a.id
        ) AS cadre
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
        -- Le nombre de sa page : sans les fiches qu'elle montre dans « Festivals ».
        count(*) FILTER (WHERE NOT x.cadre) AS total,
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
  'Fiche de l''app, « À voir aussi » : section place, les prochains événements du lieu de l''événement (ceux de sa page), à défaut de l''organisateur qui en a le plus, par date, avec la source (source_kind, source_id, source_name, source_events_count : le nombre de sa page, sans les fiches qu''elle montre dans « Festivals ») ; section genre, ceux de la même catégorie ou d''un tag commun, à 7 jours au plus de sa date, dans le périmètre city_ids, sans ceux de la première rangée, les plus proches retenus puis rendus par date. À venir (app_events_in_range), une ligne par série (app_event_series ; un événement seul est la sienne), sans la série de la fiche ni les événements de son festival (ni le festival lui-même) ; max_results par rangée (1 à 20, 3 par défaut) ; rank pour l''ordre. Appel : rpc/app_see_also?select=section,rank,…,event:events(…)&order=rank. Règle complète : migrations 20261021110000, 20261021170000, 20261023160000 et 20261023190000.';

GRANT EXECUTE ON FUNCTION public.app_see_also(uuid, uuid[], timestamp, integer, text, numeric) TO anon, authenticated;

-- app_follows ----------------------------------------------------------------------------------------------------
--
-- La définition de 20261021141000 ; les nombres de la page de chaque cible.
CREATE OR REPLACE FUNCTION public.app_follows(at_time timestamp DEFAULT NULL)
RETURNS TABLE (
  target_type text,
  target_id uuid,
  name text,
  image_url text,
  upcoming_count integer,
  new_count integer,
  followed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH maintenant AS (
    SELECT
      coalesce(app_follows.at_time, now() AT TIME ZONE 'Europe/Paris') AS paris,
      coalesce(app_follows.at_time AT TIME ZONE 'Europe/Paris', now()) AS instant
  ),
  cibles AS (
    SELECT f.target_type, f.target_id, f.created_at, l.name, l.image_url
    FROM public.user_follows AS f
    JOIN public.locations AS l ON l.id = f.target_id
    WHERE f.user_id = (SELECT auth.uid()) AND f.target_type = 'location'
    UNION ALL
    SELECT f.target_type, f.target_id, f.created_at, o.name,
      coalesce(nullif(btrim(o.logo_url), ''), nullif(btrim(o.icon_url), ''))
    FROM public.user_follows AS f
    JOIN public.organizers AS o ON o.id = f.target_id
    WHERE f.user_id = (SELECT auth.uid()) AND f.target_type = 'organizer'
    UNION ALL
    SELECT f.target_type, f.target_id, f.created_at, a.name, a.image_url
    FROM public.user_follows AS f
    JOIN public.artists AS a ON a.id = f.target_id
    WHERE f.user_id = (SELECT auth.uid()) AND f.target_type = 'artist'
  ),
  a_venir AS (
    SELECT e.id, e.location_id, e.published_at
    FROM maintenant AS m
    CROSS JOIN LATERAL public.app_events_in_range(
      date_trunc('day', m.paris), NULL, NULL, NULL, app_follows.at_time
    ) AS e
  ),
  -- Les festivals qui ont un programme (l'index de l'accueil, app_festival_events) : sur une page de lieu,
  -- d'organisateur ou d'artiste, leur fiche est dans la section « Festivals », pas dans la liste.
  programmes AS MATERIALIZED (
    SELECT DISTINCT f.festival_id
    FROM public.app_festival_events(app_follows.at_time) AS f
  ),
  -- (cible, événement à venir), sans doublon : UNION.
  liens AS (
    SELECT 'location'::text AS target_type, a.location_id AS target_id, a.id AS event_id
    FROM a_venir AS a
    JOIN cibles AS c ON c.target_type = 'location' AND c.target_id = a.location_id
    UNION
    SELECT 'location'::text, eo.location_id, eo.event_id
    FROM public.event_organizers AS eo
    JOIN cibles AS c ON c.target_type = 'location' AND c.target_id = eo.location_id
    UNION
    SELECT 'organizer'::text, eo.organizer_id, eo.event_id
    FROM public.event_organizers AS eo
    JOIN cibles AS c ON c.target_type = 'organizer' AND c.target_id = eo.organizer_id
    UNION
    SELECT 'artist'::text, ea.artist_id, ea.event_id
    FROM public.event_artists AS ea
    JOIN cibles AS c ON c.target_type = 'artist' AND c.target_id = ea.artist_id
  )
  SELECT t.target_type, t.target_id, t.name, t.image_url, t.upcoming_count, t.new_count, t.followed_at
  FROM (
    SELECT
      c.target_type,
      c.target_id,
      c.name,
      nullif(btrim(c.image_url), '') AS image_url,
      -- Comme la page de la cible : sans la fiche d'un festival qui a un programme, ni, pour un lieu, celle d'un
      -- festival dont il est un des lieux.
      count(a.id) FILTER (WHERE NOT x.cadre)::integer AS upcoming_count,
      count(a.id) FILTER (
        WHERE a.published_at > greatest(c.created_at, m.instant - interval '7 days')
          AND NOT x.cadre
      )::integer AS new_count,
      c.created_at AS followed_at
    FROM cibles AS c
    CROSS JOIN maintenant AS m
    LEFT JOIN liens AS li ON li.target_type = c.target_type AND li.target_id = c.target_id
    LEFT JOIN a_venir AS a ON a.id = li.event_id
    LEFT JOIN LATERAL (
      SELECT EXISTS (SELECT 1 FROM programmes AS p WHERE p.festival_id = a.id)
        OR (c.target_type = 'location' AND EXISTS (
          SELECT 1
          FROM public.festival_locations AS fl
          WHERE fl.festival_id = a.id
            AND fl.location_id = c.target_id
        )) AS cadre
    ) AS x ON true
    GROUP BY c.target_type, c.target_id, c.name, c.image_url, c.created_at, m.instant
  ) AS t
  ORDER BY t.new_count > 0 DESC, t.upcoming_count DESC, t.name, t.target_id
$$;

COMMENT ON FUNCTION public.app_follows(timestamp) IS
  'Mes suivis (U8) : les suivis de l''appelant, leur cible (nom, image), ses événements à venir (comme app_organizer_counts, et pour un artiste ses événements ; sans les fiches que la page de la cible montre dans « Festivals ») et ceux publiés depuis 7 jours et depuis le suivi. Règle complète : migrations 20261021141000 et 20261023190000.';

REVOKE ALL ON FUNCTION public.app_follows(timestamp) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_follows(timestamp) TO authenticated;

-- Rollback : recréer app_organizer_counts et app_search_names de 20261021220000_create_app_zone.sql,
-- app_see_also de 20261023160000_add_festival_follows_and_see_also.sql et app_follows de
-- 20261021141000_create_user_follows.sql.
