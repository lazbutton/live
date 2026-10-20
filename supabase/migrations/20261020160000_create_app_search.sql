-- Recherche de l'app sur toute la base : événements à venir, et les noms qui correspondent (catégories,
-- tags, lieux, organisateurs) avec leur nombre d'événements à venir.
--
-- Audit UI/UX du 2026-10-20 (../live/docs/AMELIORATIONS.md, U1) : « concert » ne rendait qu'un
-- résultat quand la tuile Concert en annonce 47. L'app comparait en Dart le titre, le lieu et les
-- organisateurs des seuls événements chargés par l'accueil (200 au plus sur environ 370 à venir).
-- Ces fonctions cherchent dans toute la base, avec les comptes des autres fonctions de la recherche.
-- Contrat pour l'app : docs/API_APP.md (« Recherche : app_search, app_search_names »).
--
-- - app_search(query, city_ids, at_time, max_results) : les événements à venir qui correspondent, le
--   plus pertinent d'abord, puis par date : une ligne (event_id, rank) par événement, rank partant de 1.
--   Lignes de la table app_search_results, toujours vide, dont la clé étrangère vers events permet à
--   l'app d'embarquer l'événement avec son select habituel et de trier par rang en un seul appel :
--   rpc/app_search?select=rank,event:events(…)&order=rank. Un `setof events` ne garderait pas l'ordre :
--   PostgREST joint lieux et villes par hachage autour de la fonction, ce qui mélange ses lignes (vu sur
--   PostgREST v13.0.5).
-- - app_search_names(query, city_ids, at_time, max_results) : catégories, tags, lieux et
--   organisateurs dont le nom correspond, qui ont au moins un événement à venir, avec ce nombre ; rank
--   pour l'ordre (order=rank).
--
-- « À venir » : app_events_in_range(aujourd'hui 0 h, sans fin, city_ids), comme les comptes de la
-- recherche (20261019212000) : commence aujourd'hui ou après, ou dure plus de 12 h et n'est pas fini ;
-- pas terminé ; heure de Paris, ou `at_time` s'il est fourni (même format que pour les autres
-- fonctions de l'app : heure de Paris sans fuseau). Dans le périmètre (null ou vide : toutes les
-- villes) ; sans les événements masqués par l'utilisateur ni ceux des auteurs qu'il a bloqués ; avec
-- ceux retirés de l'accueil (hide_from_home). Les comptes sont donc ceux des tuiles et des tags
-- (app_category_counts, app_tag_counts) et, pour un lieu ou un organisateur, celui
-- d'app_organizer_counts.
--
-- Correspondance : texte et requête comparés sans accents ni casse, ponctuation en espaces
-- (app_search_normalize : « Théâtre d’Orléans » → « theatre d orleans »).
-- - Chaque mot de la requête doit se trouver quelque part (titre, lieu, tag…). Les mots vides
--   français (« de », « d », « la »…) et les mots d'une lettre ne sont pas exigés ; tous le sont si la
--   requête n'a que ceux-là. Une requête de moins de 2 caractères ne rend rien ; au-delà de 200
--   caractères et de 10 mots, la suite est ignorée.
-- - Un mot se trouve (app_search_word_score) : mot entier (1) ; début de mot (0,85 : « jaz » → jazz,
--   la recherche à la frappe) ; même racine française en plein texte (0,75 : « concerts » → concert) ;
--   à partir de 4 lettres, mot proche par trigrammes de pg_trgm (« concrt » → concert : 0,6 × la
--   ressemblance stricte, 0,45 au moins ; stricte : mot contre mot, pas « concert » dans « art
--   contemporain »).
-- - La description, longue, n'est lue qu'en plein texte (0,85), et seulement quand elle peut changer
--   le classement.
-- Pertinence d'un événement : pour chaque mot exigé, sa meilleure correspondance pondérée par l'endroit
-- où il se trouve : titre 1 ; artistes liés, lieu (et salle), organisateurs 0,6 ; catégorie, tags,
-- ville 0,45 ; description 0,25. Puis la moyenne sur les mots exigés, plus 0,4 × le poids de l'endroit
-- où une requête de plusieurs mots se lit d'un bloc, plus 0,2 si le titre est la requête. Pour un nom
-- (app_search_names) : même calcul sur le nom seul (poids 1), plus 0,3 si le nom est la requête.
--
-- Index : aucun. Sous la RLS d'events, ni `%` ni `@@` (fonctions non « leakproof ») ne serviraient
-- d'index : la fonction lit les événements à venir par l'index sur date (app_events_in_range) et les
-- compare tous ; le plein texte et les trigrammes ne sont calculés que pour les textes qui contiennent
-- le début de la racine ou un trigramme du mot. Mesures (instantané prod du 2026-10-20, 367 événements à
-- venir) : docs/API_APP.md.
--
-- `language sql`, `security invoker`, sans clause SET, comme app_events() : la RLS de l'appelant
-- s'applique (events, locations, organizers, artists, tags, categories…). Tous les objets sont
-- qualifiés par leur schéma, jusqu'au dictionnaire d'unaccent et aux configurations plein texte.
-- Prérequis : 20261019210000_create_app_events_in_range_and_counts.sql (app_events_in_range()) ;
-- extensions unaccent et pg_trgm, créées ci-dessous dans le schéma extensions si absentes (absentes en
-- prod le 2026-10-20 : schémas public et extensions relus par `supabase gen types`).

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Les fonctions ci-dessous appellent extensions.unaccent et extensions.strict_word_similarity : une
-- extension déjà installée ailleurs (CREATE EXTENSION IF NOT EXISTS ne la déplace pas) arrête la
-- migration.
DO $$
BEGIN
  IF (SELECT extnamespace::regnamespace::text FROM pg_catalog.pg_extension WHERE extname = 'unaccent') <> 'extensions'
    OR (SELECT extnamespace::regnamespace::text FROM pg_catalog.pg_extension WHERE extname = 'pg_trgm') <> 'extensions'
  THEN
    RAISE EXCEPTION 'unaccent et pg_trgm doivent être dans le schéma extensions';
  END IF;
