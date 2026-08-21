ALTER TABLE public.organizers
  ADD COLUMN IF NOT EXISTS source_capture_mode text;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS source_capture_mode text;

UPDATE public.organizers
SET source_capture_mode = public.pick_event_source_capture_mode(website_url, instagram_url, facebook_url)
WHERE source_capture_mode IS NULL;

UPDATE public.locations
SET source_capture_mode = public.pick_event_source_capture_mode(website_url, instagram_url, facebook_url)
WHERE source_capture_mode IS NULL;

ALTER TABLE public.organizers
  DROP CONSTRAINT IF EXISTS organizers_source_capture_mode_check;

ALTER TABLE public.organizers
  ADD CONSTRAINT organizers_source_capture_mode_check
  CHECK (source_capture_mode = ANY (ARRAY['url'::text, 'image'::text, 'facebook'::text]));

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_source_capture_mode_check;

ALTER TABLE public.locations
  ADD CONSTRAINT locations_source_capture_mode_check
  CHECK (source_capture_mode = ANY (ARRAY['url'::text, 'image'::text, 'facebook'::text]));

ALTER TABLE public.organizers
  ALTER COLUMN source_capture_mode SET DEFAULT 'url';

ALTER TABLE public.locations
  ALTER COLUMN source_capture_mode SET DEFAULT 'url';

ALTER TABLE public.organizers
  ALTER COLUMN source_capture_mode SET NOT NULL;

ALTER TABLE public.locations
  ALTER COLUMN source_capture_mode SET NOT NULL;

COMMENT ON COLUMN public.organizers.source_capture_mode IS 'Mode de capture a appliquer a la source synchronisee depuis cet organisateur: url, image ou facebook.';
COMMENT ON COLUMN public.locations.source_capture_mode IS 'Mode de capture a appliquer a la source synchronisee depuis ce lieu-organisateur: url, image ou facebook.';

CREATE OR REPLACE FUNCTION public.pick_owner_source_capture_mode(
  explicit_mode text,
  website_url text,
  instagram_url text,
  facebook_url text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN explicit_mode = 'facebook' AND NULLIF(BTRIM(facebook_url), '') IS NOT NULL THEN 'facebook'
    WHEN explicit_mode = 'image' THEN 'image'
    WHEN explicit_mode = 'url' THEN 'url'
    ELSE public.pick_event_source_capture_mode(website_url, instagram_url, facebook_url)
  END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_owner_source_from_organizer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  derived_url text;
  derived_type text;
  derived_capture_mode text;
  existing_source_id uuid;
BEGIN
  derived_url := public.pick_event_source_url(NEW.website_url, NEW.instagram_url, NEW.facebook_url);
  derived_type := public.pick_event_source_type(NEW.website_url, NEW.instagram_url, NEW.facebook_url);
  derived_capture_mode := public.pick_owner_source_capture_mode(
    NEW.source_capture_mode,
    NEW.website_url,
    NEW.instagram_url,
    NEW.facebook_url
  );

  SELECT source_id
  INTO existing_source_id
  FROM public.owner_sources
  WHERE organizer_id = NEW.id;

  IF derived_url IS NULL THEN
    IF existing_source_id IS NOT NULL THEN
      UPDATE public.event_sources
      SET
        name = NEW.name,
        status = 'paused',
        organizer_id = NEW.id,
        organizer_location_id = NULL,
        source_scope = 'owner',
        notes = CONCAT_WS(
          E'\n',
          NULLIF(public.event_sources.notes, ''),
          '[auto] Owner source paused because no exploitable URL is available.'
        )
      WHERE id = existing_source_id;
    END IF;

    RETURN NEW;
  END IF;

  IF existing_source_id IS NULL THEN
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
    );
  ELSE
    UPDATE public.event_sources
    SET
      name = NEW.name,
      type = derived_type,
      default_capture_mode = derived_capture_mode,
      url = derived_url,
      organizer_id = NEW.id,
      organizer_location_id = NULL,
      source_scope = 'owner',
      status = CASE
        WHEN public.event_sources.status IN ('dead', 'duplicate') THEN public.event_sources.status
        ELSE 'active'
      END
    WHERE id = existing_source_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_owner_source_from_location()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  derived_url text;
  derived_type text;
  derived_capture_mode text;
  existing_source_id uuid;
BEGIN
  SELECT source_id
  INTO existing_source_id
  FROM public.owner_sources
  WHERE organizer_location_id = NEW.id;

  derived_url := public.pick_event_source_url(NEW.website_url, NEW.instagram_url, NEW.facebook_url);
  derived_type := public.pick_event_source_type(NEW.website_url, NEW.instagram_url, NEW.facebook_url);
  derived_capture_mode := public.pick_owner_source_capture_mode(
    NEW.source_capture_mode,
    NEW.website_url,
    NEW.instagram_url,
    NEW.facebook_url
  );

  IF NEW.is_organizer IS DISTINCT FROM TRUE OR derived_url IS NULL THEN
    IF existing_source_id IS NOT NULL THEN
      UPDATE public.event_sources
      SET
        name = NEW.name,
        status = 'paused',
        organizer_id = NULL,
        organizer_location_id = NEW.id,
        source_scope = 'owner',
        notes = CONCAT_WS(
          E'\n',
          NULLIF(public.event_sources.notes, ''),
          CASE
            WHEN NEW.is_organizer IS DISTINCT FROM TRUE
              THEN '[auto] Owner source paused because the location is no longer marked as organizer.'
            ELSE '[auto] Owner source paused because no exploitable URL is available.'
          END
        )
      WHERE id = existing_source_id;
    END IF;

    RETURN NEW;
  END IF;

  IF existing_source_id IS NULL THEN
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
      NULL,
      NEW.id,
      'active',
      NOW(),
      'owner'
    );
  ELSE
    UPDATE public.event_sources
    SET
      name = NEW.name,
      type = derived_type,
      default_capture_mode = derived_capture_mode,
      url = derived_url,
      organizer_id = NULL,
      organizer_location_id = NEW.id,
      source_scope = 'owner',
      status = CASE
        WHEN public.event_sources.status IN ('dead', 'duplicate') THEN public.event_sources.status
        ELSE 'active'
      END
    WHERE id = existing_source_id;
  END IF;

  RETURN NEW;
END;
$$;
