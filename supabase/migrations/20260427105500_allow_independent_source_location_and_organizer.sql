ALTER TABLE public.event_sources
  DROP CONSTRAINT IF EXISTS event_sources_single_entity_link_check;

ALTER TABLE public.event_sources
  ADD COLUMN IF NOT EXISTS organizer_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_sources_single_organizer_owner_check'
  ) THEN
    ALTER TABLE public.event_sources
      ADD CONSTRAINT event_sources_single_organizer_owner_check
      CHECK (organizer_id IS NULL OR organizer_location_id IS NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS event_sources_organizer_location_idx
  ON public.event_sources(organizer_location_id)
  WHERE organizer_location_id IS NOT NULL;

COMMENT ON COLUMN public.event_sources.location_id IS 'Lieu associé à cette source de collecte. Indépendant de l’organisateur.';
COMMENT ON COLUMN public.event_sources.organizer_id IS 'Organisateur classique associé à cette source de collecte. Exclusif avec organizer_location_id.';
COMMENT ON COLUMN public.event_sources.organizer_location_id IS 'Lieu organisateur associé à cette source de collecte. Exclusif avec organizer_id, indépendant du lieu principal.';
