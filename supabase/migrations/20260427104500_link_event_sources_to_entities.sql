ALTER TABLE public.event_sources
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS organizer_id uuid REFERENCES public.organizers(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_sources_single_entity_link_check'
  ) THEN
    ALTER TABLE public.event_sources
      ADD CONSTRAINT event_sources_single_entity_link_check
      CHECK (location_id IS NULL OR organizer_id IS NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS event_sources_location_idx
  ON public.event_sources(location_id)
  WHERE location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_sources_organizer_idx
  ON public.event_sources(organizer_id)
  WHERE organizer_id IS NOT NULL;

COMMENT ON COLUMN public.event_sources.location_id IS 'Lieu associé à cette source de collecte, si la source représente principalement un lieu.';
COMMENT ON COLUMN public.event_sources.organizer_id IS 'Organisateur associé à cette source de collecte, si la source représente principalement un organisateur.';
