DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_sources_required_entity_link_check'
  ) THEN
    ALTER TABLE public.event_sources
      ADD CONSTRAINT event_sources_required_entity_link_check
      CHECK (
        location_id IS NOT NULL
        OR organizer_id IS NOT NULL
        OR organizer_location_id IS NOT NULL
      )
      NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT event_sources_required_entity_link_check
  ON public.event_sources
  IS 'Chaque source de collecte doit être rattachée à au moins un lieu, un organisateur classique ou un lieu organisateur.';
