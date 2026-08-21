ALTER TABLE public.event_sources
  ADD COLUMN IF NOT EXISTS source_scope text;

UPDATE public.event_sources
SET source_scope = CASE
  WHEN organizer_id IS NOT NULL OR organizer_location_id IS NOT NULL THEN 'owner'
  ELSE 'global'
END
WHERE source_scope IS NULL;

ALTER TABLE public.event_sources
  DROP CONSTRAINT IF EXISTS event_sources_required_entity_link_check;

ALTER TABLE public.event_sources
  DROP CONSTRAINT IF EXISTS event_sources_source_scope_check;

ALTER TABLE public.event_sources
  ADD CONSTRAINT event_sources_source_scope_check
  CHECK (source_scope = ANY (ARRAY['owner'::text, 'global'::text]));

ALTER TABLE public.event_sources
  DROP CONSTRAINT IF EXISTS event_sources_source_scope_consistency_check;

ALTER TABLE public.event_sources
  ADD CONSTRAINT event_sources_source_scope_consistency_check
  CHECK (
    source_scope = CASE
      WHEN organizer_id IS NOT NULL OR organizer_location_id IS NOT NULL THEN 'owner'::text
      ELSE 'global'::text
    END
  );

ALTER TABLE public.event_sources
  ALTER COLUMN source_scope SET DEFAULT 'global';

ALTER TABLE public.event_sources
  ALTER COLUMN source_scope SET NOT NULL;

COMMENT ON COLUMN public.event_sources.source_scope IS 'Nature de la source: owner quand elle est synchronisee depuis un organisateur ou lieu-organisateur, global sinon.';

CREATE OR REPLACE FUNCTION public.set_event_source_scope_from_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.source_scope := CASE
    WHEN NEW.organizer_id IS NOT NULL OR NEW.organizer_location_id IS NOT NULL THEN 'owner'
    ELSE 'global'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_event_source_scope_from_owner_trigger
ON public.event_sources;

CREATE TRIGGER set_event_source_scope_from_owner_trigger
BEFORE INSERT OR UPDATE ON public.event_sources
FOR EACH ROW
EXECUTE FUNCTION public.set_event_source_scope_from_owner();

WITH duplicate_organizer_sources AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY organizer_id
      ORDER BY created_at ASC, id ASC
    ) AS row_num
  FROM public.event_sources
  WHERE organizer_id IS NOT NULL
)
UPDATE public.event_sources AS source
SET
  organizer_id = NULL,
  notes = CONCAT_WS(
    E'\n',
    NULLIF(source.notes, ''),
    '[auto] Detached from organizer during owner-source uniqueness migration.'
  )
FROM duplicate_organizer_sources AS duplicate_source
WHERE source.id = duplicate_source.id
  AND duplicate_source.row_num > 1;

WITH duplicate_organizer_location_sources AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY organizer_location_id
      ORDER BY created_at ASC, id ASC
    ) AS row_num
  FROM public.event_sources
  WHERE organizer_location_id IS NOT NULL
)
UPDATE public.event_sources AS source
SET
  organizer_location_id = NULL,
  notes = CONCAT_WS(
    E'\n',
    NULLIF(source.notes, ''),
    '[auto] Detached from organizer location during owner-source uniqueness migration.'
  )
FROM duplicate_organizer_location_sources AS duplicate_source
WHERE source.id = duplicate_source.id
  AND duplicate_source.row_num > 1;

CREATE UNIQUE INDEX IF NOT EXISTS event_sources_unique_organizer_owner_idx
  ON public.event_sources (organizer_id)
  WHERE organizer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_sources_unique_organizer_location_owner_idx
  ON public.event_sources (organizer_location_id)
  WHERE organizer_location_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pick_event_source_url(
  website_url text,
  instagram_url text,
  facebook_url text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(BTRIM(website_url), ''),
    NULLIF(BTRIM(instagram_url), ''),
    NULLIF(BTRIM(facebook_url), '')
  );
$$;

