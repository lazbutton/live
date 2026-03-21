-- Migration: create_cities_and_link_locations
-- Description: ajoute une entité cities, relie les lieux et les Multi-événements,
-- puis synchronise automatiquement les villes à partir des adresses existantes.

CREATE TABLE public.cities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    label_normalized text NOT NULL,
    center_lat numeric(10,8),
    center_lng numeric(11,8),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cities_pkey PRIMARY KEY (id),
    CONSTRAINT cities_slug_key UNIQUE (slug),
    CONSTRAINT cities_label_normalized_key UNIQUE (label_normalized)
);

COMMENT ON TABLE public.cities IS 'Catalogue des villes / territoires disponibles pour les filtres publics et les rattachements éditoriaux.';
COMMENT ON COLUMN public.cities.center_lat IS 'Latitude de référence pour le périmètre public.';
COMMENT ON COLUMN public.cities.center_lng IS 'Longitude de référence pour le périmètre public.';

CREATE INDEX idx_cities_is_active ON public.cities USING btree (is_active);

CREATE TRIGGER update_cities_updated_at
    BEFORE UPDATE ON public.cities
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cities are viewable by everyone"
    ON public.cities
    FOR SELECT
    USING (is_active = true);

CREATE POLICY "Admins can manage cities"
    ON public.cities
    USING (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)))
    WITH CHECK (((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true)));

ALTER TABLE public.locations
    ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.locations.city_id IS 'Ville de rattachement déduite automatiquement depuis l’adresse du lieu.';

ALTER TABLE public.major_events
    ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.major_events.city_id IS 'Ville principale éditoriale du Multi-événements.';

CREATE INDEX IF NOT EXISTS idx_locations_city_id ON public.locations USING btree (city_id);
CREATE INDEX IF NOT EXISTS idx_major_events_city_id ON public.major_events USING btree (city_id);

