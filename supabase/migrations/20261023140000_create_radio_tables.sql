-- ============================================
-- Migration : Radio Campus dans OutLive — stations, émissions, épisodes
-- Date : 2026-10-23
-- Description : le direct et les émissions à réécouter de Radio Campus Orléans dans l'app
-- (`../live/docs/RADIO_CAMPUS.md`, § 4 « Le contrat entre live-admin et l'app » ; recopié dans
-- `docs/API_APP.md`, « Radio »). Les tables sont remplies par l'import horaire
-- (`/api/cron/radio-import`, `lib/radio/`), en lecture seule chez la radio.
-- ============================================

-- ============================================
-- CHANGEMENTS
-- ============================================

-- - radio_stations : une station par organisateur (flux, serveur de diffusion, site) et son
--   interrupteur `enabled`, faux par défaut. À faux, la RLS cache la station, ses émissions et ses
--   épisodes : l'app ne montre rien de la radio. L'utilisateur le passe à vrai en prod, après l'accord
--   écrit de la radio (RADIO_CAMPUS.md, § 5).
-- - radio_shows : les émissions (id WordPress, nom, style, famille musique ou parole, créneaux,
--   collectif qui la fait). La famille et le collectif se modifient dans le back-office ; l'import ne
--   les touche plus une fois l'émission créée.
-- - radio_episodes : les épisodes des flux RSS. `last_episode_at` de l'émission suit le plus récent
--   (trigger).
-- - radio_show_sync : le suivi de l'import (dates de lecture, en-têtes du flux), service role seulement.
-- - Lecture publique (anon et authenticated) d'une station activée, de ses émissions et de ses
--   épisodes ; écriture par la clé service role seulement (import et back-office). Les politiques
--   lisent les stations activées dans une sous-requête non corrélée, calculée une fois par requête
--   (comme les politiques d'events depuis 20261021190000_speed_up_events_rls.sql), pas pour chaque
--   ligne.
-- - Radio Campus Orléans insérée, désactivée, si son organisateur existe (base locale sans lui : rien).
--
-- Dates (aired_at, last_episode_at) : comme events.date, l'heure de Paris étiquetée UTC (« 22:00 à
-- Paris » est stocké …T22:00:00+00:00). Le flux RSS donne de vrais instants UTC : l'import convertit.
--
-- Créneaux (`slots`) : [{"weekday": 4, "start": "22:00", "end": "24:00"}], jour ISO (1 = lundi),
-- heures de Paris « HH:MM » ; une fin plus tôt que le début finit le lendemain, « 24:00 » est minuit.

-- ============================================
-- CODE SQL
-- ============================================