END $$;

-- Texte comparable : sans accents ni casse, tout ce qui n'est ni lettre ni chiffre en un espace.
-- IMMUTABLE : le dictionnaire est nommé (pas de dépendance au search_path), comme le recommande la
-- documentation d'unaccent pour s'en servir dans une expression d'index.
CREATE OR REPLACE FUNCTION public.app_search_normalize(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT btrim(regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(value, ''))),
    '[^a-z0-9]+', ' ', 'g'
  ))
$$;

COMMENT ON FUNCTION public.app_search_normalize(text) IS
  'Recherche de l''app : texte sans accents ni casse, ce qui n''est ni lettre ni chiffre en espaces (« Théâtre d’Orléans » → « theatre d orleans »).';

GRANT EXECUTE ON FUNCTION public.app_search_normalize(text) TO anon, authenticated;

-- Les mots d'une requête, dans l'ordre : la requête normalisée entière (phrase) et leur nombre, puis
-- pour chaque mot sa racine française en préfixe (word_query, null pour un mot vide), le début de cette
-- racine (word_prefix, 4 lettres au plus : un texte où le plein texte trouve le mot le contient, une
-- racine ne changeant que la fin du mot, « musicaux » → musical), ses trigrammes intérieurs en
-- expression régulière (word_pattern, mots de 4 lettres ou plus : un texte assez proche pour les
-- trigrammes en contient au moins un) et s'il est exigé. Aucune ligne sous 2 caractères ; les 200
-- premiers caractères et les 10 premiers mots seulement.
CREATE OR REPLACE FUNCTION public.app_search_query_words(query text)
RETURNS TABLE (
  phrase text,
  word_count integer,
  word text,
  word_query tsquery,
  word_prefix text,
  word_pattern text,
  required boolean
)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH texte AS (
    -- 200 caractères et 10 mots au plus : le coût croît avec chaque mot.
    SELECT public.app_search_normalize(left(query, 200)) AS phrase
  ),
  mots AS (
    SELECT
      t.phrase,
      m.word,
      m.ordre,
      -- Racine française (« concerts » → concert) ; aucune pour un mot vide (« de », « d »). Un mot
      -- normalisé n'a que des lettres et des chiffres : une racine au plus.
      tsvector_to_array(to_tsvector('pg_catalog.french', m.word)) AS racines
    FROM texte AS t
    CROSS JOIN LATERAL unnest(string_to_array(t.phrase, ' ')) WITH ORDINALITY AS m(word, ordre)
    WHERE char_length(t.phrase) >= 2
      AND m.word <> ''
      AND m.ordre <= 10
  )
  SELECT
    m.phrase,
    (count(*) OVER ())::integer,
    m.word,
    -- Configuration simple : la racine est déjà calculée (pas de second passage, pas d'avis « mots
    -- vides »).
    to_tsquery('pg_catalog.simple', quote_literal(m.racines[1]) || ':*'),
    left(m.racines[1], 4),
    CASE WHEN char_length(m.word) >= 4 THEN (
      SELECT string_agg(substr(m.word, i, 3), '|')
      FROM generate_series(1, char_length(m.word) - 2) AS i
    ) END,
    -- Exigé : ni mot vide ni une lettre ; tous les mots si la requête n'a que ceux-là.
    CASE
      WHEN bool_or(cardinality(m.racines) > 0 AND char_length(m.word) >= 2) OVER () THEN
        cardinality(m.racines) > 0 AND char_length(m.word) >= 2
      ELSE true
    END
  FROM mots AS m
  ORDER BY m.ordre
