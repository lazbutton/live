CREATE OR REPLACE FUNCTION public.normalize_entity_label(value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    normalized text := lower(trim(coalesce(value, '')));
BEGIN
    normalized := replace(normalized, '’', '''');
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

COMMENT ON FUNCTION public.normalize_entity_label(text) IS
'Normalise un libellé métier (artiste, lieu, organisateur) pour les comparaisons techniques.';

CREATE OR REPLACE FUNCTION public.format_entity_label(value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    cleaned text := trim(coalesce(value, ''));
    raw_tokens text[];
    token text;
    formatted_tokens text[] := ARRAY[]::text[];
    formatted_token text;
    letters_only text;
    token_index integer := 0;
    apostrophe_pos integer;
    apostrophe_prefix text;
    lowercase_words constant text[] := ARRAY[
        'de', 'des', 'du', 'la', 'le', 'les', 'et', 'ou', 'au', 'aux',
        'dans', 'en', 'sur', 'sous', 'chez'
    ];
BEGIN
    cleaned := replace(cleaned, '’', '''');
    cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');

    IF cleaned = '' THEN
        RETURN '';
    END IF;

    raw_tokens := regexp_split_to_array(cleaned, '\s+');

    FOREACH token IN ARRAY raw_tokens LOOP
        IF token IS NULL OR token = '' THEN
            CONTINUE;
        END IF;

        token_index := token_index + 1;
        letters_only := regexp_replace(token, '[^[:alpha:]]', '', 'g');

        IF letters_only <> ''
           AND upper(token) = token
           AND char_length(letters_only) <= 4 THEN
            formatted_token := upper(token);
        ELSIF token_index > 1
              AND lower(token) = ANY (lowercase_words) THEN
            formatted_token := lower(token);
        ELSE
            formatted_token := initcap(lower(token));

            IF token_index > 1 THEN
                apostrophe_pos := strpos(formatted_token, '''');
                IF apostrophe_pos IN (2, 3) THEN
                    apostrophe_prefix := substring(
                        formatted_token
                        FROM 1
                        FOR apostrophe_pos - 1
                    );

                    IF lower(apostrophe_prefix) = ANY (
                        ARRAY['d', 'l', 'j', 'm', 'n', 's', 't', 'c', 'qu']
                    ) THEN
                        formatted_token :=
                            lower(apostrophe_prefix) ||
                            substring(formatted_token FROM apostrophe_pos);
                    END IF;
                END IF;
            END IF;
        END IF;

        formatted_tokens := array_append(formatted_tokens, formatted_token);
    END LOOP;

    RETURN array_to_string(formatted_tokens, ' ');
END;
$$;

COMMENT ON FUNCTION public.format_entity_label(text) IS
'Applique un formatage homogène aux noms d’artistes, lieux et organisateurs avant écriture en base.';

CREATE OR REPLACE FUNCTION public.format_entity_name_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.name := public.format_entity_label(NEW.name);
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.format_entity_name_trigger() IS
'Trigger générique de formatage automatique du champ name.';

DROP TRIGGER IF EXISTS format_location_name_before_write ON public.locations;
CREATE TRIGGER format_location_name_before_write
BEFORE INSERT OR UPDATE OF name ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.format_entity_name_trigger();

DROP TRIGGER IF EXISTS format_organizer_name_before_write ON public.organizers;
CREATE TRIGGER format_organizer_name_before_write
BEFORE INSERT OR UPDATE OF name ON public.organizers
FOR EACH ROW
EXECUTE FUNCTION public.format_entity_name_trigger();

DROP TRIGGER IF EXISTS "00_format_artist_name_before_write" ON public.artists;
CREATE TRIGGER "00_format_artist_name_before_write"
BEFORE INSERT OR UPDATE OF name ON public.artists
FOR EACH ROW
EXECUTE FUNCTION public.format_entity_name_trigger();

DO $$
DECLARE
    updated_locations integer := 0;
    updated_organizers integer := 0;
    updated_artists integer := 0;
    duplicate_locations text[];
    duplicate_organizers text[];
    duplicate_artists text[];
BEGIN
    SELECT array_agg(normalized_name ORDER BY normalized_name)
    INTO duplicate_locations
    FROM (
        SELECT public.format_entity_label(name) AS normalized_name
        FROM public.locations
        GROUP BY 1
        HAVING count(*) > 1
    ) duplicates;

    IF duplicate_locations IS NOT NULL THEN
        RAISE NOTICE
            'Location canonical-name duplicates detected before formatting: %',
            array_to_string(duplicate_locations, ', ');
    END IF;

    SELECT array_agg(normalized_name ORDER BY normalized_name)
    INTO duplicate_organizers
    FROM (
        SELECT public.format_entity_label(name) AS normalized_name
        FROM public.organizers
        GROUP BY 1
        HAVING count(*) > 1
    ) duplicates;

    IF duplicate_organizers IS NOT NULL THEN
        RAISE NOTICE
            'Organizer canonical-name duplicates detected before formatting: %',
            array_to_string(duplicate_organizers, ', ');
    END IF;

    SELECT array_agg(normalized_name ORDER BY normalized_name)
    INTO duplicate_artists
    FROM (
        SELECT public.format_entity_label(name) AS normalized_name
        FROM public.artists
        GROUP BY 1
        HAVING count(*) > 1
    ) duplicates;

    IF duplicate_artists IS NOT NULL THEN
        RAISE NOTICE
            'Artist canonical-name duplicates detected before formatting: %',
            array_to_string(duplicate_artists, ', ');
    END IF;

    UPDATE public.locations
    SET name = public.format_entity_label(name)
    WHERE name IS DISTINCT FROM public.format_entity_label(name);
    GET DIAGNOSTICS updated_locations = ROW_COUNT;

    UPDATE public.organizers
    SET name = public.format_entity_label(name)
    WHERE name IS DISTINCT FROM public.format_entity_label(name);
    GET DIAGNOSTICS updated_organizers = ROW_COUNT;

    UPDATE public.artists
    SET name = public.format_entity_label(name)
    WHERE name IS DISTINCT FROM public.format_entity_label(name);
    GET DIAGNOSTICS updated_artists = ROW_COUNT;

    RAISE NOTICE
        'Formatted entity names - locations: %, organizers: %, artists: %',
        updated_locations,
        updated_organizers,
        updated_artists;
END;
$$;
