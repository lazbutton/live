-- Tests des filtres « Gratuit » et « En famille » d'app_events_in_range() et d'app_event_counts()
-- (migration 20261021160000_add_free_family_filters.sql).
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

-- Les événements à venir (à partir du 6 novembre 0 h, sans fin) que rend app_events_in_range, par
-- leur code (F01…), dans l'ordre des dates.
CREATE FUNCTION pg_temp.liste(
  gratuit boolean DEFAULT false,
  famille boolean DEFAULT false,
  villes uuid[] DEFAULT NULL,
  categorie text DEFAULT NULL
) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(split_part(e.title, ' ', 1), ' ' ORDER BY e.date, e.title), '')
  FROM public.app_events_in_range(
    '2026-11-06 00:00', NULL, villes, categorie, '2026-11-06 19:15', free => gratuit, family => famille
  ) AS e
$$;

-- events_count d'app_event_counts pour une plage à partir du 6 novembre 0 h, sans fin.
CREATE FUNCTION pg_temp.compte(
  gratuit boolean DEFAULT false,
  famille boolean DEFAULT false,
  villes uuid[] DEFAULT NULL,
  categorie text DEFAULT NULL
) RETURNS text
LANGUAGE sql AS $$
  SELECT events_count::text
  FROM public.app_event_counts(
    '[{"key": "a venir", "start": "2026-11-06T00:00:00"}]'::jsonb,
    villes, categorie, '2026-11-06 19:15', free => gratuit, family => famille
  )
$$;

-- Jeu d'essai --------------------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('3d000000-0000-4000-8000-000000000001', 'u1@test.local');

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
  ('2c000000-0000-4000-8000-000000000002', 'Zz Atelier', true, 91);

-- Le nom passe par le trigger des tags : « Jeune Public ».
INSERT INTO public.tags (id, name) VALUES
  ('4e000000-0000-4000-8000-000000000001', 'jeune public'),
  ('4e000000-0000-4000-8000-000000000002', 'Zz Jazz');