$$;

COMMENT ON FUNCTION public.app_search_query_words(text) IS
  'Recherche de l''app : la requête normalisée et ses mots, avec leur racine française en préfixe, le début de cette racine, leurs trigrammes intérieurs et s''ils sont exigés (ni mot vide ni une lettre). Rien sous 2 caractères.';

GRANT EXECUTE ON FUNCTION public.app_search_query_words(text) TO anon, authenticated;

-- Correspondance d'un mot de la requête (une ligne d'app_search_query_words) dans un texte normalisé :
-- 0 (absent) à 1 (mot entier). document : le texte en plein texte français (to_tsvector('french', …)),
-- calculé seulement si le texte contient le début de la racine ; null pour s'en passer.
CREATE OR REPLACE FUNCTION public.app_search_word_score(
  word text,
  word_query tsquery,
  word_prefix text,
  word_pattern text,
  content text,
  document tsvector DEFAULT NULL
)
RETURNS real
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT (CASE
    WHEN coalesce(word, '') = '' OR coalesce(content, '') = '' THEN 0
    -- Mot entier : « jazz » dans « soiree jazz manouche ».
    WHEN strpos(' ' || content || ' ', ' ' || word || ' ') > 0 THEN 1
    -- Début de mot, ce qu'on tape : « jaz », « theat ».
    WHEN strpos(' ' || content, ' ' || word) > 0 THEN 0.85
    -- Même racine : « concerts », « spectacles ».
    WHEN CASE
      WHEN word_prefix IS NULL OR strpos(content, word_prefix) = 0 THEN false
      ELSE document @@ word_query
    END THEN 0.75
    -- Faute de frappe, mot contre mot : « concrt », « astrolbe ».
    WHEN CASE
      WHEN word_pattern IS NULL OR content !~ word_pattern THEN false
      ELSE extensions.strict_word_similarity(word, content) >= 0.45
    END THEN 0.6 * extensions.strict_word_similarity(word, content)
    ELSE 0
  END)::real
$$;

COMMENT ON FUNCTION public.app_search_word_score(text, tsquery, text, text, text, tsvector) IS
  'Recherche de l''app : correspondance d''un mot de la requête dans un texte normalisé (mot entier 1, début de mot 0,85, même racine en plein texte 0,75, mot proche par trigrammes 0,6 × la ressemblance stricte, 0 sinon).';

GRANT EXECUTE ON FUNCTION public.app_search_word_score(text, tsquery, text, text, text, tsvector)
  TO anon, authenticated;

-- Type des lignes d'app_search : toujours vide (aucune écriture, RLS sans politique, aucun droit).
CREATE TABLE IF NOT EXISTS public.app_search_results (
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  rank integer NOT NULL
);

COMMENT ON TABLE public.app_search_results IS
  'Toujours vide : type des lignes d''app_search() (un événement trouvé et son rang, 1 = le plus pertinent). Sa clé étrangère vers events permet à PostgREST d''embarquer l''événement : rpc/app_search?select=rank,event:events(…)&order=rank.';