-- Créneaux bien formés : un tableau d'objets {weekday 1 à 7, start « HH:MM », end « HH:MM » ou « 24:00 »},
-- début et fin différents. Les fonctions de la grille lisent ces champs sans autre vérification.
CREATE OR REPLACE FUNCTION public.radio_slots_valid(slots jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  -- CASE : jsonb_array_elements échoue sur autre chose qu'un tableau, et AND n'impose pas d'ordre.
  SELECT CASE WHEN jsonb_typeof(slots) = 'array' THEN NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(slots) AS s(slot)
      WHERE coalesce(jsonb_typeof(s.slot), '') <> 'object'
         OR coalesce(jsonb_typeof(s.slot -> 'weekday'), '') <> 'number'
         OR coalesce(s.slot ->> 'weekday', '') !~ '^[1-7]$'
         OR coalesce(jsonb_typeof(s.slot -> 'start'), '') <> 'string'
         OR coalesce(jsonb_typeof(s.slot -> 'end'), '') <> 'string'
         OR coalesce(s.slot ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         OR coalesce(s.slot ->> 'end', '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
         OR s.slot ->> 'start' = s.slot ->> 'end'
    ) ELSE false END
$$;

COMMENT ON FUNCTION public.radio_slots_valid(jsonb) IS
  'Radio : créneaux d''une émission bien formés ([{"weekday": 1 à 7, "start": "HH:MM", "end": "HH:MM" ou "24:00"}], début et fin différents).';

-- Stations ------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.radio_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- La station remplace la page de son organisateur dans l'app. Supprimer l'organisateur est refusé
  -- tant que la station existe.
  organizer_id uuid NOT NULL UNIQUE REFERENCES public.organizers(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (btrim(name) <> ''),
  frequency text NOT NULL,
  stream_url text NOT NULL CHECK (stream_url ~ '^https?://'),
  -- Le flux léger, s'il existe un jour : l'app le prend en données mobiles.
  stream_url_light text CHECK (stream_url_light ~ '^https?://'),
  -- JSON du serveur Icecast (titre en cours).
  status_url text NOT NULL CHECK (status_url ~ '^https?://'),
  site_url text NOT NULL CHECK (site_url ~ '^https?://'),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.radio_stations IS
  'Radio : une station par organisateur. enabled faux (par défaut) : la RLS la cache, avec ses émissions et ses épisodes, et l''app ne montre rien de la radio.';
COMMENT ON COLUMN public.radio_stations.enabled IS
  'Interrupteur de la station dans l''app. À passer à vrai en prod seulement après l''accord écrit de la radio (../live/docs/RADIO_CAMPUS.md, § 5).';

-- Émissions -----------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.radio_shows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.radio_stations(id) ON DELETE CASCADE,
  -- Id WordPress de l'émission sur le site de la radio.
  source_id bigint NOT NULL,
  slug text NOT NULL CHECK (slug <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  -- Texte libre de la radio, première lettre en capitale (« Drum'n bass, jungle, dubstep, electro »).
  style text,
  family text NOT NULL DEFAULT 'musique' CHECK (family IN ('musique', 'parole')),
  -- Présentation, en texte (sans HTML).
  description text,
  page_url text NOT NULL,
  feed_url text,
  slots jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (public.radio_slots_valid(slots)),
  -- Le collectif qui fait l'émission (Jungle Assault pour Nation Groove), choisi dans le back-office.
  organizer_id uuid REFERENCES public.organizers(id) ON DELETE SET NULL,
  -- Le plus récent aired_at de ses épisodes (trigger radio_episodes_refresh_last_episode).
  last_episode_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, source_id),
  UNIQUE (station_id, slug)
);

COMMENT ON TABLE public.radio_shows IS
  'Radio : les émissions d''une station, importées du site de la radio. family et organizer_id se modifient dans le back-office ; une émission active a un épisode depuis 45 jours (app_radio_shows).';
COMMENT ON COLUMN public.radio_shows.slots IS
  'Créneaux de la grille : [{"weekday": 4, "start": "22:00", "end": "24:00"}], jour ISO (1 = lundi), heures de Paris ; une fin plus tôt que le début finit le lendemain.';

CREATE INDEX IF NOT EXISTS radio_shows_organizer_id_idx
  ON public.radio_shows (organizer_id) WHERE organizer_id IS NOT NULL;

-- Épisodes ------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.radio_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES public.radio_shows(id) ON DELETE CASCADE,
  guid text NOT NULL UNIQUE,
  -- « Nation Groove du 22/10/2026 »
  title text NOT NULL,
  -- Heure de Paris étiquetée UTC, comme events.date.
  aired_at timestamptz NOT NULL,
  duration_s integer CHECK (duration_s > 0),
  audio_url text NOT NULL CHECK (audio_url ~ '^https?://'),
  page_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.radio_episodes IS
  'Radio : les épisodes des émissions (les 30 derniers de chaque flux RSS). aired_at : heure de Paris étiquetée UTC.';

-- La liste d'une émission (show_id=eq.…&order=aired_at.desc&limit=30) et son dernier épisode.
CREATE INDEX IF NOT EXISTS radio_episodes_show_aired_idx
  ON public.radio_episodes (show_id, aired_at DESC);

-- Suivi de l'import, à part : rien de public, et radio_shows.updated_at ne bouge qu'aux vrais changements.
CREATE TABLE IF NOT EXISTS public.radio_show_sync (
  show_id uuid PRIMARY KEY REFERENCES public.radio_shows(id) ON DELETE CASCADE,
  -- Dernière modification de l'émission sur le site (instant, `modified_gmt` de l'API WordPress).
  source_modified_at timestamptz,
  -- Dernière lecture réussie de la page de l'émission, puis de son flux.
  page_checked_at timestamptz,
  feed_checked_at timestamptz,
  -- En-têtes du flux, renvoyés pour une lecture conditionnelle (304 quand rien n'a changé).
  feed_etag text,
  feed_last_modified text
);

COMMENT ON TABLE public.radio_show_sync IS
  'Radio : suivi de l''import horaire (lib/radio/import.ts) pour chaque émission. Service role seulement.';

-- updated_at --------------------------------------------------------------------------------------

DROP TRIGGER IF EXISTS update_radio_stations_updated_at ON public.radio_stations;
CREATE TRIGGER update_radio_stations_updated_at
  BEFORE UPDATE ON public.radio_stations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_radio_shows_updated_at ON public.radio_shows;
CREATE TRIGGER update_radio_shows_updated_at
  BEFORE UPDATE ON public.radio_shows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_radio_episodes_updated_at ON public.radio_episodes;
CREATE TRIGGER update_radio_episodes_updated_at
  BEFORE UPDATE ON public.radio_episodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- last_episode_at : le plus récent épisode, quel que soit ce qui écrit les épisodes -----------------

CREATE OR REPLACE FUNCTION public.radio_episodes_refresh_last_episode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  show_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    show_ids := ARRAY[NEW.show_id];
  ELSIF TG_OP = 'DELETE' THEN
    show_ids := ARRAY[OLD.show_id];
  ELSE
    show_ids := ARRAY[NEW.show_id, OLD.show_id];
  END IF;

  UPDATE public.radio_shows AS s
  SET last_episode_at = d.last_at
  FROM (
    SELECT x.id, (SELECT max(e.aired_at) FROM public.radio_episodes AS e WHERE e.show_id = x.id) AS last_at
    FROM unnest(show_ids) AS x(id)
  ) AS d
  WHERE s.id = d.id
    AND s.last_episode_at IS DISTINCT FROM d.last_at;

  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.radio_episodes_refresh_last_episode() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS radio_episodes_refresh_last_episode ON public.radio_episodes;
CREATE TRIGGER radio_episodes_refresh_last_episode
  AFTER INSERT OR DELETE OR UPDATE OF show_id, aired_at ON public.radio_episodes
  FOR EACH ROW EXECUTE FUNCTION public.radio_episodes_refresh_last_episode();

-- Droits et RLS -------------------------------------------------------------------------------------
-- Lecture seule pour anon et authenticated, limitée par la RLS aux stations activées ; rien d'autre
-- (ni écriture ni TRUNCATE, que la RLS n'arrête pas). La clé service role passe outre la RLS.

ALTER TABLE public.radio_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radio_shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radio_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radio_show_sync ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.radio_stations, public.radio_shows, public.radio_episodes, public.radio_show_sync
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.radio_stations, public.radio_shows, public.radio_episodes TO anon, authenticated;
-- radio_show_sync : aucun droit ni politique, la clé service role seulement.

DROP POLICY IF EXISTS "Stations activées lisibles par tous" ON public.radio_stations;
CREATE POLICY "Stations activées lisibles par tous" ON public.radio_stations
  FOR SELECT TO anon, authenticated
  USING (enabled);

DROP POLICY IF EXISTS "Émissions des stations activées lisibles par tous" ON public.radio_shows;
CREATE POLICY "Émissions des stations activées lisibles par tous" ON public.radio_shows
  FOR SELECT TO anon, authenticated
  USING (station_id IN (SELECT st.id FROM public.radio_stations AS st WHERE st.enabled));

DROP POLICY IF EXISTS "Épisodes des stations activées lisibles par tous" ON public.radio_episodes;
CREATE POLICY "Épisodes des stations activées lisibles par tous" ON public.radio_episodes
  FOR SELECT TO anon, authenticated
  USING (show_id IN (
    SELECT sh.id
    FROM public.radio_shows AS sh
    WHERE sh.station_id IN (SELECT st.id FROM public.radio_stations AS st WHERE st.enabled)
  ));

-- Radio Campus Orléans, désactivée ------------------------------------------------------------------
-- Id fixe, le même en local et en prod (docs/API_APP.md, « Radio »). Sans l'organisateur (base locale,
-- base de test) : aucune ligne, sans erreur.

INSERT INTO public.radio_stations (
  id, organizer_id, name, frequency, stream_url, stream_url_light, status_url, site_url, enabled
)
SELECT
  'e2f7ade2-f5d2-4408-90b4-f8bfca383399',
  o.id,
  'Radio Campus Orléans',
  '88.3',
  'https://streams.labomedia.org:8443/stream_rco',
  NULL,
  'https://streams.labomedia.org:8443/status-json.xsl',
  'https://orleans.radiocampus.org/',
  false
FROM public.organizers AS o
WHERE o.id = '9d6d803d-4a7e-4118-beba-1744a1159b99'
ON CONFLICT DO NOTHING;

-- Vérification (SQL Editor) :
-- select id, name, enabled from public.radio_stations;
-- select count(*) as emissions, count(*) filter (where last_episode_at > now() - interval '45 days') as actives
-- from public.radio_shows;

-- ============================================
-- ROLLBACK
-- ============================================
-- DROP TABLE IF EXISTS public.radio_show_sync;
-- DROP TABLE IF EXISTS public.radio_episodes;
-- DROP TABLE IF EXISTS public.radio_shows;
-- DROP TABLE IF EXISTS public.radio_stations;
-- DROP FUNCTION IF EXISTS public.radio_episodes_refresh_last_episode();
-- DROP FUNCTION IF EXISTS public.radio_slots_valid(jsonb);
