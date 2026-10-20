-- app_search() deux fois plus rapide : les noms comparés une fois chacun, puis rattachés aux événements.
--
-- Mesuré en prod le 2026-10-20 après 20261020170000_create_app_search.sql (366 événements à venir,
-- x-envoy-upstream-service-time) : app_search seule ~125 ms, l'appel complet de l'app (30 événements
-- embarqués) 140 à 200 ms, au-dessus des 100 ms visés. EXPLAIN ANALYZE (lecture seule, rôle anon) : plus
-- de la moitié du temps à reconstruire les textes de chaque événement, dont les artistes et organisateurs
-- relus événement par événement sous la RLS de leurs liens (une fonction SECURITY DEFINER par lien).
--
-- Désormais : les noms des lieux, salles, artistes, organisateurs, catégories, tags et villes sont
-- normalisés et comparés aux mots de la requête une fois chacun ; seuls ceux qui correspondent sont
-- rattachés aux événements à venir par leurs liens (events.location_id, room_id, city_id, category,
-- tag_ids ; event_artists et event_organizers par artiste, organisateur ou lieu trouvé). Titre et
-- description restent comparés événement par événement. Mêmes règles, mêmes poids, même contrat : les
-- résultats sont identiques, ordre compris (28 requêtes comparées sur l'instantané, 9 en prod avant
-- l'application ; les 37 cas de supabase/tests/app_search.test.sql passent). Un mot proche par
-- trigrammes se cherche désormais nom par nom, plus sur une suite de noms : pas d'écart constaté.
--
-- Appliquée en prod le 2026-10-20 (répétition dans une transaction annulée, puis application) :
-- app_search seule 40 à 70 ms ; l'appel complet de l'app 60 à 95 ms avec peu de résultats, ~100 à
-- 120 ms avec 30 événements embarqués (embarquer 30 événements avec le select de l'app coûte ~50 à
-- 60 ms, comme la page d'un tag). Détail : docs/API_APP.md.
--
-- Prérequis : 20261020170000_create_app_search.sql. `language sql`, `stable`, `security invoker`, sans
-- clause SET, comme avant.

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
    SELECT * FROM public.app_search_query_words(app_search.query) WHERE required
  ),
  requete AS MATERIALIZED (
    SELECT min(w.phrase) AS phrase, min(w.word_count) AS nombre_mots
    FROM public.app_search_query_words(app_search.query) AS w
    HAVING count(*) > 0
  ),
  -- Les noms qui contiennent un mot de la requête : comparés une fois par lieu, salle, artiste,
  -- organisateur, catégorie, tag ou ville, pas une fois par événement.
  noms AS (
    SELECT 'lieu'::text AS sorte, l.id, NULL::text AS cle, public.app_search_normalize(l.name) AS texte
    FROM public.locations AS l WHERE EXISTS (SELECT 1 FROM requete)
    UNION ALL
    SELECT 'salle', r.id, NULL, public.app_search_normalize(r.name)
    FROM public.rooms AS r WHERE EXISTS (SELECT 1 FROM requete)
    UNION ALL
    SELECT 'artiste', ar.id, NULL, public.app_search_normalize(ar.name)
    FROM public.artists AS ar WHERE EXISTS (SELECT 1 FROM requete)
    UNION ALL
    SELECT 'organisateur', o.id, NULL, public.app_search_normalize(o.name)
    FROM public.organizers AS o WHERE EXISTS (SELECT 1 FROM requete)
    UNION ALL
    SELECT 'categorie', c.id, upper(btrim(c.name)), public.app_search_normalize(c.name)
    FROM public.categories AS c WHERE EXISTS (SELECT 1 FROM requete)
    UNION ALL
    SELECT 'tag', t.id, NULL, public.app_search_normalize(t.name)
    FROM public.tags AS t WHERE EXISTS (SELECT 1 FROM requete)
    UNION ALL
    SELECT 'ville', ci.id, NULL, public.app_search_normalize(ci.label)
    FROM public.cities AS ci WHERE EXISTS (SELECT 1 FROM requete)
  ),
  trouves AS MATERIALIZED (
    SELECT
      n.sorte,
      n.id,
      n.cle,
      m.word,
      s.score,
      q.nombre_mots > 1 AND strpos(' ' || n.texte, ' ' || q.phrase) > 0 AS phrase
    FROM noms AS n
    CROSS JOIN requete AS q
    CROSS JOIN mots AS m
    CROSS JOIN LATERAL (
      SELECT public.app_search_word_score(m.word, m.word_query, m.word_prefix, m.word_pattern, n.texte) AS score
    ) AS s
    WHERE s.score > 0
  ),
  evenements AS MATERIALIZED (
    SELECT
      e.id,
      e.date,
      e.category,
      e.tag_ids,
      e.location_id,
      e.room_id,
      coalesce(e.city_id, l.city_id) AS ville,
      public.app_search_normalize(e.title) AS titre,
      lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(e.description, ''))) AS description
    FROM public.app_events_in_range(
      date_trunc('day', coalesce(app_search.at_time, now() AT TIME ZONE 'Europe/Paris')),
      NULL,
      app_search.city_ids,
      NULL,
      app_search.at_time
    ) AS e
    LEFT JOIN public.locations AS l ON l.id = e.location_id
    WHERE EXISTS (SELECT 1 FROM requete)
  ),
  -- (événement, mot) trouvés dans un nom lié : qui et où 0,6 ; quoi et ville 0,45.
  liens AS (
    SELECT e.id AS event_id, t.word, 0.6 * t.score AS score, CASE WHEN t.phrase THEN 0.6 ELSE 0 END AS phrase
    FROM evenements AS e JOIN trouves AS t ON t.sorte = 'lieu' AND t.id = e.location_id
    UNION ALL
    SELECT e.id, t.word, 0.6 * t.score, CASE WHEN t.phrase THEN 0.6 ELSE 0 END
    FROM evenements AS e JOIN trouves AS t ON t.sorte = 'salle' AND t.id = e.room_id
    UNION ALL
    SELECT ea.event_id, t.word, 0.6 * t.score, CASE WHEN t.phrase THEN 0.6 ELSE 0 END
    FROM trouves AS t
    JOIN public.event_artists AS ea ON t.sorte = 'artiste' AND ea.artist_id = t.id
    UNION ALL
    SELECT eo.event_id, t.word, 0.6 * t.score, CASE WHEN t.phrase THEN 0.6 ELSE 0 END
    FROM trouves AS t
    JOIN public.event_organizers AS eo ON t.sorte = 'organisateur' AND eo.organizer_id = t.id
    UNION ALL
    SELECT eo.event_id, t.word, 0.6 * t.score, CASE WHEN t.phrase THEN 0.6 ELSE 0 END
    FROM trouves AS t
    JOIN public.event_organizers AS eo ON t.sorte = 'lieu' AND eo.location_id = t.id
    UNION ALL
    SELECT e.id, t.word, 0.45 * t.score, CASE WHEN t.phrase THEN 0.45 ELSE 0 END
    FROM evenements AS e
    JOIN trouves AS t ON t.sorte = 'categorie' AND (e.category = t.id::text OR upper(btrim(e.category)) = t.cle)
    UNION ALL
    SELECT e.id, t.word, 0.45 * t.score, CASE WHEN t.phrase THEN 0.45 ELSE 0 END
    FROM evenements AS e JOIN trouves AS t ON t.sorte = 'tag' AND t.id = ANY (e.tag_ids)
    UNION ALL
    SELECT e.id, t.word, 0.45 * t.score, CASE WHEN t.phrase THEN 0.45 ELSE 0 END
    FROM evenements AS e JOIN trouves AS t ON t.sorte = 'ville' AND t.id = e.ville
  ),
  meilleurs AS (
    SELECT li.event_id, li.word, max(li.score) AS score, max(li.phrase) AS phrase
    FROM liens AS li
    GROUP BY li.event_id, li.word
  ),
  par_mot AS (
    SELECT
      e.id,
      e.date,
      e.titre,
      e.description,
      m.word_prefix,
      m.word_query,
      coalesce(b.phrase, 0) AS phrase,
      greatest(
        public.app_search_word_score(m.word, m.word_query, m.word_prefix, m.word_pattern,
          e.titre, to_tsvector('pg_catalog.french', e.titre)),
        coalesce(b.score, 0)
      ) AS ailleurs
    FROM evenements AS e
    CROSS JOIN mots AS m
    LEFT JOIN meilleurs AS b ON b.event_id = e.id AND b.word = m.word
  ),
  scores AS (
    SELECT
      p.id,
      p.date,
      avg(p.meilleur)
        + CASE WHEN min(q.nombre_mots) > 1 THEN 0.4 * greatest(
            CASE WHEN strpos(' ' || min(p.titre), ' ' || min(q.phrase)) > 0 THEN 1 ELSE 0 END,
            max(p.phrase)
          ) ELSE 0 END
        + CASE WHEN min(p.titre) = min(q.phrase) THEN 0.2 ELSE 0 END AS score
    FROM (
      SELECT
        pm.id,
        pm.date,
        pm.titre,
        pm.phrase,
        CASE
          -- La description (0,25 × 0,85 au plus) ne changerait rien : pas de plein texte.
          WHEN pm.ailleurs >= 0.25 * 0.85 THEN pm.ailleurs
          WHEN pm.word_prefix IS NULL OR strpos(pm.description, pm.word_prefix) = 0 THEN pm.ailleurs
          WHEN to_tsvector('pg_catalog.french', pm.description) @@ pm.word_query THEN 0.25 * 0.85
          ELSE pm.ailleurs
        END AS meilleur
      FROM par_mot AS pm
    ) AS p
    CROSS JOIN requete AS q
    GROUP BY p.id, p.date
    HAVING bool_and(p.meilleur > 0)
  )
  SELECT s.id, (row_number() OVER (ORDER BY s.score DESC, s.date, s.id))::integer
  FROM scores AS s
  ORDER BY s.score DESC, s.date, s.id
  LIMIT greatest(1, least(coalesce(app_search.max_results, 30), 100))
$$;

COMMENT ON FUNCTION public.app_search(text, uuid[], timestamp, integer) IS
  'Recherche de l''app : événements à venir (app_events_in_range à partir d''aujourd''hui, heure de Paris, périmètre city_ids) dont chaque mot exigé de la requête se trouve dans le titre, les artistes liés, le lieu, les organisateurs, la catégorie, les tags, la ville ou la description (sans accents ni casse ; mot entier, début de mot, racine française, faute de frappe). Une ligne (event_id, rank) par événement, rank 1 le plus pertinent puis par date ; max_results au plus (1 à 100, 30 par défaut). Appel : rpc/app_search?select=rank,event:events(…)&order=rank. Règle complète : migration 20261020170000.';

GRANT EXECUTE ON FUNCTION public.app_search(text, uuid[], timestamp, integer) TO anon, authenticated;

-- Rollback : rejouer la définition d'app_search de 20261020170000_create_app_search.sql.