ALTER TABLE public.app_search_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_search_results FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_search(
  query text,
  city_ids uuid[] DEFAULT NULL,
  at_time timestamp DEFAULT NULL,
  max_results integer DEFAULT 30
)
RETURNS SETOF public.app_search_results
LANGUAGE sql
STABLE
SECURITY INVOKER
ROWS 30
AS $$
  WITH mots AS MATERIALIZED (
    SELECT * FROM public.app_search_query_words(app_search.query)
  ),
  requete AS MATERIALIZED (
    SELECT min(m.phrase) AS phrase, min(m.word_count) AS nombre_mots
    FROM mots AS m
    HAVING count(*) > 0
  ),
  a_venir AS MATERIALIZED (
    SELECT e.id, e.date, e.title, e.description, e.category, e.tag_ids, e.location_id, e.room_id, e.city_id
    FROM public.app_events_in_range(
      date_trunc('day', coalesce(app_search.at_time, now() AT TIME ZONE 'Europe/Paris')),
      NULL,
      app_search.city_ids,
      NULL,
      app_search.at_time
    ) AS e
    -- Rien à comparer sans mot : pas de lecture des événements.
    WHERE EXISTS (SELECT 1 FROM requete)
  ),
  -- Noms des petites tables, normalisés une fois par ligne plutôt qu'une fois par événement.
  noms_lieux AS MATERIALIZED (
    SELECT l.id, l.city_id, public.app_search_normalize(l.name) AS nom
    FROM public.locations AS l
    WHERE EXISTS (SELECT 1 FROM requete)
  ),
  noms_tags AS MATERIALIZED (
    SELECT t.id, public.app_search_normalize(t.name) AS nom
    FROM public.tags AS t
    WHERE EXISTS (SELECT 1 FROM requete)
  ),
  noms_categories AS MATERIALIZED (
    SELECT c.id::text AS id, upper(btrim(c.name)) AS cle, public.app_search_normalize(c.name) AS nom
    FROM public.categories AS c
    WHERE EXISTS (SELECT 1 FROM requete)
  ),
  tags_des_evenements AS (
    SELECT a.id AS event_id, string_agg(n.nom, ' | ') AS noms
    FROM a_venir AS a
    CROSS JOIN LATERAL unnest(a.tag_ids) AS x(tag_id)
    JOIN noms_tags AS n ON n.id = x.tag_id
    GROUP BY a.id
  ),
  -- Les textes de chaque événement, par endroit : titre ; qui et où (lieu, salle, artistes liés,
  -- organisateurs) ; quoi et ville (catégorie, tags, ville) ; description (sans accents ni casse : le
  -- découpage du plein texte s'occupe de la ponctuation). Normalisés, les noms séparés par « | » : une
  -- requête ne se lit pas d'un nom sur l'autre.
  textes AS MATERIALIZED (
    SELECT
      a.id,
      a.date,
      public.app_search_normalize(a.title) AS titre,
      concat_ws(' | ', l.nom, public.app_search_normalize(r.name), artistes.noms, organisateurs.noms)
        AS qui_ou,
      -- Catégorie : par son id, ou son nom pour quelques lignes anciennes (comme app_category_counts).
      concat_ws(' | ', coalesce(cid.nom, cnom.nom), tg.noms, public.app_search_normalize(ci.label))
        AS quoi,
      lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(a.description, '')))
        AS description
    FROM a_venir AS a
    LEFT JOIN noms_lieux AS l ON l.id = a.location_id
    LEFT JOIN public.rooms AS r ON r.id = a.room_id
    LEFT JOIN public.cities AS ci ON ci.id = coalesce(a.city_id, l.city_id)
    LEFT JOIN noms_categories AS cid ON cid.id = a.category
    LEFT JOIN noms_categories AS cnom ON cnom.cle = upper(btrim(a.category))
    LEFT JOIN tags_des_evenements AS tg ON tg.event_id = a.id
    -- Liens lus par l'index sur event_id : seulement ceux des événements à venir (leur RLS coûte).
    LEFT JOIN LATERAL (
      SELECT string_agg(public.app_search_normalize(ar.name), ' | ' ORDER BY ea.sort_index) AS noms
      FROM public.event_artists AS ea
      JOIN public.artists AS ar ON ar.id = ea.artist_id
      WHERE ea.event_id = a.id
    ) AS artistes ON true
    LEFT JOIN LATERAL (
      SELECT string_agg(public.app_search_normalize(coalesce(
        (SELECT o.name FROM public.organizers AS o WHERE o.id = eo.organizer_id),
        (SELECT ol.name FROM public.locations AS ol WHERE ol.id = eo.location_id)
      )), ' | ') AS noms
      FROM public.event_organizers AS eo
      WHERE eo.event_id = a.id
    ) AS organisateurs ON true
  ),
  scores AS (
    SELECT
      t.id,
      t.date,
      s.moyenne
        -- Requête de plusieurs mots lue d'un bloc (au début d'un mot) : là où elle se lit le mieux.
        + CASE WHEN q.nombre_mots > 1 THEN 0.4 * greatest(
            CASE WHEN strpos(' ' || t.titre, ' ' || q.phrase) > 0 THEN 1 ELSE 0 END,
            CASE WHEN strpos(' ' || t.qui_ou, ' ' || q.phrase) > 0 THEN 0.6 ELSE 0 END,
            CASE WHEN strpos(' ' || t.quoi, ' ' || q.phrase) > 0 THEN 0.45 ELSE 0 END
          ) ELSE 0 END
        + CASE WHEN t.titre = q.phrase THEN 0.2 ELSE 0 END AS score
    FROM textes AS t
    CROSS JOIN requete AS q
    CROSS JOIN LATERAL (
      SELECT avg(p.meilleur) AS moyenne, bool_and(p.meilleur > 0) AS tous
      FROM mots AS m
      CROSS JOIN LATERAL (
        SELECT greatest(
          1.00 * public.app_search_word_score(m.word, m.word_query, m.word_prefix, m.word_pattern,
            t.titre, to_tsvector('pg_catalog.french', t.titre)),
          0.60 * public.app_search_word_score(m.word, m.word_query, m.word_prefix, m.word_pattern,
            t.qui_ou),
          0.45 * public.app_search_word_score(m.word, m.word_query, m.word_prefix, m.word_pattern,
            t.quoi)
        ) AS ailleurs
      ) AS p0
      CROSS JOIN LATERAL (
        SELECT CASE
          -- La description (0,25 × 0,85 au plus) ne changerait rien : pas de plein texte.
          WHEN p0.ailleurs >= 0.25 * 0.85 THEN p0.ailleurs
          WHEN m.word_prefix IS NULL OR strpos(t.description, m.word_prefix) = 0 THEN p0.ailleurs
          WHEN to_tsvector('pg_catalog.french', t.description) @@ m.word_query THEN 0.25 * 0.85
          ELSE p0.ailleurs
        END AS meilleur
      ) AS p
      WHERE m.required
    ) AS s
    WHERE s.tous
  )
  SELECT s.id, (row_number() OVER (ORDER BY s.score DESC, s.date, s.id))::integer
  FROM scores AS s
  ORDER BY s.score DESC, s.date, s.id
  LIMIT greatest(1, least(coalesce(app_search.max_results, 30), 100))
