-- « Cet événement existe peut-être déjà » : les événements publiés qui ressemblent à une proposition.
--
-- Audit UI/UX du 2026-10-20 (../live/docs/AMELIORATIONS.md, partie E, point 6) et maquettes du lot 2
-- (« Proposer, affiche lue ») : avant l'envoi d'une proposition, l'app montre l'événement déjà publié
-- qui lui ressemble, avec « Voir la fiche » et « Ce n'est pas le même ». La règle vit ici, pas en Dart,
-- pour que l'admin puisse la reprendre (relecture des demandes, collecte) : c'est celle de la collecte
-- (findDuplicateEvent, lib/agent/events.ts), réduite à ce qu'une proposition de l'app connaît. Contrat
-- pour l'app : docs/API_APP.md (« Proposer : app_possible_duplicates »).
--
-- app_possible_duplicates(title, starts_at, location_id, link, at_time, max_results) : une ligne par
-- événement ressemblant, de la table app_possible_duplicate_results, toujours vide, dont la clé
-- étrangère vers events permet à l'app d'embarquer l'événement avec son select habituel et de trier les
-- lignes, en un seul appel (un `setof events` trié par la fonction perdrait son ordre dans PostgREST,
-- comme pour app_search et app_see_also) :
-- rpc/app_possible_duplicates?select=rank,reason,event:events(…)&order=rank
--
-- Les candidats sont les événements à venir d'app_events_in_range, donc d'app_events() (visibles dans
-- l'app) : à partir d'aujourd'hui 0 h (heure de Paris, ou at_time), expositions en cours comprises, pas
-- terminés, toutes villes, sans ceux que l'utilisateur a masqués ni ceux des auteurs qu'il a bloqués.
-- Trois raisons (reason), de la plus sûre à la moins sûre :
-- - 'link' : le lien proposé (link) est celui de l'événement : external_url, facebook_url, instagram_url,
--   ou scraping_url (la page d'où la collecte l'a importé). Comparés comme le fait la collecte
--   (urlMatchKeys, lib/scraping/agenda.ts) par app_link_keys : sans protocole, « www. », fragment,
--   paramètres de suivi ni slash final, en minuscules ; le chemin seul suffit quand son dernier segment
--   est assez précis (8 caractères au moins, pas une page .php, .asp(x) ou .htm(l)) ;
-- - 'place' : même lieu (location_id) et début à deux heures près de starts_at (la fenêtre de la collecte
--   pour les agendas partagés, SHARED_AGENDA_VENUE_WINDOW_MINUTES) ;
-- - 'title' : titre équivalent (app_similar_titles : la règle similarTitles de la collecte) le jour de
--   starts_at, ou pendant ce jour pour un événement en cours (exposition).
-- starts_at, comme events.date pour l'app, est l'heure de Paris sans fuseau. Un événement qui a plusieurs
-- raisons prend la plus sûre. Rang (rank, à partir de 1) : par raison, puis du plus proche de starts_at
-- au plus loin, puis par date et id ; au plus max_results lignes (1 à 5, 3 par défaut). Sans lien, ni
-- date : aucune ligne.
--
-- `language sql`, `stable`, `security invoker`, sans clause SET, comme app_events() : la RLS de
-- l'appelant s'applique. Les deux règles de comparaison (app_link_keys, app_similar_titles) sont des
-- fonctions `immutable` à part, réutilisables. Prérequis : 20261019210000 (app_events_in_range) et
-- 20261020170000 (app_search_normalize).

-- Type des lignes d'app_possible_duplicates : toujours vide (aucune écriture, RLS sans politique, aucun
-- droit).
CREATE TABLE IF NOT EXISTS public.app_possible_duplicate_results (
  rank integer NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  reason text NOT NULL
);

COMMENT ON TABLE public.app_possible_duplicate_results IS
  'Toujours vide : type des lignes d''app_possible_duplicates() (un événement publié qui ressemble à une proposition, son rang et sa raison). Sa clé étrangère vers events permet à PostgREST d''embarquer l''événement : rpc/app_possible_duplicates?select=rank,reason,event:events(…)&order=rank.';

ALTER TABLE public.app_possible_duplicate_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_possible_duplicate_results FROM PUBLIC, anon, authenticated;