CREATE OR REPLACE FUNCTION public.normalize_city_label(value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    normalized text := lower(trim(coalesce(value, '')));
BEGIN
    normalized := replace(normalized, 'à', 'a');
    normalized := replace(normalized, 'â', 'a');
    normalized := replace(normalized, 'ä', 'a');
    normalized := replace(normalized, 'á', 'a');
    normalized := replace(normalized, 'ã', 'a');
    normalized := replace(normalized, 'ç', 'c');
    normalized := replace(normalized, 'é', 'e');
    normalized := replace(normalized, 'è', 'e');
    normalized := replace(normalized, 'ê', 'e');
    normalized := replace(normalized, 'ë', 'e');
    normalized := replace(normalized, 'î', 'i');
    normalized := replace(normalized, 'ï', 'i');
    normalized := replace(normalized, 'ì', 'i');
    normalized := replace(normalized, 'í', 'i');
    normalized := replace(normalized, 'ô', 'o');
    normalized := replace(normalized, 'ö', 'o');
    normalized := replace(normalized, 'ò', 'o');
    normalized := replace(normalized, 'ó', 'o');
    normalized := replace(normalized, 'õ', 'o');
    normalized := replace(normalized, 'ù', 'u');
    normalized := replace(normalized, 'û', 'u');
    normalized := replace(normalized, 'ü', 'u');
    normalized := replace(normalized, 'ú', 'u');
    normalized := replace(normalized, 'œ', 'oe');
    normalized := replace(normalized, 'æ', 'ae');
    normalized := regexp_replace(normalized, '[^a-z0-9]+', ' ', 'g');
    normalized := regexp_replace(normalized, '\s+', ' ', 'g');
    RETURN trim(normalized);
END;
$$;

CREATE OR REPLACE FUNCTION public.slugify_city_label(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT replace(public.normalize_city_label(value), ' ', '-');
$$;

CREATE OR REPLACE FUNCTION public.extract_city_label_from_address(address text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    cleaned text := trim(coalesce(address, ''));
    extracted text;
BEGIN
    IF cleaned = '' THEN
        RETURN NULL;
    END IF;

    extracted := substring(cleaned FROM '(?:^|,\s*)(?:\d{5}\s+)?([[:alpha:]][[:alpha:][:space:]''’\-]+)\s*$');

    IF extracted IS NULL OR trim(extracted) = '' THEN
        extracted := trim(split_part(cleaned, ',', array_length(regexp_split_to_array(cleaned, ','), 1)));
    END IF;

    IF extracted IS NULL OR trim(extracted) = '' THEN
        RETURN NULL;
    END IF;

    RETURN regexp_replace(trim(extracted), '\s+', ' ', 'g');
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_city(
    p_label text,
    p_center_lat numeric DEFAULT NULL,
    p_center_lng numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    cleaned_label text := nullif(trim(coalesce(p_label, '')), '');
    normalized_label text;
    next_slug text;
    resolved_id uuid;
BEGIN
    IF cleaned_label IS NULL THEN
        RETURN NULL;
    END IF;

    normalized_label := public.normalize_city_label(cleaned_label);
    IF normalized_label = '' THEN
        RETURN NULL;
    END IF;

    next_slug := public.slugify_city_label(cleaned_label);

    INSERT INTO public.cities (
        slug,
        label,
        label_normalized,
        center_lat,
        center_lng,
        is_active
    )
    VALUES (
        next_slug,
        cleaned_label,
        normalized_label,
        p_center_lat,
        p_center_lng,
        true
    )
    ON CONFLICT (label_normalized) DO UPDATE
    SET
        slug = EXCLUDED.slug,
        label = EXCLUDED.label,
        center_lat = COALESCE(public.cities.center_lat, EXCLUDED.center_lat),
        center_lng = COALESCE(public.cities.center_lng, EXCLUDED.center_lng),
        is_active = true
    RETURNING id INTO resolved_id;

    RETURN resolved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_city_id_from_address(
    p_address text,
    p_center_lat numeric DEFAULT NULL,
    p_center_lng numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    city_label text;
BEGIN
    city_label := public.extract_city_label_from_address(p_address);
    IF city_label IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN public.upsert_city(city_label, p_center_lat, p_center_lng);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_city_center(p_city_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_city_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.cities AS c
    SET
        center_lat = stats.avg_lat,
        center_lng = stats.avg_lng
    FROM (
        SELECT
            city_id,
            avg(latitude)::numeric(10,8) AS avg_lat,
            avg(longitude)::numeric(11,8) AS avg_lng
        FROM public.locations
        WHERE city_id = p_city_id
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
        GROUP BY city_id
    ) AS stats
    WHERE c.id = stats.city_id
      AND stats.avg_lat IS NOT NULL
      AND stats.avg_lng IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_location_city()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.city_id := public.resolve_city_id_from_address(
        NEW.address,
        NEW.latitude,
        NEW.longitude
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_city_center_from_location_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.refresh_city_center(OLD.city_id);
        RETURN OLD;
    END IF;

    PERFORM public.refresh_city_center(NEW.city_id);

    IF TG_OP = 'UPDATE' AND OLD.city_id IS DISTINCT FROM NEW.city_id THEN
        PERFORM public.refresh_city_center(OLD.city_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_location_city_before_write ON public.locations;
CREATE TRIGGER sync_location_city_before_write
    BEFORE INSERT OR UPDATE OF address, latitude, longitude ON public.locations
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_location_city();

DROP TRIGGER IF EXISTS refresh_city_center_after_location_write ON public.locations;
CREATE TRIGGER refresh_city_center_after_location_write
    AFTER INSERT OR UPDATE OF city_id, latitude, longitude ON public.locations
    FOR EACH ROW
    EXECUTE FUNCTION public.refresh_city_center_from_location_change();

DROP TRIGGER IF EXISTS refresh_city_center_after_location_delete ON public.locations;
CREATE TRIGGER refresh_city_center_after_location_delete
    AFTER DELETE ON public.locations
    FOR EACH ROW
    EXECUTE FUNCTION public.refresh_city_center_from_location_change();

CREATE OR REPLACE FUNCTION public.sync_major_event_city()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_city_id uuid;
    resolved_city_label text;
BEGIN
    IF NEW.city_id IS NOT NULL THEN
        SELECT label
        INTO resolved_city_label
        FROM public.cities
        WHERE id = NEW.city_id;

        IF resolved_city_label IS NOT NULL THEN
            NEW.city_name := resolved_city_label;
            RETURN NEW;
        END IF;
    END IF;

    resolved_city_id := public.upsert_city(
        NEW.city_name,
        NEW.map_center_latitude,
        NEW.map_center_longitude
    );

    NEW.city_id := resolved_city_id;

    IF resolved_city_id IS NOT NULL THEN
        SELECT label
        INTO resolved_city_label
        FROM public.cities
        WHERE id = resolved_city_id;
        NEW.city_name := resolved_city_label;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_major_event_city_before_write ON public.major_events;
CREATE TRIGGER sync_major_event_city_before_write
    BEFORE INSERT OR UPDATE OF city_id, city_name, map_center_latitude, map_center_longitude ON public.major_events
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_major_event_city();

UPDATE public.locations
SET city_id = public.resolve_city_id_from_address(address, latitude, longitude)
WHERE address IS NOT NULL
  AND trim(address) <> '';

UPDATE public.major_events
SET city_id = public.upsert_city(city_name, map_center_latitude, map_center_longitude)
WHERE city_name IS NOT NULL
  AND trim(city_name) <> '';

UPDATE public.major_events AS me
SET city_name = c.label
FROM public.cities AS c
WHERE me.city_id = c.id
  AND me.city_id IS NOT NULL;

UPDATE public.cities AS c
SET
    center_lat = stats.avg_lat,
    center_lng = stats.avg_lng
FROM (
    SELECT
        city_id,
        avg(latitude)::numeric(10,8) AS avg_lat,
        avg(longitude)::numeric(11,8) AS avg_lng
    FROM public.locations
    WHERE city_id IS NOT NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
    GROUP BY city_id
) AS stats
WHERE c.id = stats.city_id
  AND stats.avg_lat IS NOT NULL
  AND stats.avg_lng IS NOT NULL;
