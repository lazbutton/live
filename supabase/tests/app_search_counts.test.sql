-- Tests de app_category_counts(), app_tag_counts() (migration 20261019212000_create_app_search_counts.sql)
-- et des droits sur school_holidays (migration 20261019211000_create_school_holidays.sql).
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.
--
-- « Maintenant » est fixé au vendredi 6 novembre 2026, 19:15 (heure de Paris) par `at_time`.

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events) THEN
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

-- « nom=compte » des catégories de test (Zz…), dans l'ordre rendu.
CREATE FUNCTION pg_temp.categories(villes uuid[] DEFAULT NULL, maintenant timestamp DEFAULT '2026-11-06 19:15')
RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(c.name || '=' || c.events_count, ' ' ORDER BY c.ordre)
  FROM (
    SELECT r.*, row_number() OVER () AS ordre
    FROM public.app_category_counts(villes, maintenant) AS r
  ) AS c
  WHERE c.name LIKE 'Zz%'
$$;

CREATE FUNCTION pg_temp.tags(villes uuid[] DEFAULT NULL, nombre integer DEFAULT 20,
  maintenant timestamp DEFAULT '2026-11-06 19:15') RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(t.name || '=' || t.events_count, ' ' ORDER BY t.ordre), '')
  FROM (
    SELECT r.*, row_number() OVER () AS ordre
    FROM public.app_tag_counts(villes, nombre, maintenant) AS r
  ) AS t
$$;

-- Jeu d'essai --------------------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('3d000000-0000-4000-8000-000000000001', 'u1@test.local'),
  ('3d000000-0000-4000-8000-000000000002', 'u2@test.local');

INSERT INTO public.cities (id, label, label_normalized, slug, is_active) VALUES
  ('0a000000-0000-4000-8000-000000000001', 'Ville A', 'ville a', 'ville-a', true),
  ('0a000000-0000-4000-8000-000000000002', 'Ville B', 'ville b', 'ville-b', true);
INSERT INTO public.locations (id, name, address) VALUES
  ('1a000000-0000-4000-8000-000000000001', 'Lieu A', '1 rue A'),
  ('1a000000-0000-4000-8000-000000000002', 'Lieu B', '1 rue B');
UPDATE public.locations SET city_id = '0a000000-0000-4000-8000-000000000001'
WHERE id = '1a000000-0000-4000-8000-000000000001';
UPDATE public.locations SET city_id = '0a000000-0000-4000-8000-000000000002'
WHERE id = '1a000000-0000-4000-8000-000000000002';

INSERT INTO public.categories (id, name, is_active, display_order) VALUES
  ('2c000000-0000-4000-8000-000000000001', 'Zz Concert', true, 92),
  ('2c000000-0000-4000-8000-000000000002', 'Zz Atelier', true, 91),
  ('2c000000-0000-4000-8000-000000000003', 'Zz Vide', true, 90),
  ('2c000000-0000-4000-8000-000000000004', 'Zz Inactive', false, 93);

INSERT INTO public.tags (id, name) VALUES
  ('4e000000-0000-4000-8000-000000000001', 'Zz Jazz'),
  ('4e000000-0000-4000-8000-000000000002', 'Zz Humour'),
  ('4e000000-0000-4000-8000-000000000003', 'Zz Rare'),
  ('4e000000-0000-4000-8000-000000000004', 'Zz Passé');

