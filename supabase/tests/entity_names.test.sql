-- Tests des noms de lieux, d'organisateurs et d'artistes (migration 20261020223000_french_case_names.sql,
-- règle de format_entity_label et trigger format_entity_name_trigger).
--
-- Sur une base jetable avec toutes les migrations : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des lieux.

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.locations) THEN
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

CREATE FUNCTION pg_temp.f(valeurs text[]) RETURNS text
LANGUAGE sql AS $$
  SELECT string_agg(public.format_entity_label(v), '|' ORDER BY n) FROM unnest(valeurs) WITH ORDINALITY AS t(v, n)
$$;

-- Noms relevés en prod le 2026-10-20 (avant → après).
SELECT pg_temp.verifie('élision : capitale à la lettre suivante',
  pg_temp.f(ARRAY['Théâtre d''orléans', 'L''astrolabe', 'Ville d’orléans', 'Cabaret l''insolite',
                  'Salle de l''institut', 'L''orchestre d''hommes-Orchestres']),
  'Théâtre d''Orléans|L''Astrolabe|Ville d''Orléans|Cabaret l''Insolite|Salle de l''Institut|L''Orchestre d''Hommes-Orchestres');
SELECT pg_temp.verifie('noms composés : petits mots en minuscules',
  pg_temp.f(ARRAY['Château de Saint-Jean-Le-Blanc', 'My Beers Fleury-Les-Aubrais', 'Vitry-Aux-Loges',
                  'Collégiale Saint-Pierre-Le-Puellier', 'Frac Centre-Val de Loire']),
  'Château de Saint-Jean-le-Blanc|My Beers Fleury-les-Aubrais|Vitry-aux-Loges|Collégiale Saint-Pierre-le-Puellier|Frac Centre-Val de Loire');
SELECT pg_temp.verifie('petit mot ou mot élidé en capitales, virgule finale',
  pg_temp.f(ARRAY['Hangar DE Chalette', 'L''EAU Vive', 'Le Vinaigrier,', 'théâtre de la tête noire']),
  'Hangar de Chalette|L''Eau Vive|Le Vinaigrier|Théâtre de la Tête Noire');
-- Inchangé : sigles, apostrophes qui ne sont pas des élisions, noms déjà bien écrits.
SELECT pg_temp.verifie('inchangés',
  pg_temp.f(ARRAY['CCNO', 'ESAD Orléans', 'Zigotastiques – le QG', 'O''tempo Festival', 'Du Blues O'' Swing',
                  'DJ Stig', 'Le 108', 'Maison des Arts et de la Musique (MAM)', 'Théâtre d''Orléans']),
  'CCNO|ESAD Orléans|Zigotastiques – le QG|O''tempo Festival|Du Blues O'' Swing|DJ Stig|Le 108|Maison des Arts et de la Musique (MAM)|Théâtre d''Orléans');
SELECT pg_temp.verifie('rejouée : même résultat',
  public.format_entity_label(public.format_entity_label('théâtre d''orléans')), 'Théâtre d''Orléans');

-- Triggers : lieu, organisateur, artiste (son slug ne change pas avec la casse).
INSERT INTO public.locations (id, name, address) VALUES ('1a000000-0000-4000-8000-0000000000e1', 'L''astrolabe', '1 rue A');
INSERT INTO public.organizers (id, name) VALUES ('5b000000-0000-4000-8000-0000000000e1', 'Ville d''orléans');
INSERT INTO public.artists (id, name, slug) VALUES ('a7000000-0000-4000-8000-0000000000e1', 'L''eau du bain', 'x');
SELECT pg_temp.verifie('triggers : insertion',
  (SELECT name FROM public.locations WHERE id = '1a000000-0000-4000-8000-0000000000e1') || '|'
    || (SELECT name FROM public.organizers WHERE id = '5b000000-0000-4000-8000-0000000000e1') || '|'
    || (SELECT name || ' ' || slug FROM public.artists WHERE id = 'a7000000-0000-4000-8000-0000000000e1'),
  'L''Astrolabe|Ville d''Orléans|L''Eau du Bain l-eau-du-bain');
UPDATE public.artists SET name = 'l''eau du bain' WHERE id = 'a7000000-0000-4000-8000-0000000000e1';
SELECT pg_temp.verifie('trigger : mise à jour d''un artiste, slug gardé',
  (SELECT name || ' ' || slug FROM public.artists WHERE id = 'a7000000-0000-4000-8000-0000000000e1'),
  'L''Eau du Bain l-eau-du-bain');

ROLLBACK;
