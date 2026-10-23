-- Radio Campus dans OutLive : les visuels gardés des émissions (../live/docs/RADIO_CAMPUS.md, « Les pochettes »).
--
-- La charte de la radio habille ses objets dans l'app ; chaque émission a sa pochette, dessinée par l'app.
-- Onze émissions gardent leur propre visuel à la place (choisies une par une le 2026-10-23) : recadré en
-- carré et copié dans le stockage d'OutLive (bucket organizers-images, dossier radio-shows), comme les
-- affiches ; réglable dans /admin/radio. Null : la pochette de la charte.
--
-- app_radio_day(), app_radio_shows() et radio_live_grid() gagnent la colonne image_url (en dernier) : leur
-- type de retour change, elles sont supprimées puis recréées à l'identique, avec ce champ en plus.

ALTER TABLE public.radio_shows
  ADD COLUMN IF NOT EXISTS image_url text CHECK (image_url ~ '^https://');

COMMENT ON COLUMN public.radio_shows.image_url IS
  'Le visuel gardé de l''émission, carré, dans le stockage d''OutLive ; null : la pochette de la charte de la radio, dessinée par l''app. L''import ne le touche pas.';

DROP FUNCTION IF EXISTS public.app_radio_day(uuid, date, timestamp);
DROP FUNCTION IF EXISTS public.app_radio_shows(uuid, timestamp);
DROP FUNCTION IF EXISTS public.radio_live_grid(uuid, timestamp);

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
  state text,
  image_url text
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
    SELECT s.id, s.slug, s.name, s.style, s.family, s.image_url
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
    END,
    a.image_url
  FROM lignes AS l
  JOIN actives AS a ON a.id = l.show_id
  CROSS JOIN jour AS j
  LEFT JOIN episodes AS e ON e.id = l.episode_id
  -- Passé sans épisode : retiré (rien à réécouter).
  WHERE l.episode_id IS NOT NULL OR l.ends_at > j.at_time
  ORDER BY l.starts_at, a.name, l.show_id
$$;

COMMENT ON FUNCTION public.app_radio_day(uuid, date, timestamp) IS
  'Radio (app) : les émissions actives d''un jour (aujourd''hui − 6 à aujourd''hui, heure de Paris), par début : passées avec un épisode, en cours, à venir ; état past, live ou next ; image_url : son visuel gardé (null : la pochette de la charte). Dates : heure de Paris étiquetée UTC.';

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
  letter text,
  image_url text
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
    public.radio_show_letter(s.name),
    s.image_url
  FROM public.radio_shows AS s
  WHERE s.station_id = p_station
    AND public.radio_show_is_active(s.last_episode_at, coalesce(p_at, now() AT TIME ZONE 'Europe/Paris'))
  ORDER BY public.radio_show_sort_key(s.name) COLLATE "C", s.name COLLATE "C", s.id
$$;

COMMENT ON FUNCTION public.app_radio_shows(uuid, timestamp) IS
  'Radio (app) : les émissions actives (un épisode depuis 45 jours) de A à Z, sans articles ni accents ; letter : leur lettre dans la liste (# hors de A à Z) ; image_url : leur visuel gardé (null : la pochette de la charte).';

GRANT EXECUTE ON FUNCTION public.app_radio_shows(uuid, timestamp) TO anon, authenticated;

-- radio_live_grid --------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.radio_live_grid(p_station uuid, p_at timestamp DEFAULT NULL)
RETURNS TABLE (
  kind text,
  show_id uuid,
  name text,
  style text,
  family text,
  starts_at timestamptz,
  ends_at timestamptz,
  image_url text
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
      o.show_id, o.starts_at, o.ends_at, s.name, s.style, s.family, s.image_url,
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
  SELECT 'live', c.show_id, c.name, c.style, c.family, c.starts_at AT TIME ZONE 'UTC', c.ends_at AT TIME ZONE 'UTC', c.image_url
  FROM en_cours AS c
  UNION ALL
  SELECT 'next', c.show_id, c.name, c.style, c.family, c.starts_at AT TIME ZONE 'UTC', c.ends_at AT TIME ZONE 'UTC', c.image_url
  FROM ensuite AS c
  UNION ALL
  SELECT 'on_air', c.show_id, c.name, c.style, c.family, c.starts_at AT TIME ZONE 'UTC', c.ends_at AT TIME ZONE 'UTC', c.image_url
  FROM a_l_antenne AS c
$$;

COMMENT ON FUNCTION public.radio_live_grid(uuid, timestamp) IS
  'Radio (route « ce qui passe ») : live = l''émission active en cours selon la grille, next = la suivante (7 jours), on_air = les émissions, actives ou non, prévues autour de maintenant (le serveur envoie leur nom) ; image_url : leur visuel gardé.';

GRANT EXECUTE ON FUNCTION public.radio_live_grid(uuid, timestamp) TO anon, authenticated;

-- ============================================
-- ROLLBACK
-- ============================================
-- Recréer les trois fonctions de 20261023141000_create_app_radio_functions.sql (sans image_url), puis :
-- ALTER TABLE public.radio_shows DROP COLUMN IF EXISTS image_url;