INSERT INTO public.events (id, title, date, end_date, category, location_id, status, created_by, tag_ids)
SELECT
  ('e0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  titre,
  debut::timestamp AT TIME ZONE 'UTC',
  fin::timestamp AT TIME ZONE 'UTC',
  categorie,
  coalesce(lieu, '1a000000-0000-4000-8000-000000000001')::uuid,
  coalesce(statut, 'approved'),
  auteur::uuid,
  tags::uuid[]
FROM (VALUES
  -- À venir (ville A sauf mention) :
  (1,  'E01 concert sam',          '2026-11-07 20:30', NULL,               '2c000000-0000-4000-8000-000000000001', NULL, NULL, NULL,
       '{4e000000-0000-4000-8000-000000000001,4e000000-0000-4000-8000-000000000002}'),
  (2,  'E02 concert par son nom',  '2026-11-08 20:30', NULL,               ' zz CONCERT', NULL, NULL, NULL,
       '{4e000000-0000-4000-8000-000000000001}'),
  (3,  'E03 concert ville B',      '2026-11-09 20:30', NULL,               '2c000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000002', NULL, NULL,
       '{4e000000-0000-4000-8000-000000000001,4e000000-0000-4000-8000-000000000001}'),
  (4,  'E04 atelier ce soir',      '2026-11-06 20:00', '2026-11-06 22:00', '2c000000-0000-4000-8000-000000000002', NULL, NULL, NULL,
       '{4e000000-0000-4000-8000-000000000002}'),
  (5,  'E05 atelier expo longue',  '2026-10-01 10:00', '2026-12-01 18:00', '2c000000-0000-4000-8000-000000000002', NULL, NULL, NULL,
       '{4e000000-0000-4000-8000-000000000003}'),
  (6,  'E06 catégorie inactive',   '2026-11-10 20:30', NULL,               '2c000000-0000-4000-8000-000000000004', NULL, NULL, NULL,
       '{4e000000-0000-4000-8000-000000000002}'),
  (7,  'E07 catégorie inconnue',   '2026-11-10 21:00', NULL,               'Inconnue', NULL, NULL, NULL, '{}'),
  (8,  'E08 retiré de l''accueil', '2026-11-11 20:30', NULL,               '2c000000-0000-4000-8000-000000000001', NULL, NULL, NULL,
       '{4e000000-0000-4000-8000-000000000002}'),
  (9,  'E09 masqué par U1',        '2026-11-12 20:30', NULL,               '2c000000-0000-4000-8000-000000000001', NULL, NULL, NULL,
       '{4e000000-0000-4000-8000-000000000002}'),
  (10, 'E10 auteur bloqué par U1', '2026-11-13 20:30', NULL,               '2c000000-0000-4000-8000-000000000001', NULL, NULL,
       '3d000000-0000-4000-8000-000000000002', '{4e000000-0000-4000-8000-000000000002}'),
  -- Pas à venir, ou pas visibles :
  (11, 'E11 atelier fini à 19:00', '2026-11-06 16:00', '2026-11-06 19:00', '2c000000-0000-4000-8000-000000000002', NULL, NULL, NULL,
       '{4e000000-0000-4000-8000-000000000004}'),
  (12, 'E12 concert hier',         '2026-11-05 20:30', NULL,               '2c000000-0000-4000-8000-000000000001', NULL, NULL, NULL,
       '{4e000000-0000-4000-8000-000000000004}'),
  (13, 'E13 concert en attente',   '2026-11-14 20:30', NULL,               '2c000000-0000-4000-8000-000000000001', NULL, 'pending', NULL,
       '{4e000000-0000-4000-8000-000000000004}')
) AS v(n, titre, debut, fin, categorie, lieu, statut, auteur, tags);

UPDATE public.events SET hide_from_home = true WHERE id = 'e0000000-0000-4000-8000-000000000008';
INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e0000000-0000-4000-8000-000000000009', '3d000000-0000-4000-8000-000000000001');
INSERT INTO public.blocked_users (blocker_user_id, blocked_user_id) VALUES
  ('3d000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-000000000002');

-- Sans session (clé anon publique) --------------------------------------------------------------

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

-- Concert : E01, E02 (par son nom), E03, E08 (hide_from_home compte), E09, E10.
-- Atelier : E04, E05 (expo en cours) ; pas E11 (fini). Vide : 0, rendue quand même.
SELECT pg_temp.verifie('catégories, toutes villes',
  pg_temp.categories(), 'Zz Concert=6 Zz Atelier=2 Zz Vide=0');
SELECT pg_temp.verifie('catégorie inactive absente',
  (SELECT count(*)::text FROM public.app_category_counts(at_time => '2026-11-06 19:15') WHERE name = 'Zz Inactive'), '0');
SELECT pg_temp.verifie('ville B : E03 seulement ; à égalité, ordre d''affichage',
  pg_temp.categories(ARRAY['0a000000-0000-4000-8000-000000000002']::uuid[]), 'Zz Concert=1 Zz Vide=0 Zz Atelier=0');
SELECT pg_temp.verifie('à égalité, ordre d''affichage puis nom',
  pg_temp.categories(ARRAY['0a000000-0000-4000-8000-000000000003']::uuid[]), 'Zz Vide=0 Zz Atelier=0 Zz Concert=0');

-- Tags : un événement compte une fois par tag (E03 a deux fois Jazz) ; Passé n'a rien à venir.
-- Humour : E01, E04, E06 (catégorie inactive, mais visible), E08, E09, E10 ; Jazz : E01, E02, E03 ; Rare : E05.
SELECT pg_temp.verifie('tags, toutes villes',
  pg_temp.tags(), 'Zz Humour=6 Zz Jazz=3 Zz Rare=1');
SELECT pg_temp.verifie('tags, max_tags 2, puis 0 (→ 1) et nul (→ 20)',
  pg_temp.tags(NULL, 2) || ' | ' || pg_temp.tags(NULL, 0) || ' | ' || pg_temp.tags(NULL, NULL),
  'Zz Humour=6 Zz Jazz=3 | Zz Humour=6 | Zz Humour=6 Zz Jazz=3 Zz Rare=1');
SELECT pg_temp.verifie('tags, ville B',
  pg_temp.tags(ARRAY['0a000000-0000-4000-8000-000000000002']::uuid[]), 'Zz Jazz=1');
SELECT pg_temp.verifie('tags, max_tags 1000 : 100 au plus (3 ici)',
  (SELECT count(*)::text FROM public.app_tag_counts(NULL, 1000, '2026-11-06 19:15')), '3');

-- Plus tard : à 23:00, l'atelier de 20:00-22:00 est fini ; le 2 décembre, l'expo aussi.
SELECT pg_temp.verifie('à 23:00',
  pg_temp.categories(NULL, '2026-11-06 23:00'), 'Zz Concert=6 Zz Atelier=1 Zz Vide=0');
SELECT pg_temp.verifie('le 2 décembre',
  pg_temp.categories(NULL, '2026-12-02 09:00') || ' | ' || pg_temp.tags(NULL, 20, '2026-12-02 09:00'),
  'Zz Vide=0 Zz Atelier=0 Zz Concert=0 | ');

-- Recherche par tag (forme de l'appel de l'app : filtre tag_ids=cs.{…}).
SELECT pg_temp.verifie('événements à venir du tag Jazz',
  (SELECT string_agg(split_part(e.title, ' ', 1), ' ' ORDER BY e.date)
   FROM public.app_events_in_range('2026-11-06 00:00', NULL, NULL, NULL, '2026-11-06 19:15') AS e
   WHERE e.tag_ids @> ARRAY['4e000000-0000-4000-8000-000000000001']::uuid[]),
  'E01 E02 E03');

-- Vacances scolaires : lecture pour tous, écriture refusée.
RESET ROLE;
INSERT INTO public.school_holidays (academy, zone, school_year, name, first_day, last_day, source_start_date, source_end_date)
VALUES ('Orléans-Tours', 'Zone B', '2026-2027', 'Vacances de la Toussaint', '2026-10-17', '2026-11-01',
        '2026-10-17T00:00:00+02:00', '2026-11-02T00:00:00+01:00');
SET LOCAL ROLE anon;
SELECT pg_temp.verifie('vacances lisibles en anon',
  (SELECT name || ' ' || first_day || ' ' || last_day FROM public.school_holidays WHERE last_day >= '2026-10-19'),
  'Vacances de la Toussaint 2026-10-17 2026-11-01');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.school_holidays (academy, zone, school_year, name, first_day, last_day, source_start_date, source_end_date)
    VALUES ('x', 'x', 'x', 'x', '2026-01-01', '2026-01-02', now(), now());
    RAISE EXCEPTION 'ÉCHEC anon a pu écrire dans school_holidays';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok  vacances : écriture refusée en anon';
  END;
END $$;

-- Avec la session de U1 : sans E09 (masqué) ni E10 (auteur bloqué) -----------------------------

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000001"}', true);
SELECT pg_temp.verifie('U1 : catégories et tags',
  pg_temp.categories() || ' | ' || pg_temp.tags(),
  'Zz Concert=4 Zz Atelier=2 Zz Vide=0 | Zz Humour=4 Zz Jazz=3 Zz Rare=1');
DO $$
BEGIN
  BEGIN
    UPDATE public.school_holidays SET name = 'x';
    RAISE EXCEPTION 'ÉCHEC un compte a pu modifier school_holidays';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok  vacances : modification refusée à un compte';
  END;
END $$;

RESET ROLE;
-- Contraintes : dernier jour avant le premier ; période en double.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.school_holidays (academy, zone, school_year, name, first_day, last_day, source_start_date, source_end_date)
    VALUES ('Orléans-Tours', 'Zone B', '2026-2027', 'Vacances de Noël', '2027-01-03', '2026-12-19', now(), now());
    RAISE EXCEPTION 'ÉCHEC période à l''envers acceptée';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  vacances : période à l''envers refusée';
  END;
  BEGIN
    INSERT INTO public.school_holidays (academy, zone, school_year, name, first_day, last_day, source_start_date, source_end_date)
    VALUES ('Orléans-Tours', 'Zone B', '2026-2027', 'Vacances de la Toussaint', '2026-10-17', '2026-11-01', now(), now());
    RAISE EXCEPTION 'ÉCHEC période en double acceptée';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'ok  vacances : période en double refusée';
  END;
END $$;

ROLLBACK;
