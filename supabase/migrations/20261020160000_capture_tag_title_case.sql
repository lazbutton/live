-- Noms de tags en casse titre : reprise de ce qui existe en prod.
--
-- `to_tag_title_case(text)`, `tags_force_title_case()` et le trigger `trg_tags_force_title_case`
-- (BEFORE INSERT OR UPDATE sur `tags`) ont été créés en prod hors migrations (date inconnue, absents des
-- archives). Relevés le 2026-10-20 (pg_get_functiondef, pg_get_triggerdef) et recopiés ici à
-- l'identique : mêmes corps, IMMUTABLE pour la première, VOLATILE (par défaut) pour la fonction du
-- trigger, SECURITY INVOKER, aucune clause SET, droits par défaut (execute pour tous).
-- Les 163 tags de la prod respectaient déjà la règle ce jour-là.
--
-- Règle : espaces de bord retirés, `_` et `-` remplacés par des espaces, espaces multiples réduits,
-- puis `initcap(lower(…))` (« jazz-funk » → « Jazz Funk », « DJ  set » → « Dj Set »).
--
-- Rejouable : CREATE OR REPLACE. Rien à appliquer en prod, où ces objets sont déjà identiques.

CREATE OR REPLACE FUNCTION public.to_tag_title_case(input_text text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  cleaned text;
begin
  if input_text is null then
    return null;
  end if;

  cleaned := trim(input_text);
  cleaned := regexp_replace(cleaned, '[_\-]+', ' ', 'g');
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');

  if cleaned = '' then
    return '';
  end if;

  return initcap(lower(cleaned));
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

-- Rollback : DROP TRIGGER IF EXISTS trg_tags_force_title_case ON public.tags;
-- DROP FUNCTION IF EXISTS public.tags_force_title_case(); DROP FUNCTION IF EXISTS public.to_tag_title_case(text);
