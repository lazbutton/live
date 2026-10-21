-- Séries de l'app : les dates d'un même spectacle, une seule règle (U14).
--
-- Audit UI/UX du 2026-10-20 (../live/docs/AMELIORATIONS.md, U14) : « Plonger » était une carte
-- « Aujourd'hui » et une autre « Demain », même affiche, même lieu ; une série de représentations
-- remplissait l'accueil. Planches du lot 3 (../live/docs/MAQUETTES_REFONTE.md, « Séries ») : sur
-- l'accueil, une carte par série, à sa première date, « et 3 autres dates » dans la ligne d'infos ; sur
-- la fiche, « 4 dates » et les dates en puces, chacune ouvrant sa fiche. Règle tranchée le 2026-10-21
-- (AMELIORATIONS.md, § 5) : automatique, en SQL, sans lien posé dans l'admin. Contrat pour l'app :
-- docs/API_APP.md (« Séries : app_event_series »).
--
-- Règle : deux événements à venir sont de la même série s'ils ont le même titre normalisé, le même
-- lieu, et si l'on passe de l'un à l'autre par des dates de ce titre à ce lieu qui se suivent à 7 jours
-- au plus (en jours de calendrier, heure de Paris : vendredi 20:30 et vendredi suivant 21:00 se
-- suivent). Une série hebdomadaire (« Plateaux », le vendredi et le samedi) fait donc une seule série
-- tant qu'il n'y a pas de trou de plus de 7 jours ; deux séances le même jour sont deux dates.
-- - Titre normalisé (app_event_series_title) : la date écrite au début ou à la fin du titre retirée
--   (app_event_title_without_date, les motifs de stripDateFromTitle, lib/scraping/dates.ts, qui la retire
--   des titres à l'import : « Atelier broderie - dim. 01/11 », « Samedi 31 octobre 2026 : Atelier
--   SITA », « Live - Novembre 2026 » ; s'il reste moins de 3 caractères, le titre entier : « 30/30 ») ;
--   puis sans accents, casse ni ponctuation, comme la recherche (app_search_normalize).
-- - Même lieu : events.location_id ; un événement sans lieu n'est d'aucune série.
-- - À venir : les événements d'app_events_in_range à partir d'aujourd'hui 0 h (expositions en cours
--   comprises, pas terminés ; heure de Paris, ou at_time), toutes villes, sans ceux que l'utilisateur a
--   masqués ni ceux des auteurs qu'il a bloqués, avec ceux retirés de l'accueil (hide_from_home), comme
--   « À voir aussi » et les pages de lieu. Les dates passées ne changent rien : celles qui restent se
--   suivent de la même façon.
--
-- app_event_series(at_time) : une ligne par événement à venir d'une série de 2 dates ou plus (un
-- événement seul n'a pas de ligne) :
-- - event_id, date : l'événement et sa date (events.date) ;
-- - series_id : la première date de la série (par date, puis id), l'événement à ouvrir pour la série ;
-- - dates_count : le nombre de dates de la série (2 ou plus), l'événement compris.
-- Rendues par série (sa première date), puis par date. L'app la lit une fois (toutes villes) : grouper
-- l'accueil par series_id, « et 3 autres dates » (dates_count − 1), les puces de la fiche.
--
-- app_see_also (migration 20261021110000) reprend la même règle à la place du « même titre » : une ligne
-- par série, jamais celles de la série de la fiche (ses dates sont dans ses puces).
--
-- `language sql`, `stable`, `security invoker`, sans clause SET, comme app_events() : la RLS de
-- l'appelant s'applique. Tous les objets sont qualifiés par leur schéma. Prérequis :
-- 20261019210000_create_app_events_in_range_and_counts.sql (app_events_in_range),
-- 20261020170000_create_app_search.sql (app_search_normalize) et 20261021110000_create_app_see_also.sql.

