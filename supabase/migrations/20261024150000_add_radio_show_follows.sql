-- Suivre une émission de radio : « Tes émissions » sur la page Radio Campus, les émissions dans « Mes suivis ».
--
-- Étape 1 de ../live/docs/chantiers/radio-suivre.md (choix et maquettes validés par l'utilisateur le 2026-10-24) :
-- « Suivre » sur la page d'une émission ou dans le lecteur de l'app ; son dernier épisode attend dans « Tes
-- émissions », en tête de la page Radio Campus, marqué « Nouveau » tant qu'il n'est pas commencé sur le téléphone ;
-- l'émission rejoint « Mes suivis ». Sans notification pour commencer : follows_digest() ne change pas (étape 4).
-- Contrat pour l'app : docs/API_APP.md, « Suivis » et « Radio ». Prérequis : 20261021141000_create_user_follows.sql,
-- 20261023190000_count_festival_frames_on_pages.sql (dernière définition d'app_follows),
-- 20261023140000_create_radio_tables.sql, 20261023141000_create_app_radio_functions.sql (radio_show_is_active,
-- radio_show_letter), 20261023235000_add_radio_show_images.sql (radio_shows.image_url) et
-- 20261023180000_add_festival_audience_metric.sql (dernière liste d'app_audience_add).
--
-- - user_follows.target_type accepte radio_show (target_id : l'id de l'émission dans radio_shows) :
--   - check_user_follow_target() refuse une émission qui n'existe pas (23503, comme une clé étrangère) ;
--   - une émission d'une station éteinte (radio_stations.enabled à faux) ne se suit pas : la RLS la cache, et une
--     politique restrictive refuse le suivi de ce qu'on ne voit pas (42501). Pas dans le trigger : la recopie
--     invité → compte (copy_guest_data, inchangée, security definer) doit pouvoir emporter les suivis déjà en base
--     d'une station éteinte depuis, qui restent ;
--   - une émission supprimée emporte ses suivis (trg_radio_shows_delete_follows), une station supprimée aussi (ses
--     émissions partent en cascade, le trigger se déclenche pour chacune).
-- - app_follows(at_time) : « Mes suivis » gagne les émissions suivies d'une station allumée (la RLS de radio_shows) :
--   name (son nom), image_url (son visuel gardé ; null : la pochette que l'app dessine), upcoming_count à 0,
--   new_count (ses épisodes arrivés dans OutLive, radio_episodes.created_at, depuis 7 jours et depuis le début du
--   suivi), et trois colonnes en fin, null pour les autres suivis : last_episode_id et last_episode_at (son dernier
--   épisode, par aired_at, l'heure de Paris étiquetée UTC), show_family (musique ou parole). Les règles des lieux,
--   organisateurs et artistes ne changent pas (définition de 20261023190000), le tri non plus (du nouveau d'abord,
--   puis le plus d'événements à venir, puis le nom). Le type de retour change : supprimée puis recréée, droits
--   compris. Une version de l'app qui ne connaît pas radio_show ignore ces lignes (FollowTargetType.fromValue rend
--   null) et les colonnes en plus.
-- - app_radio_followed(p_station, p_at) : « Tes émissions », les émissions suivies par l'appelant sur cette
--   station, actives ou en pause, avec les colonnes d'app_radio_shows, is_active (radio_show_is_active : un épisode
--   depuis 45 jours), leur dernier épisode (episode_*, par aired_at ; null si elle n'en a aucun), is_new (ce dernier
--   épisode est arrivé dans OutLive depuis 7 jours et depuis le début du suivi) et followed_at ; le plus récent
--   épisode d'abord. Une station éteinte : rien. Exécutable par authenticated seulement (invités compris).
-- - app_audience_add(day, counts) : deux compteurs de plus, radio_show_follow (une émission suivie) et
--   radio_followed_play (un épisode lancé depuis « Tes émissions »), dans ses deux listes (contrainte de la table
--   et fonction). Les migrations d'avant qui les posent (20261023142000, 20261023180000), en prod depuis le
--   2026-10-23, ne se rejouent plus : elles retireraient ces deux clés.
--
-- Rien d'autre ne change : copy_guest_data recopie tous les suivis quel que soit leur type ; follows_digest ne lit que
-- les lieux, organisateurs, artistes et festivals en favori. `language sql`, `stable`, `security invoker` pour les
-- fonctions de l'app (sous la RLS de l'appelant : ses suivis seulement, une station allumée) ; tous les objets sont
-- qualifiés. À appliquer d'un bloc (`psql --single-transaction`) ; pas de BEGIN ni de COMMIT ici.

-- user_follows : le type radio_show ----------------------------------------------------------------------------

ALTER TABLE public.user_follows DROP CONSTRAINT IF EXISTS user_follows_target_type_check;
ALTER TABLE public.user_follows ADD CONSTRAINT user_follows_target_type_check
  CHECK (target_type = ANY (ARRAY['location'::text, 'organizer'::text, 'artist'::text, 'radio_show'::text]));

COMMENT ON TABLE public.user_follows IS
  'Suivis (U8) : un utilisateur (invités compris) suit un lieu, un organisateur, un artiste ou une émission de radio. Chacun ne lit et n''écrit que ses lignes.';
COMMENT ON COLUMN public.user_follows.target_type IS
  'location (lieu, y compris un lieu qui organise), organizer (ligne d''organizers), artist ou radio_show (émission de radio_shows, d''une station allumée).';
COMMENT ON COLUMN public.user_follows.target_id IS
  'Id de la cible dans locations, organizers, artists ou radio_shows (vérifié à l''écriture, retiré avec elle).';
COMMENT ON COLUMN public.user_follows.created_at IS
  'Début du suivi : les événements publiés avant, et les épisodes arrivés avant, ne sont ni « nouveaux » ni notifiés.';

CREATE OR REPLACE FUNCTION public.check_user_follow_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Un type inconnu est refusé par user_follows_target_type_check.
  -- CASE entre parenthèses : sinon son THEN finirait la condition du IF.
  -- Une émission d'une station éteinte existe : refusée par la RLS (politique restrictive), pas ici.
  IF NEW.target_type = ANY (ARRAY['location', 'organizer', 'artist', 'radio_show'])
    AND NOT (CASE NEW.target_type
      WHEN 'location' THEN EXISTS (SELECT 1 FROM public.locations AS t WHERE t.id = NEW.target_id)
      WHEN 'organizer' THEN EXISTS (SELECT 1 FROM public.organizers AS t WHERE t.id = NEW.target_id)
      WHEN 'radio_show' THEN EXISTS (SELECT 1 FROM public.radio_shows AS t WHERE t.id = NEW.target_id)
      ELSE EXISTS (SELECT 1 FROM public.artists AS t WHERE t.id = NEW.target_id)
    END)
  THEN
    RAISE EXCEPTION 'user_follows : cible introuvable (%, %)', NEW.target_type, NEW.target_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.check_user_follow_target() IS
  'Trigger de user_follows : refuse (23503) un suivi dont la cible n''existe pas dans locations, organizers, artists ou radio_shows.';

COMMENT ON FUNCTION public.delete_follows_of_target() IS
  'Trigger de locations, organizers, artists et radio_shows : retire les suivis de la ligne supprimée (TG_ARGV[0] : son target_type).';

DROP TRIGGER IF EXISTS trg_radio_shows_delete_follows ON public.radio_shows;
CREATE TRIGGER trg_radio_shows_delete_follows
  AFTER DELETE ON public.radio_shows
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_follows_of_target('radio_show');

-- Suivre une émission qu'on voit : sous la RLS de l'appelant, radio_shows ne rend que les émissions des stations
-- allumées. Restrictive : s'ajoute (ET) à « Users can create their own follows », sans rien changer pour les
-- autres types. La recopie invité → compte et le service role passent outre la RLS.
DROP POLICY IF EXISTS "Users can only follow visible radio shows" ON public.user_follows;
CREATE POLICY "Users can only follow visible radio shows"
  ON public.user_follows
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    target_type <> 'radio_show'
    OR target_id IN (SELECT s.id FROM public.radio_shows AS s)
  );

-- « Mes suivis » ------------------------------------------------------------------------------------------------
--
-- La définition de 20261023190000 pour les lieux, organisateurs et artistes (cibles, a_venir, programmes, liens,
-- evenements), et les émissions suivies (emissions). Colonnes en plus, en fin : last_episode_id, last_episode_at,
-- show_family (null pour les autres suivis).

DROP FUNCTION IF EXISTS public.app_follows(timestamp);

CREATE FUNCTION public.app_follows(at_time timestamp DEFAULT NULL)
RETURNS TABLE (
  target_type text,
  target_id uuid,
  name text,
  image_url text,
  upcoming_count integer,
  new_count integer,
  followed_at timestamptz,
  last_episode_id uuid,
  last_episode_at timestamptz,
  show_family text
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
  ),
  evenements AS (
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
  ),
  -- Les émissions suivies, d'une station allumée (la RLS de radio_shows et de radio_episodes) : leur dernier
  -- épisode, et ceux arrivés dans OutLive (created_at, un vrai instant) depuis 7 jours et depuis le début du suivi.
  emissions AS (
    SELECT
      f.target_type,
      f.target_id,
      s.name,
      nullif(btrim(s.image_url), '') AS image_url,
      0 AS upcoming_count,
      (
        SELECT count(*)::integer
        FROM public.radio_episodes AS e
        WHERE e.show_id = s.id
          AND e.created_at > greatest(f.created_at, m.instant - interval '7 days')
      ) AS new_count,
      f.created_at AS followed_at,
      d.id AS last_episode_id,
      d.aired_at AS last_episode_at,
      s.family AS show_family
    FROM public.user_follows AS f
    JOIN public.radio_shows AS s ON s.id = f.target_id
    CROSS JOIN maintenant AS m
    LEFT JOIN LATERAL (
      SELECT e.id, e.aired_at
      FROM public.radio_episodes AS e
      WHERE e.show_id = s.id
      ORDER BY e.aired_at DESC, e.id
      LIMIT 1
    ) AS d ON true
    WHERE f.user_id = (SELECT auth.uid()) AND f.target_type = 'radio_show'
  )
  SELECT
    t.target_type, t.target_id, t.name, t.image_url, t.upcoming_count, t.new_count, t.followed_at,
    t.last_episode_id, t.last_episode_at, t.show_family
  FROM (
    SELECT
      ev.target_type, ev.target_id, ev.name, ev.image_url, ev.upcoming_count, ev.new_count, ev.followed_at,
      NULL::uuid AS last_episode_id, NULL::timestamptz AS last_episode_at, NULL::text AS show_family
    FROM evenements AS ev
    UNION ALL
    SELECT
      em.target_type, em.target_id, em.name, em.image_url, em.upcoming_count, em.new_count, em.followed_at,
      em.last_episode_id, em.last_episode_at, em.show_family
    FROM emissions AS em
  ) AS t
  ORDER BY t.new_count > 0 DESC, t.upcoming_count DESC, t.name, t.target_id
$$;

COMMENT ON FUNCTION public.app_follows(timestamp) IS
  'Mes suivis (U8) : les suivis de l''appelant, leur cible (nom, image), ses événements à venir (comme app_organizer_counts, et pour un artiste ses événements ; sans les fiches que la page de la cible montre dans « Festivals ») et ceux publiés depuis 7 jours et depuis le suivi ; une émission de radio (station allumée) : ses épisodes arrivés depuis 7 jours et depuis le suivi, son dernier épisode et sa famille. Règle complète : migrations 20261021141000, 20261023190000 et 20261024150000.';

REVOKE ALL ON FUNCTION public.app_follows(timestamp) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_follows(timestamp) TO authenticated;

-- « Tes émissions » ---------------------------------------------------------------------------------------------
--
-- app_radio_followed(p_station, p_at) : une ligne par émission de p_station suivie par l'appelant, active ou en
-- pause (une émission suivie le reste pendant ses vacances d'été) :
-- - les colonnes d'app_radio_shows (id … image_url), puis is_active : un épisode depuis 45 jours
--   (radio_show_is_active, la règle d'app_radio_shows ; à faux, « dernier épisode le 2 juillet ») ;
-- - son dernier épisode, par aired_at : episode_id, episode_aired_at (l'heure de Paris étiquetée UTC),
--   episode_duration_s, episode_audio_url, episode_page_url ; null si elle n'en a aucun ;
-- - is_new : ce dernier épisode est arrivé dans OutLive (radio_episodes.created_at, l'heure de l'import) depuis
--   7 jours et depuis le début du suivi. L'app le retire dès qu'il est commencé sur le téléphone : la base ne sait
--   pas ce qu'on écoute ;
-- - followed_at : le début du suivi.
-- Tri : le plus récent épisode d'abord, puis le nom. p_at (heure de Paris, sans fuseau) remplace « maintenant »
-- pour les tests ; l'app ne l'envoie pas. Une station éteinte : aucune ligne (la RLS de radio_shows).

CREATE OR REPLACE FUNCTION public.app_radio_followed(p_station uuid, p_at timestamp DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  style text,
  family text,
  slots jsonb,
  last_episode_at timestamptz,
  organizer_id uuid,
  description text,
  page_url text,
  letter text,
  image_url text,
  is_active boolean,
  episode_id uuid,
  episode_aired_at timestamptz,
  episode_duration_s integer,
  episode_audio_url text,
  episode_page_url text,
  is_new boolean,
  followed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH maintenant AS (
    SELECT
      coalesce(p_at, now() AT TIME ZONE 'Europe/Paris') AS paris,
      coalesce(p_at AT TIME ZONE 'Europe/Paris', now()) AS instant
  )
  SELECT
    s.id,
    s.slug,
    s.name,
    s.style,
    s.family,
    s.slots,
    s.last_episode_at,
    s.organizer_id,
    s.description,
    s.page_url,
    public.radio_show_letter(s.name),
    s.image_url,
    public.radio_show_is_active(s.last_episode_at, m.paris),
    d.id,
    d.aired_at,
    d.duration_s,
    d.audio_url,
    d.page_url,
    coalesce(d.created_at > greatest(f.created_at, m.instant - interval '7 days'), false),
    f.created_at
  FROM public.user_follows AS f
  JOIN public.radio_shows AS s ON s.id = f.target_id
  CROSS JOIN maintenant AS m
  LEFT JOIN LATERAL (
    SELECT e.id, e.aired_at, e.duration_s, e.audio_url, e.page_url, e.created_at
    FROM public.radio_episodes AS e
    WHERE e.show_id = s.id
    ORDER BY e.aired_at DESC, e.id
    LIMIT 1
  ) AS d ON true
  WHERE f.user_id = (SELECT auth.uid())
    AND f.target_type = 'radio_show'
    AND s.station_id = p_station
  ORDER BY d.aired_at DESC NULLS LAST, s.name, s.id
$$;

COMMENT ON FUNCTION public.app_radio_followed(uuid, timestamp) IS
  'Radio (app) : « Tes émissions », les émissions de la station suivies par l''appelant, actives ou en pause (is_active), avec leur dernier épisode et is_new (arrivé dans OutLive depuis 7 jours et depuis le suivi) ; le plus récent épisode d''abord. Dates : heure de Paris étiquetée UTC. Migration 20261024150000.';

REVOKE ALL ON FUNCTION public.app_radio_followed(uuid, timestamp) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_radio_followed(uuid, timestamp) TO authenticated;

-- Mesure d'audience : deux compteurs ----------------------------------------------------------------------------
--
-- Les listes de 20261023180000, et radio_show_follow, radio_followed_play.

ALTER TABLE public.app_audience_counts DROP CONSTRAINT IF EXISTS app_audience_counts_metric_check;
ALTER TABLE public.app_audience_counts ADD CONSTRAINT app_audience_counts_metric_check CHECK (metric IN (
  -- Même liste que dans app_audience_add : les changer ensemble.
  'event_opened', 'ticket_tapped', 'search_no_result', 'when_sheet_used', 'event_liked',
  'radio_live_play', 'radio_episode_play', 'festival_opened', 'radio_show_follow', 'radio_followed_play'
));

CREATE OR REPLACE FUNCTION public.app_audience_add(day date, counts jsonb)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH bornes AS (
    SELECT (now() AT TIME ZONE 'Europe/Paris')::date AS aujourdhui
  ),
  purge AS (
    DELETE FROM public.app_audience_counts AS c
    USING bornes AS b
    WHERE c.day < (b.aujourdhui - interval '25 months')::date
  ),
  ajouts AS (
    SELECT
      e.key AS metric,
      CASE WHEN jsonb_typeof(e.value) = 'number'
        THEN greatest(least(floor(e.value::numeric), 200), 0)::integer
      END AS n
    FROM bornes AS b,
      jsonb_each(CASE WHEN jsonb_typeof(app_audience_add.counts) = 'object'
        THEN app_audience_add.counts ELSE '{}'::jsonb END) AS e
    WHERE app_audience_add.day BETWEEN b.aujourdhui - 7 AND b.aujourdhui
      -- Même liste que la contrainte de la table : les changer ensemble.
      AND e.key IN (
        'event_opened', 'ticket_tapped', 'search_no_result', 'when_sheet_used', 'event_liked',
        'radio_live_play', 'radio_episode_play', 'festival_opened', 'radio_show_follow', 'radio_followed_play'
      )
      AND jsonb_typeof(e.value) = 'number'
  ),
  ecrits AS (
    INSERT INTO public.app_audience_counts AS c (day, metric, count)
    SELECT app_audience_add.day, a.metric, a.n
    FROM ajouts AS a
    WHERE a.n >= 1
    ON CONFLICT (day, metric) DO UPDATE SET count = c.count + excluded.count
    RETURNING 1
  )
  SELECT count(*)::integer FROM ecrits
$$;

COMMENT ON FUNCTION public.app_audience_add(date, jsonb) IS
  'Mesure d''audience de l''app (U41) : ajoute au jour donné (7 derniers jours, heure de Paris) les compteurs connus, de 1 à 200 chacun par appel ; le reste est ignoré. Sans identité. Rend le nombre de compteurs ajoutés. Compteurs : migrations 20261021013000, 20261023142000 (radio), 20261023180000 (festival_opened) et 20261024150000 (radio_show_follow, radio_followed_play).';

-- CREATE OR REPLACE garde les droits de la fonction : exécutable par anon et authenticated.

-- Vérification (SQL Editor) :
-- select pg_get_constraintdef(oid) from pg_constraint where conname in ('user_follows_target_type_check', 'app_audience_counts_metric_check');
-- select policyname, permissive, cmd, roles from pg_policies where tablename = 'user_follows' order by 1;
-- select has_function_privilege('anon', 'public.app_radio_followed(uuid, timestamp)', 'execute') as anon,
--        has_function_privilege('authenticated', 'public.app_radio_followed(uuid, timestamp)', 'execute') as authenticated;
-- select target_type, count(*) from public.user_follows group by 1;

-- Rollback (avant la sortie d'une app qui suit des émissions ; après, ses suivis d'émissions seraient perdus) :
-- DELETE FROM public.user_follows WHERE target_type = 'radio_show';
-- DELETE FROM public.app_audience_counts WHERE metric IN ('radio_show_follow', 'radio_followed_play');
-- DROP FUNCTION IF EXISTS public.app_radio_followed(uuid, timestamp);
-- DROP POLICY IF EXISTS "Users can only follow visible radio shows" ON public.user_follows;
-- DROP TRIGGER IF EXISTS trg_radio_shows_delete_follows ON public.radio_shows;
-- puis recréer, depuis leurs dernières migrations : la contrainte user_follows_target_type_check et
-- check_user_follow_target() (20261021141000, avec leurs commentaires), app_follows() (DROP puis la définition de
-- 20261023190000, ses droits : REVOKE … FROM PUBLIC, anon ; GRANT … TO authenticated), la contrainte
-- app_audience_counts_metric_check et app_audience_add() (20261023180000).
