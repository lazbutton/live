DROP INDEX IF EXISTS public.event_sources_location_idx;

ALTER TABLE public.event_sources
  DROP CONSTRAINT IF EXISTS event_sources_single_entity_link_check;

ALTER TABLE public.event_sources
  DROP CONSTRAINT IF EXISTS event_sources_required_entity_link_check;

ALTER TABLE public.event_sources
  ADD CONSTRAINT event_sources_required_entity_link_check
  CHECK (organizer_id IS NOT NULL OR organizer_location_id IS NOT NULL)
  NOT VALID;

COMMENT ON CONSTRAINT event_sources_required_entity_link_check
  ON public.event_sources
  IS 'Chaque source de collecte doit etre rattachee a un organisateur classique ou a un lieu organisateur.';

ALTER TABLE public.event_sources
  DROP COLUMN IF EXISTS location_id;