INSERT INTO public.events (
  id, title, date, end_date, category, location_id, status, price, price_min, price_max,
  is_pay_what_you_want, is_young_audience, tag_ids
)
SELECT
  ('e0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  titre,
  debut::timestamp AT TIME ZONE 'UTC',
  fin::timestamp AT TIME ZONE 'UTC',
  categorie,
  coalesce(lieu, '1a000000-0000-4000-8000-000000000001')::uuid,
  'approved',
  prix, prix_min, prix_max, libre, jeune, tags::uuid[]
FROM (VALUES
  -- Gratuits :
  (1,  'F01 gratuit concert',        '2026-11-06 20:00', NULL, '2c000000-0000-4000-8000-000000000001', NULL,
       0::numeric, 0::numeric, NULL::numeric, false, false, '{}'),
  (2,  'F02 gratuit atelier',        '2026-11-07 15:00', NULL, '2c000000-0000-4000-8000-000000000002', NULL,
       0, NULL, NULL, false, false, '{}'),
  (3,  'F03 gratuit retiré accueil', '2026-11-08 15:00', NULL, '2c000000-0000-4000-8000-000000000001', NULL,
       0, 0, NULL, false, false, '{}'),
  (4,  'F04 gratuit ville B',        '2026-11-09 15:00', NULL, '2c000000-0000-4000-8000-000000000001',
       '1a000000-0000-4000-8000-000000000002', 0, 0, NULL, false, false, '{}'),
  (5,  'F05 gratuit fini',           '2026-11-06 10:00', '2026-11-06 12:00', '2c000000-0000-4000-8000-000000000001', NULL,
       0, 0, NULL, false, false, '{}'),
  -- Pas gratuits :
  (6,  'F06 payant',                 '2026-11-07 20:00', NULL, '2c000000-0000-4000-8000-000000000001', NULL,
       12, 12, NULL, false, false, '{}'),
  (7,  'F07 de 0 à 5 euros',         '2026-11-07 21:00', NULL, '2c000000-0000-4000-8000-000000000001', NULL,
       0, 0, 5, false, false, '{}'),
  (8,  'F08 prix libre',             '2026-11-07 22:00', NULL, '2c000000-0000-4000-8000-000000000001', NULL,
       NULL, NULL, NULL, true, false, '{}'),
  (9,  'F09 prix inconnu',           '2026-11-07 23:00', NULL, '2c000000-0000-4000-8000-000000000001', NULL,
       NULL, NULL, NULL, false, false, '{}'),
  -- En famille :
  (10, 'F10 case jeune public',      '2026-11-10 14:00', NULL, '2c000000-0000-4000-8000-000000000002', NULL,
       8, 8, NULL, false, true, '{}'),
  (11, 'F11 tag Jeune Public',       '2026-11-11 14:00', NULL, '2c000000-0000-4000-8000-000000000002', NULL,
       NULL, NULL, NULL, false, false, '{4e000000-0000-4000-8000-000000000001,4e000000-0000-4000-8000-000000000002}'),
  (12, 'F12 gratuit et en famille',  '2026-11-12 14:00', NULL, '2c000000-0000-4000-8000-000000000002', NULL,
       0, 0, NULL, false, true, '{4e000000-0000-4000-8000-000000000001}'),
  (13, 'F13 autre tag',              '2026-11-13 14:00', NULL, '2c000000-0000-4000-8000-000000000002', NULL,
       NULL, NULL, NULL, false, false, '{4e000000-0000-4000-8000-000000000002}'),
  (14, 'F14 sans tag (null)',        '2026-11-14 14:00', NULL, '2c000000-0000-4000-8000-000000000002', NULL,
       NULL, NULL, NULL, false, false, NULL)
) AS v(n, titre, debut, fin, categorie, lieu, prix, prix_min, prix_max, libre, jeune, tags);

UPDATE public.events SET hide_from_home = true WHERE id = 'e0000000-0000-4000-8000-000000000003';

SELECT pg_temp.verifie('le tag porte le nom attendu',
  (SELECT name FROM public.tags WHERE id = '4e000000-0000-4000-8000-000000000001'), 'Jeune Public');

-- Sans session (clé anon publique) --------------------------------------------------------------

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

SELECT pg_temp.verifie('sans filtre : comme avant (F05 fini absent)',
  pg_temp.liste(), 'F01 F02 F06 F07 F08 F09 F03 F04 F10 F11 F12 F13 F14');
SELECT pg_temp.verifie('les appels à cinq arguments marchent toujours',
  (SELECT count(*)::text FROM public.app_events_in_range('2026-11-06 00:00', NULL, NULL, NULL, '2026-11-06 19:15')),
  '13');

-- Gratuit : tous les prix connus à 0 (pas « 0 à 5 € », ni le prix libre, ni un prix inconnu).
SELECT pg_temp.verifie('gratuits',
  pg_temp.liste(gratuit => true), 'F01 F02 F03 F04 F12');
SELECT pg_temp.verifie('gratuits, ville A',
  pg_temp.liste(gratuit => true, villes => ARRAY['0a000000-0000-4000-8000-000000000001']::uuid[]),
  'F01 F02 F03 F12');
SELECT pg_temp.verifie('gratuits, catégorie Zz Atelier (par son nom)',
  pg_temp.liste(gratuit => true, categorie => 'zz atelier'), 'F02 F12');

-- En famille : la case, ou le tag « Jeune Public ».
SELECT pg_temp.verifie('en famille',
  pg_temp.liste(famille => true), 'F10 F11 F12');
SELECT pg_temp.verifie('gratuits et en famille',
  pg_temp.liste(gratuit => true, famille => true), 'F12');
SELECT pg_temp.verifie('un null vaut faux',
  (SELECT count(*)::text FROM public.app_events_in_range(
     '2026-11-06 00:00', NULL, NULL, NULL, '2026-11-06 19:15', free => NULL, family => NULL)),
  '13');

-- Comptes : sur « Tout », sans les événements retirés de l'accueil (F03) ; avec une catégorie, avec.
SELECT pg_temp.verifie('comptes : tout, gratuits, en famille',
  pg_temp.compte() || ' ' || pg_temp.compte(gratuit => true) || ' ' || pg_temp.compte(famille => true),
  '12 4 3');
SELECT pg_temp.verifie('comptes : gratuits, ville A ; catégorie Zz Concert (F03 compte)',
  pg_temp.compte(gratuit => true, villes => ARRAY['0a000000-0000-4000-8000-000000000001']::uuid[])
  || ' ' || pg_temp.compte(gratuit => true, categorie => 'Zz Concert'),
  '3 3');
SELECT pg_temp.verifie('comptes : plusieurs plages, un même filtre',
  (SELECT string_agg(range_key || '=' || events_count, ' ' ORDER BY range_index)
   FROM public.app_event_counts(
     '[{"key": "vendredi", "start": "2026-11-06T00:00:00", "end": "2026-11-07T00:00:00"},
       {"key": "samedi", "start": "2026-11-07T00:00:00", "end": "2026-11-08T00:00:00"},
       {"key": "semaine 2", "start": "2026-11-09T00:00:00", "end": "2026-11-16T00:00:00"}]'::jsonb,
     NULL, NULL, '2026-11-06 19:15', free => true)),
  'vendredi=1 samedi=1 semaine 2=2');
SELECT pg_temp.verifie('comptes à cinq arguments (calendrier de l''app)',
  (SELECT events_count::text FROM public.app_event_counts(
     '[{"start": "2026-11-06T00:00:00"}]'::jsonb, NULL, NULL, '2026-11-06 19:15')),
  '12');

-- Avec une session : ses événements masqués restent écartés --------------------------------------

RESET ROLE;
INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e0000000-0000-4000-8000-000000000012', '3d000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000001"}', true);
SELECT pg_temp.verifie('U1 : gratuits et en famille, sans F12 qu''il a masqué',
  pg_temp.liste(gratuit => true) || ' | ' || pg_temp.liste(famille => true)
  || ' | ' || pg_temp.compte(gratuit => true) || ' ' || pg_temp.compte(famille => true),
  'F01 F02 F03 F04 | F10 F11 | 3 2');

ROLLBACK;