CREATE OR REPLACE FUNCTION public.pick_event_source_type(
  website_url text,
  instagram_url text,
  facebook_url text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN NULLIF(BTRIM(website_url), '') IS NOT NULL THEN 'website'
    WHEN NULLIF(BTRIM(instagram_url), '') IS NOT NULL THEN 'instagram'
    WHEN NULLIF(BTRIM(facebook_url), '') IS NOT NULL THEN 'facebook'
    ELSE 'website'
  END;
$$;

CREATE OR REPLACE FUNCTION public.pick_event_source_capture_mode(
  website_url text,
  instagram_url text,
  facebook_url text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN NULLIF(BTRIM(facebook_url), '') IS NOT NULL
      AND NULLIF(BTRIM(website_url), '') IS NULL
      AND NULLIF(BTRIM(instagram_url), '') IS NULL THEN 'facebook'
    ELSE 'url'
  END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_event_source_from_organizer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  derived_url text;
  derived_type text;
  derived_capture_mode text;
BEGIN
  derived_url := public.pick_event_source_url(NEW.website_url, NEW.instagram_url, NEW.facebook_url);
  derived_type := public.pick_event_source_type(NEW.website_url, NEW.instagram_url, NEW.facebook_url);
  derived_capture_mode := public.pick_event_source_capture_mode(
    NEW.website_url,
    NEW.instagram_url,
    NEW.facebook_url
  );

  IF derived_url IS NULL THEN
    UPDATE public.event_sources
    SET
      name = NEW.name,
      status = 'paused',
      notes = CONCAT_WS(
        E'\n',
        NULLIF(public.event_sources.notes, ''),
        '[auto] Organizer source paused because no exploitable URL is available.'
      )
    WHERE organizer_id = NEW.id;

    RETURN NEW;
  END IF;

  INSERT INTO public.event_sources (
    name,
    type,
    default_capture_mode,
    url,
    organizer_id,
    organizer_location_id,
    status,
    next_scan_at,
    source_scope
  )
  VALUES (
    NEW.name,
    derived_type,
    derived_capture_mode,
    derived_url,
    NEW.id,
    NULL,
    'active',
    NOW(),
    'owner'
  )
  ON CONFLICT (organizer_id) WHERE organizer_id IS NOT NULL
  DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    default_capture_mode = EXCLUDED.default_capture_mode,
    url = EXCLUDED.url,
    status = CASE
      WHEN public.event_sources.status IN ('dead', 'duplicate') THEN public.event_sources.status
      ELSE 'active'
    END;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_event_source_from_organizer_location()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  derived_url text;
  derived_type text;
  derived_capture_mode text;
BEGIN
  derived_url := public.pick_event_source_url(NEW.website_url, NEW.instagram_url, NEW.facebook_url);
  derived_type := public.pick_event_source_type(NEW.website_url, NEW.instagram_url, NEW.facebook_url);
  derived_capture_mode := public.pick_event_source_capture_mode(
    NEW.website_url,
    NEW.instagram_url,
    NEW.facebook_url
  );

  IF NEW.is_organizer IS DISTINCT FROM TRUE OR derived_url IS NULL THEN
    UPDATE public.event_sources
    SET
      name = NEW.name,
      status = 'paused',
      notes = CONCAT_WS(
        E'\n',
        NULLIF(public.event_sources.notes, ''),
        CASE
          WHEN NEW.is_organizer IS DISTINCT FROM TRUE
            THEN '[auto] Organizer-location source paused because the location is no longer marked as organizer.'
          ELSE '[auto] Organizer-location source paused because no exploitable URL is available.'
        END
      )
    WHERE organizer_location_id = NEW.id;

    RETURN NEW;
  END IF;

  INSERT INTO public.event_sources (
    name,
    type,
    default_capture_mode,
    url,
    organizer_id,
    organizer_location_id,
    status,
    next_scan_at,
    city_hint,
    source_scope
  )
  VALUES (
    NEW.name,
    derived_type,
    derived_capture_mode,
    derived_url,
    NULL,
    NEW.id,
    'active',
    NOW(),
    NULL,
    'owner'
  )
  ON CONFLICT (organizer_location_id) WHERE organizer_location_id IS NOT NULL
  DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    default_capture_mode = EXCLUDED.default_capture_mode,
    url = EXCLUDED.url,
    status = CASE
      WHEN public.event_sources.status IN ('dead', 'duplicate') THEN public.event_sources.status
      ELSE 'active'
    END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS upsert_event_source_from_organizer_trigger
ON public.organizers;

CREATE TRIGGER upsert_event_source_from_organizer_trigger
AFTER INSERT OR UPDATE OF name, website_url, instagram_url, facebook_url
ON public.organizers
FOR EACH ROW
EXECUTE FUNCTION public.upsert_event_source_from_organizer();

DROP TRIGGER IF EXISTS upsert_event_source_from_organizer_location_trigger
ON public.locations;

CREATE TRIGGER upsert_event_source_from_organizer_location_trigger
AFTER INSERT OR UPDATE OF name, is_organizer, website_url, instagram_url, facebook_url
ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.upsert_event_source_from_organizer_location();

INSERT INTO public.event_sources (
  name,
  type,
  default_capture_mode,
  url,
  organizer_id,
  organizer_location_id,
  status,
  next_scan_at,
  source_scope
)
SELECT
  organizer.name,
  public.pick_event_source_type(organizer.website_url, organizer.instagram_url, organizer.facebook_url),
  public.pick_event_source_capture_mode(
    organizer.website_url,
    organizer.instagram_url,
    organizer.facebook_url
  ),
  public.pick_event_source_url(organizer.website_url, organizer.instagram_url, organizer.facebook_url),
  organizer.id,
  NULL,
  'active',
  NOW(),
  'owner'
FROM public.organizers AS organizer
WHERE public.pick_event_source_url(organizer.website_url, organizer.instagram_url, organizer.facebook_url) IS NOT NULL
ON CONFLICT (organizer_id) WHERE organizer_id IS NOT NULL
DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  default_capture_mode = EXCLUDED.default_capture_mode,
  url = EXCLUDED.url,
  status = CASE
    WHEN public.event_sources.status IN ('dead', 'duplicate') THEN public.event_sources.status
    ELSE 'active'
  END;

UPDATE public.event_sources AS source
SET
  name = organizer.name,
  status = 'paused',
  notes = CONCAT_WS(
    E'\n',
    NULLIF(source.notes, ''),
    '[auto] Organizer source paused during backfill because no exploitable URL is available.'
  )
FROM public.organizers AS organizer
WHERE source.organizer_id = organizer.id
  AND public.pick_event_source_url(organizer.website_url, organizer.instagram_url, organizer.facebook_url) IS NULL;

INSERT INTO public.event_sources (
  name,
  type,
  default_capture_mode,
  url,
  organizer_id,
  organizer_location_id,
  status,
  next_scan_at,
  source_scope
)
SELECT
  location.name,
  public.pick_event_source_type(location.website_url, location.instagram_url, location.facebook_url),
  public.pick_event_source_capture_mode(
    location.website_url,
    location.instagram_url,
    location.facebook_url
  ),
  public.pick_event_source_url(location.website_url, location.instagram_url, location.facebook_url),
  NULL,
  location.id,
  'active',
  NOW(),
  'owner'
FROM public.locations AS location
WHERE location.is_organizer = TRUE
  AND public.pick_event_source_url(location.website_url, location.instagram_url, location.facebook_url) IS NOT NULL
ON CONFLICT (organizer_location_id) WHERE organizer_location_id IS NOT NULL
DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  default_capture_mode = EXCLUDED.default_capture_mode,
  url = EXCLUDED.url,
  status = CASE
    WHEN public.event_sources.status IN ('dead', 'duplicate') THEN public.event_sources.status
    ELSE 'active'
  END;

UPDATE public.event_sources AS source
SET
  name = location.name,
  status = 'paused',
  notes = CONCAT_WS(
    E'\n',
    NULLIF(source.notes, ''),
    CASE
      WHEN location.is_organizer = TRUE
        THEN '[auto] Organizer-location source paused during backfill because no exploitable URL is available.'
      ELSE '[auto] Organizer-location source paused during backfill because the location is no longer marked as organizer.'
    END
  )
FROM public.locations AS location
WHERE source.organizer_location_id = location.id
  AND (
    location.is_organizer IS DISTINCT FROM TRUE
    OR public.pick_event_source_url(location.website_url, location.instagram_url, location.facebook_url) IS NULL
  );

CREATE OR REPLACE VIEW public.event_source_sync_audit AS
SELECT
  'organizer_missing_url'::text AS issue_type,
  'organizer'::text AS owner_type,
  organizer.id AS owner_id,
  organizer.name AS owner_name,
  NULL::uuid AS source_id,
  NULL::text AS source_name
FROM public.organizers AS organizer
WHERE public.pick_event_source_url(organizer.website_url, organizer.instagram_url, organizer.facebook_url) IS NULL

UNION ALL

SELECT
  'organizer_location_missing_url'::text AS issue_type,
  'location'::text AS owner_type,
  location.id AS owner_id,
  location.name AS owner_name,
  NULL::uuid AS source_id,
  NULL::text AS source_name
FROM public.locations AS location
WHERE location.is_organizer = TRUE
  AND public.pick_event_source_url(location.website_url, location.instagram_url, location.facebook_url) IS NULL

UNION ALL

SELECT
  'global_source'::text AS issue_type,
  'source'::text AS owner_type,
  source.id AS owner_id,
  source.name AS owner_name,
  source.id AS source_id,
  source.name AS source_name
FROM public.event_sources AS source
WHERE source.source_scope = 'global';

COMMENT ON VIEW public.event_source_sync_audit IS 'Rapport de controle du systeme de sync des sources owner/global: owners sans URL exploitable et sources globales existantes.';
