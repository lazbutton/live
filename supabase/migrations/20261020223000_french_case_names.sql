-- Noms en français : capitale après « d' », « l' »…, petits mots des noms composés (U34).
--
-- Les noms de lieux, d'organisateurs et d'artistes passent par `format_entity_label` (trigger,
-- 20260415123000), ceux des tags par `to_tag_title_case` (trigger, 20261020160000). Tous deux
-- s'appuyaient sur `initcap`, qui en prod (collation ICU) ne coupe pas le mot à l'apostrophe :
-- « Théâtre d'orléans », « L'astrolabe », « Ville d'orléans », tags « Théâtre D'orléans »,
-- « Université D'orléans ». Corrigés à la main, ces noms revenaient à l'écriture suivante.
--
-- `format_entity_label`, sans dépendre de la collation :
--   - après une élision (d', l', qu'…), capitale à la lettre suivante : « Théâtre d'Orléans »,
--     « L'Astrolabe », « Cabaret l'Insolite » ;
--   - dans un nom composé, petits mots en minuscules : « Saint-Jean-le-Blanc », « Fleury-les-Aubrais » ;
--   - un petit mot en capitales n'est pas un sigle : « Hangar DE Chalette » → « Hangar de Chalette » ;
--     un mot élidé non plus : « L'EAU » → « L'Eau » ;
--   - virgule ou point-virgule final retiré (« Le Vinaigrier, »).
--   Inchangé : sigles en capitales de 4 lettres au plus (CCNO, DJ), petits mots en minuscules sauf en tête.
-- `to_tag_title_case` : tirets et soulignés en espaces comme avant, puis la même règle sur le nom en
-- minuscules (« JAZZ » → « Jazz »), quelques sigles gardés : « musique-du-monde » → « Musique du Monde »,
-- « DJ  set » → « DJ Set », « théâtre d'orléans » → « Théâtre d'Orléans ». Fonction du trigger et
-- trigger recréés à l'identique de 20261020160000 (rejouable, et la migration se suffit à elle-même).
--
-- Données (liste avant → après validée par l'utilisateur, journal du 2026-10-20) : les noms existants
-- repassent par la règle, puis quelques corrections nommées (accents, sigles). Un nom de lieu ou
-- d'organisateur modifié met une synchronisation Notion en file, comme une modification dans l'admin ;
-- le slug d'un artiste ne change pas (calculé en minuscules).
--
-- Rejouable : CREATE OR REPLACE, mises à jour limitées aux noms qui changent.

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
    part text;
    part_index integer;
    formatted_parts text[];
    elision text[];
    lowercase_words constant text[] := ARRAY[
        'de', 'des', 'du', 'la', 'le', 'les', 'et', 'ou', 'au', 'aux',
        'dans', 'en', 'sur', 'sous', 'chez'
    ];
    hyphen_words constant text[] := ARRAY[
        'au', 'aux', 'de', 'des', 'du', 'en', 'la', 'le', 'les', 'lès', 'sous', 'sur'
    ];
BEGIN
    cleaned := replace(cleaned, '’', '''');
    cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');
    cleaned := regexp_replace(cleaned, '\s*[,;]+$', '');

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

        IF token_index > 1 AND lower(token) = ANY (lowercase_words) THEN
            formatted_token := lower(token);
        ELSIF letters_only <> ''
              AND upper(token) = token
              AND char_length(letters_only) <= 4
              AND strpos(token, '''') = 0 THEN
            -- Sigle (« CCNO », « DJ ») ; « L'EAU » est un mot.
            formatted_token := token;
        ELSE
            -- Partie par partie : « Saint-Jean-le-Blanc », « d'Hommes-Orchestres ».
            formatted_parts := ARRAY[]::text[];
            part_index := 0;
            FOREACH part IN ARRAY string_to_array(token, '-') LOOP
                part_index := part_index + 1;
                elision := regexp_match(part, '^(qu|[cdjlmnst])''(.+)$', 'i');
                IF part_index > 1 AND lower(part) = ANY (hyphen_words) THEN
                    formatted_parts := array_append(formatted_parts, lower(part));
                ELSIF elision IS NOT NULL THEN
                    -- Capitale après l'élision, que la collation coupe ou non le mot à l'apostrophe.
                    formatted_parts := array_append(
                        formatted_parts,
                        CASE
                            WHEN token_index = 1 AND part_index = 1 THEN initcap(lower(elision[1]))
                            ELSE lower(elision[1])
                        END
                        || ''''
                        || upper(left(elision[2], 1))
                        || substr(initcap(lower(elision[2])), 2)
                    );
                ELSE
                    formatted_parts := array_append(formatted_parts, initcap(lower(part)));
                END IF;
            END LOOP;
            formatted_token := array_to_string(formatted_parts, '-');
        END IF;

        formatted_tokens := array_append(formatted_tokens, formatted_token);
    END LOOP;

    RETURN array_to_string(formatted_tokens, ' ');
END;
$$;

COMMENT ON FUNCTION public.format_entity_label(text) IS
'Applique un formatage homogène aux noms d’artistes, lieux et organisateurs avant écriture en base (capitale après une élision, petits mots en minuscules, sigles gardés).';

CREATE OR REPLACE FUNCTION public.to_tag_title_case(input_text text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  cleaned text;
  words text[];
  acronyms constant text[] := array['ccno', 'cdno', 'crij', 'dj', 'esad', 'frac', 'irl', 'mc', 'vj'];
begin
  if input_text is null then
    return null;
  end if;

  cleaned := trim(input_text);
  cleaned := regexp_replace(cleaned, '[_\-]+', ' ', 'g');
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');
  cleaned := trim(cleaned);

  if cleaned = '' then
    return '';
  end if;

  select array_agg(case when lower(word) = any (acronyms) then upper(word) else word end order by position)
  into words
  from unnest(string_to_array(public.format_entity_label(lower(cleaned)), ' ')) with ordinality as t(word, position);

  return array_to_string(words, ' ');
end;
$function$;

CREATE OR REPLACE FUNCTION public.tags_force_title_case()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.name := public.to_tag_title_case(new.name);
  return new;
end;
$function$;

CREATE OR REPLACE TRIGGER trg_tags_force_title_case
  BEFORE INSERT OR UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.tags_force_title_case();

-- Noms existants : le trigger de chaque table leur applique la nouvelle règle.
UPDATE public.locations SET name = name WHERE name IS DISTINCT FROM public.format_entity_label(name);
UPDATE public.organizers SET name = name WHERE name IS DISTINCT FROM public.format_entity_label(name);
UPDATE public.artists SET name = name WHERE name IS DISTINCT FROM public.format_entity_label(name);
UPDATE public.tags SET name = name WHERE name IS DISTINCT FROM public.to_tag_title_case(name);

-- Corrections nommées : accents et sigles que la règle ne peut pas deviner.
UPDATE public.categories SET name = 'Cinéma' WHERE name = 'Cinema';
UPDATE public.locations SET name = 'Château de la Source' WHERE name = 'Chateau de la Source';
UPDATE public.locations SET name = 'Base de Loisirs de Chécy' WHERE name = 'Base de Loisirs de Checy';
UPDATE public.artists SET name = 'Collectif XY' WHERE name = 'Collectif Xy';
UPDATE public.tags SET name = 'Orléans' WHERE name = 'Orleans';

-- Rollback : recréer format_entity_label (20260415123000) et to_tag_title_case (20261020160000) ;
-- les noms corrigés restent (ils s'écrivaient mal, pas autrement).
