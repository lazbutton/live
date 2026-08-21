CREATE TABLE IF NOT EXISTS public.owner_sources (
  source_id uuid PRIMARY KEY REFERENCES public.event_sources(id) ON DELETE CASCADE,
  organizer_id uuid REFERENCES public.organizers(id) ON DELETE CASCADE,
  organizer_location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT owner_sources_single_owner_check
    CHECK (
      (organizer_id IS NOT NULL AND organizer_location_id IS NULL)
      OR (organizer_id IS NULL AND organizer_location_id IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.global_sources (
  source_id uuid PRIMARY KEY REFERENCES public.event_sources(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS owner_sources_organizer_unique_idx
  ON public.owner_sources(organizer_id)
  WHERE organizer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS owner_sources_organizer_location_unique_idx
  ON public.owner_sources(organizer_location_id)
  WHERE organizer_location_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_owner_sources_updated_at
ON public.owner_sources;

CREATE TRIGGER update_owner_sources_updated_at
  BEFORE UPDATE ON public.owner_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_global_sources_updated_at
ON public.global_sources;

CREATE TRIGGER update_global_sources_updated_at
  BEFORE UPDATE ON public.global_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.owner_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage owner sources"
  ON public.owner_sources
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

CREATE POLICY "Admins can manage global sources"
  ON public.global_sources
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

CREATE OR REPLACE FUNCTION public.sync_source_partition_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source_scope = 'owner' THEN
    INSERT INTO public.owner_sources (
      source_id,
      organizer_id,
      organizer_location_id,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.organizer_id,
      NEW.organizer_location_id,
      COALESCE(NEW.created_at, now()),
      COALESCE(NEW.updated_at, now())
    )
    ON CONFLICT (source_id)
    DO UPDATE SET
      organizer_id = EXCLUDED.organizer_id,
      organizer_location_id = EXCLUDED.organizer_location_id,
      updated_at = now();

    DELETE FROM public.global_sources
    WHERE source_id = NEW.id;
  ELSIF NEW.source_scope = 'global' THEN
    INSERT INTO public.global_sources (source_id, created_at, updated_at)
    VALUES (
      NEW.id,
      COALESCE(NEW.created_at, now()),
      COALESCE(NEW.updated_at, now())
    )
    ON CONFLICT (source_id)
    DO UPDATE SET
      updated_at = now();

    DELETE FROM public.owner_sources
    WHERE source_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_source_partition_membership_trigger
ON public.event_sources;

CREATE TRIGGER sync_source_partition_membership_trigger
AFTER INSERT OR UPDATE OF source_scope, organizer_id, organizer_location_id
ON public.event_sources
FOR EACH ROW
EXECUTE FUNCTION public.sync_source_partition_membership();

INSERT INTO public.owner_sources (
  source_id,
  organizer_id,
  organizer_location_id,
  created_at,
  updated_at
)
SELECT
  source.id,
  source.organizer_id,
  source.organizer_location_id,
  source.created_at,
  source.updated_at
FROM public.event_sources AS source
WHERE source.source_scope = 'owner'
  AND (source.organizer_id IS NOT NULL OR source.organizer_location_id IS NOT NULL)
ON CONFLICT (source_id)
DO UPDATE SET
  organizer_id = EXCLUDED.organizer_id,
  organizer_location_id = EXCLUDED.organizer_location_id,
  updated_at = now();

INSERT INTO public.global_sources (
  source_id,
  created_at,
  updated_at
)
SELECT
  source.id,
  source.created_at,
  source.updated_at
FROM public.event_sources AS source
WHERE source.source_scope = 'global'
ON CONFLICT (source_id)
DO UPDATE SET
  updated_at = now();

DELETE FROM public.owner_sources
WHERE source_id IN (
  SELECT id FROM public.event_sources WHERE source_scope = 'global'
);

DELETE FROM public.global_sources
WHERE source_id IN (
  SELECT id FROM public.event_sources WHERE source_scope = 'owner'
);

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
  derived_capture_mode := public.pick_event_source_capture_mode(
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
  derived_capture_mode := public.pick_event_source_capture_mode(
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

DROP TRIGGER IF EXISTS upsert_event_source_from_organizer_trigger
ON public.organizers;

DROP TRIGGER IF EXISTS upsert_event_source_from_organizer_location_trigger
ON public.locations;

CREATE TRIGGER upsert_owner_source_from_organizer_trigger
AFTER INSERT OR UPDATE OF name, website_url, instagram_url, facebook_url
ON public.organizers
FOR EACH ROW
EXECUTE FUNCTION public.upsert_owner_source_from_organizer();

CREATE TRIGGER upsert_owner_source_from_location_trigger
AFTER INSERT OR UPDATE OF name, is_organizer, website_url, instagram_url, facebook_url
ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.upsert_owner_source_from_location();

CREATE OR REPLACE VIEW public.intake_sources_view AS
SELECT
  source.id,
  source.name,
  source.type,
  CASE
    WHEN owner.source_id IS NOT NULL THEN 'owner'::text
    ELSE 'global'::text
  END AS source_scope,
  (global_source.source_id IS NOT NULL) AS is_editable,
  source.default_capture_mode,
  source.url,
  owner.organizer_id,
  owner.organizer_location_id,
  source.priority,
  source.scan_frequency_days,
  source.last_scanned_at,
  source.next_scan_at,
  source.status,
  source.reliability_score,
  source.novelty_score,
  source.average_scan_minutes,
  source.category_hint,
  source.city_hint,
  source.notes,
  source.scan_count,
  source.discovery_count,
  source.last_found_at,
  source.created_at,
  source.updated_at
FROM public.event_sources AS source
LEFT JOIN public.owner_sources AS owner
  ON owner.source_id = source.id
LEFT JOIN public.global_sources AS global_source
  ON global_source.source_id = source.id
WHERE owner.source_id IS NOT NULL OR global_source.source_id IS NOT NULL;

COMMENT ON VIEW public.intake_sources_view IS 'Vue unifiee des sources de collecte en lecture: owner_sources auto-sync et global_sources manuelles.';

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
INNER JOIN public.global_sources AS global_source
  ON global_source.source_id = source.id

UNION ALL

SELECT
  'unclassified_source'::text AS issue_type,
  'source'::text AS owner_type,
  source.id AS owner_id,
  source.name AS owner_name,
  source.id AS source_id,
  source.name AS source_name
FROM public.event_sources AS source
LEFT JOIN public.owner_sources AS owner
  ON owner.source_id = source.id
LEFT JOIN public.global_sources AS global_source
  ON global_source.source_id = source.id
WHERE owner.source_id IS NULL
  AND global_source.source_id IS NULL;

COMMENT ON VIEW public.event_source_sync_audit IS 'Rapport de controle du split owner/global sources: owners sans URL exploitable, sources globales et sources non classees.';