-- Clés de comparaison d'un lien, comme urlMatchKeys (lib/scraping/agenda.ts) : la clé entière (sans
-- protocole, « www. », fragment, paramètres de suivi ni slash final, en minuscules), puis, si le dernier
-- segment du chemin est assez précis et que le lien a des paramètres, le chemin seul. Null pour ce qui
-- n'est pas un lien http(s).
CREATE OR REPLACE FUNCTION public.app_link_keys(link text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH lien AS (
    SELECT split_part(btrim(app_link_keys.link), '#', 1) AS brut
    WHERE btrim(coalesce(app_link_keys.link, '')) ~* '^https?://[^/?#[:space:]]+'
  ),
  morceaux AS (
    SELECT
      regexp_replace(split_part(l.brut, '?', 1), '^https?://(www\.)?', '', 'i') AS chemin,
      CASE WHEN strpos(l.brut, '?') > 0 THEN substr(l.brut, strpos(l.brut, '?') + 1) ELSE '' END
        AS parametres
    FROM lien AS l
  ),
  cle AS (
    SELECT
      lower(regexp_replace(m.chemin, '/$', '')) AS chemin,
      lower(coalesce((
        SELECT string_agg(p.parametre, '&' ORDER BY p.position)
        FROM unnest(string_to_array(m.parametres, '&')) WITH ORDINALITY AS p (parametre, position)
        WHERE p.parametre <> ''
          AND split_part(p.parametre, '=', 1)
            !~* '^(utm_[[:alnum:]_]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igsh|igshid|_ga|ref|ref_src)$'
      ), '')) AS parametres
    FROM morceaux AS m
  )
  SELECT CASE
    WHEN c.chemin = '' THEN NULL
    WHEN c.parametres = '' THEN ARRAY[c.chemin]
    WHEN strpos(c.chemin, '/') > 0
      AND length(regexp_replace(c.chemin, '^.*/', '')) >= 8
      AND regexp_replace(c.chemin, '^.*/', '') !~* '\.(php|aspx?|html?)$'
      THEN ARRAY[c.chemin || '?' || c.parametres, c.chemin]
    ELSE ARRAY[c.chemin || '?' || c.parametres]
  END
  FROM cle AS c
$$;

COMMENT ON FUNCTION public.app_link_keys(text) IS
  'Clés de comparaison d''un lien (comme urlMatchKeys de la collecte) : sans protocole, « www. », fragment, paramètres de suivi ni slash final, en minuscules ; plus le chemin seul quand son dernier segment est précis. Deux liens désignent la même page si leurs clés se recoupent (&&). Null hors http(s).';

GRANT EXECUTE ON FUNCTION public.app_link_keys(text) TO anon, authenticated;

-- Titres équivalents, comme similarTitles de la collecte (lib/agent/events.ts), sur les titres
-- normalisés d'app_search_normalize (sans accents, casse ni ponctuation) : identiques, l'un contenu dans
-- l'autre (le plus court a 6 caractères au moins), ou mots de plus de 2 lettres communs à 60 % au moins
-- (communs / tous les mots des deux titres).
CREATE OR REPLACE FUNCTION public.app_similar_titles(left_title text, right_title text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH titres AS (
    SELECT
      public.app_search_normalize(app_similar_titles.left_title) AS a,
      public.app_search_normalize(app_similar_titles.right_title) AS b
  ),
  mots AS (
    SELECT
      t.a,
      t.b,
      ARRAY(SELECT DISTINCT m FROM unnest(string_to_array(t.a, ' ')) AS m WHERE length(m) > 2) AS mots_a,
      ARRAY(SELECT DISTINCT m FROM unnest(string_to_array(t.b, ' ')) AS m WHERE length(m) > 2) AS mots_b
    FROM titres AS t
  ),
  communs AS (
    SELECT
      m.*,
      (SELECT count(*) FROM unnest(m.mots_a) AS x WHERE x = ANY (m.mots_b)) AS nombre
    FROM mots AS m
  )
  SELECT CASE
    WHEN c.a = '' OR c.b = '' THEN false
    WHEN c.a = c.b THEN true
    WHEN least(length(c.a), length(c.b)) >= 6 AND (strpos(c.a, c.b) > 0 OR strpos(c.b, c.a) > 0) THEN true
    WHEN cardinality(c.mots_a) = 0 OR cardinality(c.mots_b) = 0 THEN false
    ELSE c.nombre::numeric / (cardinality(c.mots_a) + cardinality(c.mots_b) - c.nombre) >= 0.6
  END
  FROM communs AS c
$$;

COMMENT ON FUNCTION public.app_similar_titles(text, text) IS
  'Titres équivalents (règle similarTitles de la collecte) : normalisés par app_search_normalize, identiques, l''un contenu dans l''autre (6 caractères au moins), ou mots de plus de 2 lettres communs à 60 %.';

GRANT EXECUTE ON FUNCTION public.app_similar_titles(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_possible_duplicates(
  title text DEFAULT NULL,
  starts_at timestamp DEFAULT NULL,
  location_id uuid DEFAULT NULL,
  link text DEFAULT NULL,
  at_time timestamp DEFAULT NULL,
  max_results integer DEFAULT 3
)
RETURNS SETOF public.app_possible_duplicate_results
LANGUAGE sql
STABLE
SECURITY INVOKER
ROWS 3
AS $$
  WITH proposition AS MATERIALIZED (
    SELECT
      nullif(btrim(app_possible_duplicates.title), '') AS titre,
      app_possible_duplicates.starts_at AS debut,
      date_trunc('day', app_possible_duplicates.starts_at) AS jour,
      app_possible_duplicates.location_id AS lieu,
      public.app_link_keys(app_possible_duplicates.link) AS liens,
      date_trunc('day', coalesce(app_possible_duplicates.at_time, now() AT TIME ZONE 'Europe/Paris'))
        AS aujourdhui,
      greatest(1, least(coalesce(app_possible_duplicates.max_results, 3), 5)) AS nombre
  ),
  -- Les événements à venir, toutes villes ; rien à lire sans lien ni date.
  a_venir AS MATERIALIZED (
    SELECT
      e.id,
      e.title,
      e.location_id,
      e.date AT TIME ZONE 'UTC' AS debut,
      e.end_date AT TIME ZONE 'UTC' AS fin,
      e.external_url,
      e.facebook_url,
      e.instagram_url,
      e.scraping_url
    FROM proposition AS p
    CROSS JOIN LATERAL public.app_events_in_range(p.aujourdhui, NULL, NULL, NULL, app_possible_duplicates.at_time) AS e
    WHERE p.liens IS NOT NULL OR p.debut IS NOT NULL
  ),
  -- La raison la plus sûre de chaque événement : 1 lien, 2 lieu, 3 titre ; null : aucune.
  raisons AS (
    SELECT
      a.id,
      a.debut,
      CASE
        WHEN p.liens IS NOT NULL
          AND (
            public.app_link_keys(a.external_url) && p.liens
            OR public.app_link_keys(a.facebook_url) && p.liens
            OR public.app_link_keys(a.instagram_url) && p.liens
            OR public.app_link_keys(a.scraping_url) && p.liens
          )
          THEN 1
        WHEN p.lieu IS NOT NULL
          AND p.debut IS NOT NULL
          AND a.location_id = p.lieu
          AND a.debut >= p.debut - interval '2 hours'
          AND a.debut <= p.debut + interval '2 hours'
          THEN 2
        WHEN p.titre IS NOT NULL
          AND p.debut IS NOT NULL
          AND date_trunc('day', a.debut) <= p.jour
          AND coalesce(a.fin, a.debut) >= p.jour
          AND public.app_similar_titles(a.title, p.titre)
          THEN 3
      END AS niveau,
      abs(extract(epoch FROM a.debut - coalesce(p.debut, a.debut))) AS ecart
    FROM a_venir AS a
    CROSS JOIN proposition AS p
  )
  SELECT
    (row_number() OVER (ORDER BY r.niveau, r.ecart, r.debut, r.id))::integer AS rank,
    r.id AS event_id,
    CASE r.niveau WHEN 1 THEN 'link' WHEN 2 THEN 'place' ELSE 'title' END AS reason
  FROM raisons AS r
  WHERE r.niveau IS NOT NULL
  ORDER BY r.niveau, r.ecart, r.debut, r.id
  LIMIT (SELECT p.nombre FROM proposition AS p)
$$;

COMMENT ON FUNCTION public.app_possible_duplicates(text, timestamp, uuid, text, timestamp, integer) IS
  'Proposer (app) : les événements à venir d''app_events() qui ressemblent à une proposition, une ligne par événement (rank, event_id, reason) : même lien (''link''), même lieu à deux heures près (''place''), titre équivalent le même jour (''title''). Règle complète : migration 20261021201000.';

GRANT EXECUTE ON FUNCTION public.app_possible_duplicates(text, timestamp, uuid, text, timestamp, integer)
  TO anon, authenticated;
