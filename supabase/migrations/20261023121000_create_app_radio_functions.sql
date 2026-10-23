-- ============================================
-- Migration : Radio — la grille et les émissions pour l'app
-- Date : 2026-10-23
-- Description : les règles de la radio, en SQL comme les autres règles partagées avec l'app
-- (contrat : `../live/docs/RADIO_CAMPUS.md`, § 4, recopié dans `docs/API_APP.md`, « Radio » ;
-- tests : supabase/tests/app_radio.test.sql). Tables : 20261023120000_create_radio_tables.sql.
-- ============================================

-- ============================================
-- CHANGEMENTS
-- ============================================

-- Pour l'app (RPC, anon et authenticated, sous la RLS de l'appelant : une station désactivée ne rend
-- rien) :
-- - app_radio_day(p_station, p_day) : les émissions d'un jour, par début. Un jour passé : celles qui ont
--   un épisode ce jour-là. Aujourd'hui : celles passées qui ont un épisode, celle en cours, celles à
--   venir. p_day va d'aujourd'hui − 6 à aujourd'hui (heure de Paris) ; un autre jour : aucune ligne.
-- - app_radio_shows(p_station) : les émissions actives de A à Z, sans les articles « le », « la »,
--   « les », « l' » ni les accents ; `letter` : la lettre sous laquelle la ranger (# hors de A à Z).
-- Pour la route « ce qui passe » (`/api/v1/radio/[stationId]/live`) :
-- - radio_live_grid(p_station) : l'émission de la grille en cours, la suivante, et les émissions
--   (actives ou non) prévues autour de maintenant, dont le serveur peut envoyer le nom.
--
-- Les règles :
-- - une émission active a un épisode depuis 45 jours (radio_show_is_active) ; seules les actives
--   sortent d'app_radio_day, d'app_radio_shows et des lignes « live » et « next » ;
-- - un créneau (radio_shows.slots) se répète chaque semaine, à l'heure de Paris
--   (radio_slot_occurrences) ; une fin plus tôt que le début finit le lendemain ;
-- - un épisode se rattache au créneau de son émission dans lequel il commence, jusqu'à 15 minutes
--   avant : il en prend le début et la fin (« Nation Groove du 22/10/2026 », 22:00:01, créneau
--   22:00 – 24:00). Un épisode hors de tout créneau garde son heure, et sa durée pour la fin ;
-- - état (`past`, `live`, `next`) d'après l'heure de Paris : fini, en cours, à venir.
-- Dates rendues comme events.date : l'heure de Paris étiquetée UTC (…T22:00:00+00:00).
-- `p_at` (heure de Paris, sans fuseau) remplace « maintenant » pour les tests ; l'app ne l'envoie pas.

-- ============================================
-- CODE SQL
-- ============================================

-- Une émission active a un épisode depuis 45 jours. last_episode_at est à l'heure de Paris étiquetée
-- UTC, at_time l'heure de Paris.
CREATE OR REPLACE FUNCTION public.radio_show_is_active(last_episode_at timestamptz, at_time timestamp)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT coalesce((last_episode_at AT TIME ZONE 'UTC') >= at_time - interval '45 days', false)
$$;

COMMENT ON FUNCTION public.radio_show_is_active(timestamptz, timestamp) IS
  'Radio : une émission est active si son dernier épisode date de 45 jours au plus (heure de Paris).';

