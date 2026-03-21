-- Migration: fix_city_extraction_and_cleanup_existing_cities
-- Description: corrige l'extraction de ville depuis les adresses complètes
-- et nettoie les enregistrements cities déjà créés à partir d'adresses.

CREATE OR REPLACE FUNCTION public.extract_city_label_from_address(address text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    cleaned text := regexp_replace(trim(coalesce(address, '')), '\s+', ' ', 'g');
    extracted text;
    trailing_segment text;
BEGIN
    IF cleaned = '' THEN
        RETURN NULL;
    END IF;

    extracted := substring(
        cleaned FROM '(?:^|,|\s)\d{5}\s+([[:alpha:]][[:alpha:][:space:]''’\-]+)$'
    );

    IF extracted IS NOT NULL AND trim(extracted) <> '' THEN
        RETURN regexp_replace(trim(extracted), '\s+', ' ', 'g');
    END IF;

    trailing_segment := trim(
        split_part(cleaned, ',', array_length(regexp_split_to_array(cleaned, ','), 1))
    );

    IF trailing_segment <> '' THEN
        extracted := trim(regexp_replace(trailing_segment, '^\d{5}\s+', '', 'g'));
        IF extracted <> '' AND extracted !~ '\d' THEN
            RETURN regexp_replace(extracted, '\s+', ' ', 'g');
        END IF;
    END IF;

    IF cleaned !~ '\d' AND cleaned ~ '^[[:alpha:]][[:alpha:][:space:]''’\-]+$' THEN
        RETURN cleaned;
    END IF;

    RETURN NULL;
END;
$$;

UPDATE public.locations
SET city_id = public.resolve_city_id_from_address(address, latitude, longitude)
WHERE address IS NOT NULL
  AND trim(address) <> '';

UPDATE public.major_events
SET city_id = COALESCE(
    public.resolve_city_id_from_address(
        city_name,
        map_center_latitude,
        map_center_longitude
    ),
    public.upsert_city(
        city_name,
        map_center_latitude,
        map_center_longitude
    )
)
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

DELETE FROM public.cities AS c
WHERE NOT EXISTS (
    SELECT 1
    FROM public.locations AS l
    WHERE l.city_id = c.id
)
AND NOT EXISTS (
    SELECT 1
    FROM public.major_events AS me
    WHERE me.city_id = c.id
);