$$;

COMMENT ON FUNCTION public.app_search(text, uuid[], timestamp, integer) IS
  'Recherche de l''app : événements à venir (app_events_in_range à partir d''aujourd''hui, heure de Paris, périmètre city_ids) dont chaque mot exigé de la requête se trouve dans le titre, les artistes liés, le lieu, les organisateurs, la catégorie, les tags, la ville ou la description (sans accents ni casse ; mot entier, début de mot, racine française, faute de frappe). Une ligne (event_id, rank) par événement, rank 1 le plus pertinent puis par date ; max_results au plus (1 à 100, 30 par défaut). Appel : rpc/app_search?select=rank,event:events(…)&order=rank. Règle complète : migration 20261020160000.';

GRANT EXECUTE ON FUNCTION public.app_search(text, uuid[], timestamp, integer) TO anon, authenticated;

-- Noms qui correspondent à la requête, au plus max_results de chaque sorte (1 à 50, 10 par défaut) :
-- - kind = 'category' : catégorie active ; events_count comme app_category_counts (par id ou nom) ;
-- - kind = 'tag' : events_count comme app_tag_counts ;
-- - kind = 'location' : lieu ; events_count comme app_organizer_counts (événements qui s'y tiennent et
--   ceux qu'il organise, chacun une fois), plus ceux d'un organisateur qui porte le même nom (normalisé)
--   et n'est pas rendu à part (l'app les réunit déjà) ; is_organizer : il organise au moins un de ces
--   événements ; image_url : celle du lieu ; city : sa ville ;
-- - kind = 'organizer' : organisateur ; events_count comme app_organizer_counts ; image_url : son logo,
--   à défaut son icône.
-- Seulement ceux qui ont au moins un événement à venir. rank (à partir de 1) : par sorte (catégories,
-- tags, lieux, organisateurs), puis le plus pertinent, le plus fourni, par nom ; l'app trie dessus
-- (order=rank), PostgREST ne garantissant pas l'ordre d'une fonction.
CREATE OR REPLACE FUNCTION public.app_search_names(
  query text,
  city_ids uuid[] DEFAULT NULL,
  at_time timestamp DEFAULT NULL,
  max_results integer DEFAULT 10
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
      app_search_names.at_time
    ) AS e
    WHERE EXISTS (SELECT 1 FROM trouves)
  ),
  -- Organisateur qui porte le nom d'un lieu : compté avec le lieu, trouvé lui aussi (même nom).
  homonymes AS MATERIALIZED (
    SELECT o.id AS organizer_id, min(l.id::text)::uuid AS location_id
    FROM trouves AS o
    JOIN trouves AS l ON l.sorte = 'location' AND l.texte = o.texte
    WHERE o.sorte = 'organizer'
    GROUP BY o.id
  ),
  -- (nom trouvé, événement à venir) et si le lien en fait un organisateur.
  liens AS (
    SELECT t.id AS entite, a.id AS event_id, false AS organise
    FROM trouves AS t
    JOIN public.categories AS c ON c.id = t.id
    JOIN a_venir AS a ON a.category = c.id::text OR upper(btrim(a.category)) = upper(btrim(c.name))
    WHERE t.sorte = 'category'
    UNION ALL
    SELECT t.id, a.id, false
    FROM trouves AS t
    JOIN a_venir AS a ON t.id = ANY (a.tag_ids)
    WHERE t.sorte = 'tag'
    UNION ALL
    SELECT t.id, a.id, false
    FROM trouves AS t
    JOIN a_venir AS a ON a.location_id = t.id
    WHERE t.sorte = 'location'
    UNION ALL
    SELECT t.id, a.id, true
    FROM trouves AS t
    JOIN public.event_organizers AS eo ON eo.location_id = t.id
    JOIN a_venir AS a ON a.id = eo.event_id
    WHERE t.sorte = 'location'
    UNION ALL
    SELECT coalesce(h.location_id, t.id), a.id, true
    FROM trouves AS t
    JOIN public.event_organizers AS eo ON eo.organizer_id = t.id
    JOIN a_venir AS a ON a.id = eo.event_id
    LEFT JOIN homonymes AS h ON h.organizer_id = t.id
    WHERE t.sorte = 'organizer'
  ),
  comptes AS (
    SELECT li.entite, count(DISTINCT li.event_id)::integer AS nombre, bool_or(li.organise) AS organise
    FROM liens AS li
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

COMMENT ON FUNCTION public.app_search_names(text, uuid[], timestamp, integer) IS
  'Recherche de l''app : catégories, tags, lieux et organisateurs dont le nom correspond à la requête (règles d''app_search), avec leur nombre d''événements à venir (comptes d''app_category_counts, app_tag_counts, app_organizer_counts) ; au moins un ; max_results au plus de chaque sorte (1 à 50, 10 par défaut).';

GRANT EXECUTE ON FUNCTION public.app_search_names(text, uuid[], timestamp, integer) TO anon, authenticated;

-- Vérification (SQL Editor) :
-- select s.rank, e.title, e.date from public.app_search('concert') as s join public.events as e on e.id = s.event_id order by s.rank;
-- select kind, name, events_count from public.app_search_names('theatre d orleans');

-- Rollback (les extensions restent : d'autres objets peuvent s'en servir) :
-- DROP FUNCTION IF EXISTS public.app_search_names(text, uuid[], timestamp, integer);
-- DROP FUNCTION IF EXISTS public.app_search(text, uuid[], timestamp, integer);
-- DROP TABLE IF EXISTS public.app_search_results;
-- DROP FUNCTION IF EXISTS public.app_search_word_score(text, tsquery, text, text, text, tsvector);
-- DROP FUNCTION IF EXISTS public.app_search_query_words(text);
-- DROP FUNCTION IF EXISTS public.app_search_normalize(text);