-- Clé de tri des émissions : sans accents, casse, ponctuation (app_search_normalize), ni article au début.
CREATE OR REPLACE FUNCTION public.radio_show_sort_key(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT regexp_replace(public.app_search_normalize(name), '^(le|la|les|l) ', '')
$$;

COMMENT ON FUNCTION public.radio_show_sort_key(text) IS
  'Radio : clé de tri A à Z d''une émission, sans accents, casse, ponctuation ni article « le », « la », « les », « l'' » au début (« L''Enfer du Dimanche » → « enfer du dimanche »).';

-- La lettre de la liste A à Z : la première de la clé de tri, # pour un chiffre ou un signe.
CREATE OR REPLACE FUNCTION public.radio_show_letter(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE WHEN k.first ~ '^[a-z]$' THEN upper(k.first) ELSE '#' END
  FROM (SELECT left(public.radio_show_sort_key(name), 1) AS first) AS k
$$;

COMMENT ON FUNCTION public.radio_show_letter(text) IS
  'Radio : lettre sous laquelle ranger une émission dans la liste A à Z (« Le Mag Culturel » → M ; # hors de A à Z).';

-- Les créneaux d'une station entre deux jours compris (31 jours au plus), à l'heure de Paris : une
-- ligne par émission, jour et créneau. Sous la RLS de l'appelant (station désactivée : rien).
CREATE OR REPLACE FUNCTION public.radio_slot_occurrences(p_station uuid, p_first_day date, p_last_day date)
RETURNS TABLE (show_id uuid, starts_at timestamp, ends_at timestamp)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    s.id,
    d.day + (slot.value ->> 'start')::time,
    CASE
      WHEN (slot.value ->> 'end')::time > (slot.value ->> 'start')::time
        THEN d.day + (slot.value ->> 'end')::time
      -- Une fin plus tôt que le début (00:00, 01:30…) finit le lendemain.
      ELSE (d.day + 1) + (slot.value ->> 'end')::time
    END
  FROM public.radio_shows AS s
  CROSS JOIN LATERAL jsonb_array_elements(s.slots) AS slot
  JOIN (
    SELECT g::date AS day
    FROM generate_series(p_first_day::timestamp, p_last_day::timestamp, interval '1 day') AS g
  ) AS d ON extract(isodow FROM d.day)::integer = (slot.value ->> 'weekday')::integer
  WHERE s.station_id = p_station
    AND p_last_day - p_first_day BETWEEN 0 AND 31
$$;

COMMENT ON FUNCTION public.radio_slot_occurrences(uuid, date, date) IS
  'Radio : les créneaux des émissions d''une station entre deux jours compris (31 jours au plus), à l''heure de Paris (sans fuseau).';

-- app_radio_day ----------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_radio_day(p_station uuid, p_day date, p_at timestamp DEFAULT NULL)
RETURNS TABLE (
  show_id uuid,
  slug text,
  name text,
  style text,
  family text,
  starts_at timestamptz,
  ends_at timestamptz,
  episode_id uuid,
  audio_url text,
  duration_s integer,
  state text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH maintenant AS (
    SELECT coalesce(p_at, now() AT TIME ZONE 'Europe/Paris') AS at_time
  ),
  jour AS (
    -- D'aujourd'hui − 6 à aujourd'hui ; un autre jour, aucune ligne.
    SELECT p_day AS day, m.at_time
    FROM maintenant AS m
    WHERE p_day BETWEEN m.at_time::date - 6 AND m.at_time::date
  ),
  actives AS (
    SELECT s.id, s.slug, s.name, s.style, s.family
    FROM public.radio_shows AS s
    CROSS JOIN jour AS j
    WHERE s.station_id = p_station
      AND public.radio_show_is_active(s.last_episode_at, j.at_time)
  ),
  -- Les créneaux de la veille au lendemain, pour rattacher aussi un épisode à cheval sur minuit.
  creneaux AS (
    SELECT o.show_id, o.starts_at, o.ends_at
    FROM jour AS j
    CROSS JOIN LATERAL public.radio_slot_occurrences(p_station, j.day - 1, j.day + 1) AS o
    WHERE o.show_id IN (SELECT a.id FROM actives AS a)
  ),
  episodes AS (
    SELECT e.id, e.show_id, e.audio_url, e.duration_s, (e.aired_at AT TIME ZONE 'UTC') AS aired
    FROM public.radio_episodes AS e
    CROSS JOIN jour AS j
    WHERE e.show_id IN (SELECT a.id FROM actives AS a)
      AND e.aired_at >= ((j.day - 1)::timestamp AT TIME ZONE 'UTC')
      AND e.aired_at < ((j.day + 2)::timestamp AT TIME ZONE 'UTC')
  ),
  -- Le premier épisode de chaque créneau : commencé dans le créneau, ou jusqu'à 15 minutes avant.
  rattaches AS (
    SELECT DISTINCT ON (c.show_id, c.starts_at) c.show_id, c.starts_at, e.id AS episode_id
    FROM creneaux AS c
    JOIN episodes AS e
      ON e.show_id = c.show_id
     AND e.aired >= c.starts_at - interval '15 minutes'
     AND e.aired < c.ends_at
    ORDER BY c.show_id, c.starts_at, e.aired, e.id
  ),
  lignes AS (
    -- Les créneaux qui commencent ce jour-là, avec leur épisode s'il y en a un.
    SELECT c.show_id, c.starts_at, c.ends_at, r.episode_id
    FROM creneaux AS c
    JOIN jour AS j ON c.starts_at::date = j.day
    LEFT JOIN rattaches AS r ON r.show_id = c.show_id AND r.starts_at = c.starts_at
    UNION ALL
    -- Les épisodes de ce jour-là hors de tout créneau (émission sans créneau, déplacée, spéciale) :
    -- leur heure, à la minute, et leur durée (une heure sans durée) arrondie à la minute au-dessus.
    SELECT
      e.show_id,
      date_trunc('minute', e.aired),
      date_trunc('minute',
        date_trunc('minute', e.aired) + make_interval(secs => coalesce(e.duration_s, 3600)) + interval '59 seconds'),
      e.id
    FROM episodes AS e
    JOIN jour AS j ON e.aired::date = j.day
    WHERE NOT EXISTS (
      SELECT 1
      FROM creneaux AS c
      WHERE c.show_id = e.show_id
        AND e.aired >= c.starts_at - interval '15 minutes'
        AND e.aired < c.ends_at
    )
  )
  SELECT
    l.show_id,
    a.slug,
    a.name,
    a.style,
    a.family,
    l.starts_at AT TIME ZONE 'UTC',
    l.ends_at AT TIME ZONE 'UTC',
    l.episode_id,
    e.audio_url,
    e.duration_s,
    CASE
      WHEN l.ends_at <= j.at_time THEN 'past'
      WHEN l.starts_at <= j.at_time THEN 'live'
      ELSE 'next'
    END
  FROM lignes AS l
  JOIN actives AS a ON a.id = l.show_id
  CROSS JOIN jour AS j
  LEFT JOIN episodes AS e ON e.id = l.episode_id
  -- Passé sans épisode : retiré (rien à réécouter).
  WHERE l.episode_id IS NOT NULL OR l.ends_at > j.at_time
  ORDER BY l.starts_at, a.name, l.show_id
$$;

COMMENT ON FUNCTION public.app_radio_day(uuid, date, timestamp) IS
  'Radio (app) : les émissions actives d''un jour (aujourd''hui − 6 à aujourd''hui, heure de Paris), par début : passées avec un épisode, en cours, à venir ; état past, live ou next. Dates : heure de Paris étiquetée UTC.';

GRANT EXECUTE ON FUNCTION public.app_radio_day(uuid, date, timestamp) TO anon, authenticated;

-- app_radio_shows --------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_radio_shows(p_station uuid, p_at timestamp DEFAULT NULL)
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
  letter text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
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
    public.radio_show_letter(s.name)
  FROM public.radio_shows AS s
  WHERE s.station_id = p_station
    AND public.radio_show_is_active(s.last_episode_at, coalesce(p_at, now() AT TIME ZONE 'Europe/Paris'))
  ORDER BY public.radio_show_sort_key(s.name) COLLATE "C", s.name COLLATE "C", s.id
$$;

COMMENT ON FUNCTION public.app_radio_shows(uuid, timestamp) IS
  'Radio (app) : les émissions actives (un épisode depuis 45 jours) de A à Z, sans articles ni accents ; letter : leur lettre dans la liste (# hors de A à Z).';

GRANT EXECUTE ON FUNCTION public.app_radio_shows(uuid, timestamp) TO anon, authenticated;

-- radio_live_grid --------------------------------------------------------------------------------
-- kind = 'live' : l'émission active de la grille en cours (la dernière commencée, s'il y en a deux) ;
-- 'next' : la prochaine émission active à commencer, dans les 7 jours ; 'on_air' : chaque émission de la
-- station, active ou non, prévue autour de maintenant (de 10 minutes avant son début à 30 minutes après
-- sa fin) : le serveur de la radio envoie alors son nom comme titre, ce n'est pas un morceau.

CREATE OR REPLACE FUNCTION public.radio_live_grid(p_station uuid, p_at timestamp DEFAULT NULL)
RETURNS TABLE (
  kind text,
  show_id uuid,
  name text,
  style text,
  family text,
  starts_at timestamptz,
  ends_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH maintenant AS (
    SELECT coalesce(p_at, now() AT TIME ZONE 'Europe/Paris') AS at_time
  ),
  creneaux AS (
    SELECT
      o.show_id, o.starts_at, o.ends_at, s.name, s.style, s.family,
      public.radio_show_is_active(s.last_episode_at, m.at_time) AS active
    FROM maintenant AS m
    CROSS JOIN LATERAL public.radio_slot_occurrences(p_station, m.at_time::date - 1, m.at_time::date + 7) AS o
    JOIN public.radio_shows AS s ON s.id = o.show_id
  ),
  en_cours AS (
    SELECT c.*
    FROM creneaux AS c, maintenant AS m
    WHERE c.active AND c.starts_at <= m.at_time AND m.at_time < c.ends_at
    ORDER BY c.starts_at DESC, c.name, c.show_id
    LIMIT 1
  ),
  ensuite AS (
    SELECT c.*
    FROM creneaux AS c, maintenant AS m
    WHERE c.active AND c.starts_at > m.at_time
    ORDER BY c.starts_at, c.name, c.show_id
    LIMIT 1
  ),
  a_l_antenne AS (
    SELECT DISTINCT ON (c.show_id) c.*
    FROM creneaux AS c, maintenant AS m
    WHERE c.starts_at - interval '10 minutes' <= m.at_time
      AND m.at_time < c.ends_at + interval '30 minutes'
    ORDER BY c.show_id, c.starts_at DESC
  )
  SELECT 'live', c.show_id, c.name, c.style, c.family, c.starts_at AT TIME ZONE 'UTC', c.ends_at AT TIME ZONE 'UTC'
  FROM en_cours AS c
  UNION ALL
  SELECT 'next', c.show_id, c.name, c.style, c.family, c.starts_at AT TIME ZONE 'UTC', c.ends_at AT TIME ZONE 'UTC'
  FROM ensuite AS c
  UNION ALL
  SELECT 'on_air', c.show_id, c.name, c.style, c.family, c.starts_at AT TIME ZONE 'UTC', c.ends_at AT TIME ZONE 'UTC'
  FROM a_l_antenne AS c
$$;

COMMENT ON FUNCTION public.radio_live_grid(uuid, timestamp) IS
  'Radio (route « ce qui passe ») : live = l''émission active en cours selon la grille, next = la suivante (7 jours), on_air = les émissions, actives ou non, prévues autour de maintenant (le serveur envoie leur nom).';

GRANT EXECUTE ON FUNCTION public.radio_live_grid(uuid, timestamp) TO anon, authenticated;

-- Vérification (SQL Editor, heure de Paris) :
-- select * from public.app_radio_day('e2f7ade2-f5d2-4408-90b4-f8bfca383399', (now() at time zone 'Europe/Paris')::date);
-- select name, letter from public.app_radio_shows('e2f7ade2-f5d2-4408-90b4-f8bfca383399');
-- (en SQL Editor, rôle postgres : la RLS ne cache pas la station désactivée.)

-- ============================================
-- ROLLBACK
-- ============================================
-- DROP FUNCTION IF EXISTS public.radio_live_grid(uuid, timestamp);
-- DROP FUNCTION IF EXISTS public.app_radio_shows(uuid, timestamp);
-- DROP FUNCTION IF EXISTS public.app_radio_day(uuid, date, timestamp);
-- DROP FUNCTION IF EXISTS public.radio_slot_occurrences(uuid, date, date);
-- DROP FUNCTION IF EXISTS public.radio_show_letter(text);
-- DROP FUNCTION IF EXISTS public.radio_show_sort_key(text);
-- DROP FUNCTION IF EXISTS public.radio_show_is_active(timestamptz, timestamp);
