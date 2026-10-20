-- Tests de la casse des tags (migrations 20261020160000_capture_tag_title_case.sql et
-- 20261020223000_french_case_names.sql).
--
-- Sur une base jetable avec toutes les migrations : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des tags.

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tags) THEN
    RAISE EXCEPTION 'Base non vide : ces tests se lancent sur une base jetable (scripts/db-test.sh), jamais en prod.';
  END IF;
END $$;

CREATE FUNCTION pg_temp.verifie(nom text, obtenu text, attendu text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF obtenu IS DISTINCT FROM attendu THEN
    RAISE EXCEPTION 'ÉCHEC % : obtenu « % », attendu « % »', nom, obtenu, attendu;
  END IF;
  RAISE NOTICE 'ok  %', nom;
END $$;

SELECT pg_temp.verifie('fonction : tirets, soulignés, espaces',
  public.to_tag_title_case('  jazz-funk__live   SESSION ') || '|' || public.to_tag_title_case('DJ  set'),
  'Jazz Funk Live Session|DJ Set');
SELECT pg_temp.verifie('fonction : nul, vide, tirets seuls',
  coalesce(public.to_tag_title_case(NULL), '<nul>') || '|' || public.to_tag_title_case('   ') || '|'
    || public.to_tag_title_case(' -_ ') || '|',
  '<nul>|||');
-- Petits mots en minuscules sauf en tête, capitale après l'élision, capitales des mots ordinaires
-- retirées, sigles connus gardés (U34, 2026-10-20).
SELECT pg_temp.verifie('fonction : français',
  public.to_tag_title_case('théâtre d''orléans') || '|' || public.to_tag_title_case('Université D''orléans') || '|'
    || public.to_tag_title_case('Journée Nationale De La Laïcité') || '|' || public.to_tag_title_case('le jazz') || '|'
    || public.to_tag_title_case('ROCK') || '|' || public.to_tag_title_case('Cdno') || '|'
    || public.to_tag_title_case('Lynx Irl'),
  'Théâtre d''Orléans|Université d''Orléans|Journée Nationale de la Laïcité|Le Jazz|Rock|CDNO|Lynx IRL');

INSERT INTO public.tags (id, name) VALUES ('7a000000-0000-4000-8000-000000000001', 'musique-du-monde');
SELECT pg_temp.verifie('trigger : insertion',
  (SELECT name FROM public.tags WHERE id = '7a000000-0000-4000-8000-000000000001'), 'Musique du Monde');

UPDATE public.tags SET name = 'HIP_HOP' WHERE id = '7a000000-0000-4000-8000-000000000001';
SELECT pg_temp.verifie('trigger : mise à jour',
  (SELECT name FROM public.tags WHERE id = '7a000000-0000-4000-8000-000000000001'), 'Hip Hop');

ROLLBACK;