CREATE OR REPLACE FUNCTION public.app_event_title_without_date(title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  -- stripDateFromTitle (lib/scraping/dates.ts), mêmes motifs, même ordre : date en fin de titre après
  -- un séparateur, mois et année en fin de titre, date en début de titre avant un séparateur ; moins
  -- de 3 caractères sans la date : le titre entier.
  SELECT CASE WHEN length(btrim(d.sans_date)) >= 3 THEN btrim(d.sans_date) ELSE btrim(title) END
  FROM (
    SELECT regexp_replace(
      regexp_replace(
        regexp_replace(
          title,
          '\s*[-–—|:,]\s*(?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim)\.?\s+)?\d{1,2}(?:er)?(?:\s+(?:janv(?:ier)?|f[ée]vr(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?)\.?|\s*/\s*\d{1,2})(?:(?:\s+|\s*/\s*)(?:19|20)\d{2})?\s*$',
          '',
          'i'
        ),
        '\s*[-–—|:,(]\s*(?:janv(?:ier)?|f[ée]vr(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?)\.?\s+(?:19|20)\d{2}\s*\)?\s*$',
        '',
        'i'
      ),
      '^(?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim)\.?\s+)?\d{1,2}(?:er)?(?:\s+(?:janv(?:ier)?|f[ée]vr(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?)\.?|\s*/\s*\d{1,2})(?:(?:\s+|\s*/\s*)(?:19|20)\d{2})?\s*[-–—|:,]\s*',
      '',
      'i'
    ) AS sans_date
  ) AS d
$$;

COMMENT ON FUNCTION public.app_event_title_without_date(text) IS
  'Le titre sans la date écrite au début ou à la fin (« Atelier broderie - dim. 01/11 » → « Atelier broderie ») : stripDateFromTitle de lib/scraping/dates.ts, qui la retire à l''import, en SQL ; s''il reste moins de 3 caractères, le titre entier. Migration 20261021170000.';

GRANT EXECUTE ON FUNCTION public.app_event_title_without_date(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_event_series_title(title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  -- Une date à retirer s'écrit avec un chiffre et touche un séparateur (« - – — | : , ( ») : un titre
  -- sans l'un ou l'autre n'a rien à retirer. Une seule expression, que Postgres recopie dans la requête
  -- qui l'appelle : les motifs ne sont lus que pour ces titres-là (19 sur 363 à venir le 2026-10-21).
  SELECT public.app_search_normalize(
    CASE
      WHEN title ~ '[0-9]' AND title ~ '[-–—|:,(]' THEN public.app_event_title_without_date(title)
      ELSE title
    END
  )
$$;

COMMENT ON FUNCTION public.app_event_series_title(text) IS
  'Séries de l''app (U14) : le titre qui regroupe les dates d''un spectacle. Sans la date écrite au début ou à la fin (app_event_title_without_date, les motifs de stripDateFromTitle), puis sans accents, casse ni ponctuation (app_search_normalize). Règle complète : migration 20261021170000.';

GRANT EXECUTE ON FUNCTION public.app_event_series_title(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_event_series(at_time timestamp DEFAULT NULL)
RETURNS TABLE (
  event_id uuid,
  series_id uuid,
  date timestamptz,
  dates_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
ROWS 150
AS $$
  WITH a_venir AS (
    SELECT e.id, e.date, e.location_id, public.app_event_series_title(e.title) AS titre
    FROM public.app_events_in_range(
      date_trunc('day', coalesce(app_event_series.at_time, now() AT TIME ZONE 'Europe/Paris')),
      NULL,
      NULL,
      NULL,
      app_event_series.at_time
    ) AS e
    WHERE e.location_id IS NOT NULL
  ),
  -- Une série commence à la première date d'un titre à un lieu, et après plus de 7 jours sans date.
  debuts AS (
    SELECT
      a.id,
      a.date,
      a.location_id,
      a.titre,
      CASE
        WHEN (a.date AT TIME ZONE 'UTC')::date
          - (lag(a.date) OVER (PARTITION BY a.location_id, a.titre ORDER BY a.date, a.id) AT TIME ZONE 'UTC')::date
          <= 7
        THEN 0
        ELSE 1
      END AS debut
    FROM a_venir AS a
  ),
  -- Le numéro de la série de chaque date, dans son titre et son lieu.
  chaines AS (
    SELECT
      d.*,
      sum(d.debut) OVER (PARTITION BY d.location_id, d.titre ORDER BY d.date, d.id) AS chaine
    FROM debuts AS d
  ),
  series AS (
    SELECT
      c.id,
      c.date,
      first_value(c.id) OVER s AS premiere,
      first_value(c.date) OVER s AS premiere_date,
      count(*) OVER (PARTITION BY c.location_id, c.titre, c.chaine) AS nombre
    FROM chaines AS c
    WINDOW s AS (PARTITION BY c.location_id, c.titre, c.chaine ORDER BY c.date, c.id)
  )
  SELECT s.id, s.premiere, s.date, s.nombre::integer
  FROM series AS s
  WHERE s.nombre >= 2
  ORDER BY s.premiere_date, s.premiere, s.date, s.id
$$;

COMMENT ON FUNCTION public.app_event_series(timestamp) IS
  'Séries de l''app (U14) : une ligne par événement à venir d''une série de 2 dates ou plus (même titre normalisé par app_event_series_title, même lieu, 7 jours au plus entre deux dates qui se suivent) : event_id, date, series_id (la première date de la série), dates_count (ses dates, l''événement compris). À venir comme app_events_in_range à partir d''aujourd''hui 0 h, toutes villes, par utilisateur. Rendues par série puis par date. Règle complète : migration 20261021170000.';

GRANT EXECUTE ON FUNCTION public.app_event_series(timestamp) TO anon, authenticated;

-- « À voir aussi » (migration 20261021110000), avec la règle des séries à la place du « même titre » :
-- une ligne par série (sa première date ; « Dans le même genre » : la plus proche), jamais une date de la
-- série de la fiche. Un événement hors de toute série est la sienne. Le reste ne change pas : contrat
-- dans docs/API_APP.md (« Fiche : app_see_also »), règle complète dans la migration 20261021110000.
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
  -- Les séries des événements à venir (app_event_series), lues seulement pour une fiche visible.
  series AS MATERIALIZED (
    SELECT s.event_id, s.series_id
    FROM public.app_event_series(app_see_also.at_time) AS s
    WHERE EXISTS (SELECT 1 FROM courant)
  ),
  -- La série de la fiche, ou l'événement lui-même s'il n'en a pas (seul, ou passé).
  serie_courante AS MATERIALIZED (
    SELECT coalesce(
      (SELECT s.series_id FROM series AS s JOIN courant AS c ON c.id = s.event_id),
      (SELECT c.id FROM courant AS c)
    ) AS serie
  ),
  -- Les événements à venir, toutes villes : ceux des pages de lieu et d'organisateur.
  a_venir AS MATERIALIZED (
    SELECT e.id, e.date, e.location_id
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
      app_see_also.at_time
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

COMMENT ON FUNCTION public.app_see_also(uuid, uuid[], timestamp, integer) IS
  'Fiche de l''app, « À voir aussi » : section place, les prochains événements du lieu de l''événement (ceux de sa page), à défaut de l''organisateur qui en a le plus, par date, avec la source (source_kind, source_id, source_name, source_events_count) ; section genre, ceux de la même catégorie ou d''un tag commun, à 7 jours au plus de sa date, dans le périmètre city_ids, sans ceux de la première rangée, les plus proches retenus puis rendus par date. À venir (app_events_in_range), une ligne par série (app_event_series ; un événement seul est la sienne), sans la série de la fiche ; max_results par rangée (1 à 20, 3 par défaut) ; rank pour l''ordre. Appel : rpc/app_see_also?select=section,rank,…,event:events(…)&order=rank. Règle complète : migrations 20261021110000 et 20261021170000.';

GRANT EXECUTE ON FUNCTION public.app_see_also(uuid, uuid[], timestamp, integer) TO anon, authenticated;

-- Vérification (SQL Editor) : les séries à venir, du plus proche au plus lointain.
-- select e.title, l.name, s.date, s.dates_count
-- from public.app_event_series() as s
-- join public.events as e on e.id = s.event_id
-- left join public.locations as l on l.id = e.location_id
-- order by s.date;

-- Rollback : rejouer 20261021110000_create_app_see_also.sql (app_see_also au « même titre »), puis
-- DROP FUNCTION IF EXISTS public.app_event_series(timestamp);
-- DROP FUNCTION IF EXISTS public.app_event_series_title(text);
-- DROP FUNCTION IF EXISTS public.app_event_title_without_date(text);
