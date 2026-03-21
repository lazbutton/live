-- Migration: add_city_id_to_events
-- Description: rattache les evenements a une ville pour permettre
-- des requetes publiques filtrees cote base, sans charger tout le catalogue.

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.events.city_id IS 'Ville de rattachement de l''evenement, synchronisee automatiquement depuis le lieu ou l''adresse.';

CREATE INDEX IF NOT EXISTS idx_events_city_id ON public.events USING btree (city_id);

CREATE OR REPLACE FUNCTION public.sync_event_city()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_city_id uuid;
BEGIN
    resolved_city_id := NULL;

    IF NEW.location_id IS NOT NULL THEN
        SELECT city_id
        INTO resolved_city_id
        FROM public.locations
        WHERE id = NEW.location_id;
    END IF;

    IF resolved_city_id IS NULL THEN
        resolved_city_id := public.resolve_city_id_from_address(
            NEW.address,
            NEW.latitude,
            NEW.longitude
        );
    END IF;

    NEW.city_id := resolved_city_id;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_events_from_location_city_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.events
    SET city_id = NEW.city_id
    WHERE location_id = NEW.id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_event_city_before_write ON public.events;
CREATE TRIGGER sync_event_city_before_write
    BEFORE INSERT OR UPDATE OF location_id, address, latitude, longitude ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_event_city();

DROP TRIGGER IF EXISTS sync_event_city_after_location_write ON public.locations;
CREATE TRIGGER sync_event_city_after_location_write
    AFTER INSERT OR UPDATE OF city_id ON public.locations
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_events_from_location_city_change();

UPDATE public.events AS e
SET city_id = l.city_id
FROM public.locations AS l
WHERE e.location_id = l.id
  AND e.city_id IS DISTINCT FROM l.city_id;

UPDATE public.events
SET city_id = public.resolve_city_id_from_address(address, latitude, longitude)
WHERE city_id IS NULL
  AND address IS NOT NULL
  AND trim(address) <> '';
