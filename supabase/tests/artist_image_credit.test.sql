-- Tests du crédit des photos d'artistes (migration 20261021160000_add_artist_image_credit.sql :
-- colonnes image_credit, image_license, image_source_url, trigger artists_reset_image_credit, contrainte).
--
-- Sur une base jetable avec toutes les migrations : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des artistes.

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.artists) THEN
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

-- Écriture refusée par la contrainte : renvoie le SQLSTATE au lieu d'arrêter le fichier.
CREATE FUNCTION pg_temp.essaie(requete text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE requete;
  RETURN 'accepté';
EXCEPTION WHEN OTHERS THEN
  RETURN 'erreur ' || SQLSTATE;
END $$;

CREATE FUNCTION pg_temp.credit(artiste uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT concat_ws('|', coalesce(image_url, '∅'), coalesce(image_credit, '∅'), coalesce(image_license, '∅'),
                   coalesce(image_source_url, '∅'))
  FROM public.artists WHERE id = artiste
$$;

INSERT INTO public.artists (id, name, slug, image_url, image_credit, image_license, image_source_url) VALUES
  ('a7000000-0000-4000-8000-0000000000c1', 'Artiste avec photo libre', 'x1', 'https://s.test/a.jpg', 'Jane Doe',
   'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:A.jpg'),
  ('a7000000-0000-4000-8000-0000000000c2', 'Artiste sans crédit', 'x2', 'https://s.test/b.jpg', NULL, NULL, NULL);

SELECT pg_temp.verifie('insertion : photo et crédit gardés',
  pg_temp.credit('a7000000-0000-4000-8000-0000000000c1'),
  'https://s.test/a.jpg|Jane Doe|CC BY-SA 4.0|https://commons.wikimedia.org/wiki/File:A.jpg');

UPDATE public.artists SET name = 'Artiste avec photo libre (renommé)' WHERE id = 'a7000000-0000-4000-8000-0000000000c1';
SELECT pg_temp.verifie('autre colonne modifiée : crédit gardé',
  pg_temp.credit('a7000000-0000-4000-8000-0000000000c1'),
  'https://s.test/a.jpg|Jane Doe|CC BY-SA 4.0|https://commons.wikimedia.org/wiki/File:A.jpg');

UPDATE public.artists SET image_url = 'https://s.test/a.jpg' WHERE id = 'a7000000-0000-4000-8000-0000000000c1';
SELECT pg_temp.verifie('même photo réécrite : crédit gardé',
  pg_temp.credit('a7000000-0000-4000-8000-0000000000c1'),
  'https://s.test/a.jpg|Jane Doe|CC BY-SA 4.0|https://commons.wikimedia.org/wiki/File:A.jpg');

UPDATE public.artists SET image_url = 'https://s.test/envoyee-par-l-admin.jpg'
WHERE id = 'a7000000-0000-4000-8000-0000000000c1';
SELECT pg_temp.verifie('photo remplacée sans crédit : crédit effacé',
  pg_temp.credit('a7000000-0000-4000-8000-0000000000c1'),
  'https://s.test/envoyee-par-l-admin.jpg|∅|∅|∅');

UPDATE public.artists
SET image_url = 'https://s.test/c.jpg', image_credit = 'John Roe', image_license = 'CC0',
    image_source_url = 'https://commons.wikimedia.org/wiki/File:C.jpg'
WHERE id = 'a7000000-0000-4000-8000-0000000000c2';
SELECT pg_temp.verifie('photo et crédit écrits ensemble : gardés',
  pg_temp.credit('a7000000-0000-4000-8000-0000000000c2'),
  'https://s.test/c.jpg|John Roe|CC0|https://commons.wikimedia.org/wiki/File:C.jpg');

UPDATE public.artists SET image_url = NULL WHERE id = 'a7000000-0000-4000-8000-0000000000c2';
SELECT pg_temp.verifie('photo retirée : crédit effacé', pg_temp.credit('a7000000-0000-4000-8000-0000000000c2'), '∅|∅|∅|∅');

SELECT pg_temp.verifie('crédit sans photo : refusé',
  pg_temp.essaie($q$INSERT INTO public.artists (id, name, slug, image_credit, image_license)
    VALUES ('a7000000-0000-4000-8000-0000000000c3', 'Sans photo', 'x3', 'Jane Doe', 'CC BY 4.0')$q$),
  'erreur 23514');

ROLLBACK;
