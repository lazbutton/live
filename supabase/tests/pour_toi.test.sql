-- Tests de « Pour toi » (migration 20261024190000_create_pour_toi.sql) : les goûts (app_interests, user_interests),
-- la règle d'un goût (app_interest_ids), celle de la page (for_me d'app_events_in_range et d'app_event_counts), les
-- nombres des bulles (app_interest_counts), la recopie invité → compte, les droits, les compteurs d'audience.
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

-- Un appel refusé rend « erreur <SQLSTATE> » au lieu d'arrêter le fichier.
CREATE FUNCTION pg_temp.essaie(requete text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  lignes integer;
BEGIN
  EXECUTE requete;
  GET DIAGNOSTICS lignes = ROW_COUNT;
  RETURN 'ok ' || lignes;
EXCEPTION WHEN OTHERS THEN
  RETURN 'erreur ' || SQLSTATE;
END $$;

-- La session : anon, ou un utilisateur (authenticated).
CREATE FUNCTION pg_temp.session(utilisateur uuid) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config(
    'request.jwt.claims',
    CASE WHEN utilisateur IS NULL THEN '{"role":"anon"}'
      ELSE json_build_object('role', 'authenticated', 'sub', utilisateur)::text END,
    true
  )
$$;

-- Les événements à venir (à partir du 6 novembre 0 h, sans fin) que rend app_events_in_range, par leur code (P01…),
-- dans l'ordre des dates.
CREATE FUNCTION pg_temp.liste(
  pour_moi boolean DEFAULT NULL,
  famille boolean DEFAULT false,
  ville text DEFAULT NULL,
  km numeric DEFAULT NULL
) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(split_part(e.title, ' ', 1), ' ' ORDER BY e.date, e.title), '')
  FROM public.app_events_in_range(
    '2026-11-06 00:00', NULL, NULL, NULL, '2026-11-06 19:15',
    family => famille, zone_city => ville, zone_km => km, for_me => pour_moi
  ) AS e
$$;

-- events_count d'app_event_counts pour une plage à partir du 6 novembre 0 h, sans fin.
CREATE FUNCTION pg_temp.compte(pour_moi boolean DEFAULT NULL, categorie text DEFAULT NULL) RETURNS text
LANGUAGE sql AS $$
  SELECT events_count::text
  FROM public.app_event_counts(
    '[{"key": "a venir", "start": "2026-11-06T00:00:00"}]'::jsonb,
    NULL, categorie, '2026-11-06 19:15', for_me => pour_moi
  )
$$;

-- Les goûts d'un événement, par leurs slugs, dans l'ordre d'app_interest_ids.
CREATE FUNCTION pg_temp.gouts(code text) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(i.slug, ' ' ORDER BY u.ordre), '')
  FROM public.events AS e
  CROSS JOIN LATERAL unnest(public.app_interest_ids(e)) WITH ORDINALITY AS u(id, ordre)
  JOIN public.app_interests AS i ON i.id = u.id
  WHERE split_part(e.title, ' ', 1) = code
$$;

-- Les bulles : « slug=nombre » (« * » si choisie), dans l'ordre.
CREATE FUNCTION pg_temp.bulles(ville text DEFAULT NULL, km numeric DEFAULT NULL) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(i.slug || '=' || c.events_count || CASE WHEN c.chosen THEN '*' ELSE '' END, ' '
    ORDER BY i.display_order), '')
  FROM public.app_interest_counts(ville, km, '2026-11-06 19:15') AS c
  JOIN public.app_interests AS i ON i.id = c.interest_id
$$;

-- Les goûts de la migration ------------------------------------------------------------------------------------

SELECT pg_temp.verifie('les douze goûts, dans l''ordre des bulles',
  (SELECT string_agg(slug, ' ' ORDER BY display_order) FROM public.app_interests),
  'concerts dj-electro theatre humour cirque danse cinema expos ateliers rencontres festivals en-famille');
SELECT pg_temp.verifie('les phrases',
  (SELECT string_agg(phrase, ' | ' ORDER BY display_order) FROM public.app_interests WHERE slug IN ('humour', 'en-famille', 'dj-electro')),
  'les DJ sets et l''électro | l''humour | les sorties en famille');
SELECT pg_temp.verifie('« En famille » seul est family ; quatre icônes Lucide (les autres viennent des catégories)',
  (SELECT string_agg(slug, ' ') FROM public.app_interests WHERE family) || ' | '
  || (SELECT count(*)::text FROM public.app_interests WHERE icon_svg LIKE '<svg %'),
  'en-famille | 4');
SELECT pg_temp.verifie('un goût « En famille » ne prend ni catégorie ni tag',
  pg_temp.essaie($q$UPDATE public.app_interests SET tag_ids = '{4e000000-0000-4000-8000-000000000001}' WHERE slug = 'en-famille'$q$),
  'erreur 23514');

-- Jeu d'essai --------------------------------------------------------------------------------------------------

INSERT INTO auth.users (id, email, is_anonymous) VALUES
  ('3d000000-0000-4000-8000-000000000001', 'ines@test.local', false),
  ('3d000000-0000-4000-8000-000000000002', 'julien@test.local', false),
  ('3d000000-0000-4000-8000-000000000003', 'suivis@test.local', false),
  ('3d000000-0000-4000-8000-000000000004', 'rien@test.local', false),
  ('3d000000-0000-4000-8000-00000000000a', NULL, true),
  ('3d000000-0000-4000-8000-00000000000b', 'compte@test.local', false);
INSERT INTO auth.sessions (id, user_id) VALUES
  ('5e000000-0000-4000-8000-00000000000a', '3d000000-0000-4000-8000-00000000000a');

INSERT INTO public.cities (id, label, label_normalized, slug, is_active) VALUES
  ('0a000000-0000-4000-8000-000000000001', 'Zz Ville A', 'zz ville a', 'zz-ville-a', true),
  ('0a000000-0000-4000-8000-000000000002', 'Zz Ville B', 'zz ville b', 'zz-ville-b', true);
UPDATE public.cities AS c SET center_lat = v.lat, center_lng = v.lng
FROM (VALUES
  ('0a000000-0000-4000-8000-000000000001', 47.9, 1.9),
  ('0a000000-0000-4000-8000-000000000002', 47.9, 3.2)
) AS v(id, lat, lng)
WHERE c.id = v.id::uuid;

INSERT INTO public.locations (id, name, address, latitude, longitude) VALUES
  ('1a000000-0000-4000-8000-000000000001', 'Zz Lieu Un', '1 rue A', 47.9, 1.9),
  ('1a000000-0000-4000-8000-000000000002', 'Zz Lieu Deux', '2 rue A', 47.9, 1.91),
  ('1a000000-0000-4000-8000-000000000003', 'Zz Lieu Trois', '3 rue B', 47.9, 3.2);
UPDATE public.locations AS l SET city_id = v.city::uuid
FROM (VALUES
  ('1a000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001'),
  ('1a000000-0000-4000-8000-000000000002', '0a000000-0000-4000-8000-000000000001'),
  ('1a000000-0000-4000-8000-000000000003', '0a000000-0000-4000-8000-000000000002')
) AS v(id, city)
WHERE l.id = v.id::uuid;

INSERT INTO public.organizers (id, name) VALUES ('0b000000-0000-4000-8000-000000000001', 'Zz Orga');
INSERT INTO public.artists (id, name, slug) VALUES ('a7000000-0000-4000-8000-000000000001', 'Zz Artiste', 'zz-artiste');

INSERT INTO public.categories (id, name, is_active, display_order) VALUES
  ('2c000000-0000-4000-8000-000000000001', 'Zz Concert', true, 91),
  ('2c000000-0000-4000-8000-000000000002', 'Zz Spectacle', true, 92),
  ('2c000000-0000-4000-8000-000000000003', 'Zz Atelier', true, 93),
  ('2c000000-0000-4000-8000-000000000004', 'Zz Festival', true, 94);

-- Les noms passent par le trigger des tags : « Jeune Public » (la règle d'U5, par son nom).
INSERT INTO public.tags (id, name) VALUES
  ('4e000000-0000-4000-8000-000000000001', 'jeune public'),
  ('4e000000-0000-4000-8000-000000000002', 'Zz Humour'),
  ('4e000000-0000-4000-8000-000000000003', 'Zz Théâtre'),
  ('4e000000-0000-4000-8000-000000000004', 'Zz Cirque');

-- Les goûts sur le jeu d'essai : sans les catégories de la base de test, puis Concerts, Théâtre, Humour, Cirque,
-- Ateliers et Festivals comme dans la fiche.
UPDATE public.app_interests SET category_ids = '{}', tag_ids = '{}' WHERE NOT family;
UPDATE public.app_interests AS i SET category_ids = v.categories::uuid[], tag_ids = v.tags::uuid[]
FROM (VALUES
  ('concerts', '{2c000000-0000-4000-8000-000000000001}', '{}'),
  ('theatre', '{}', '{4e000000-0000-4000-8000-000000000003}'),
  ('humour', '{}', '{4e000000-0000-4000-8000-000000000002}'),
  ('cirque', '{}', '{4e000000-0000-4000-8000-000000000004}'),
  ('ateliers', '{2c000000-0000-4000-8000-000000000003}', '{}'),
  ('festivals', '{2c000000-0000-4000-8000-000000000004}', '{}')
) AS v(slug, categories, tags)
WHERE i.slug = v.slug;

-- Événements (heure de Paris étiquetée UTC), tous au Lieu Un sauf mention.
INSERT INTO public.events (id, title, date, end_date, category, location_id, status, is_young_audience, tag_ids)
SELECT
  ('e0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  titre,
  debut::timestamp AT TIME ZONE 'UTC',
  fin::timestamp AT TIME ZONE 'UTC',
  categorie,
  coalesce(lieu, '1a000000-0000-4000-8000-000000000001')::uuid,
  'approved',
  jeune,
  tags::uuid[]
FROM (VALUES
  (1,  'P01 concert',                 '2026-11-06 20:00', NULL, 'Zz Concert', NULL, false, '{}'),
  (2,  'P02 humour',                  '2026-11-07 20:00', NULL, 'Zz Spectacle', NULL, false,
       '{4e000000-0000-4000-8000-000000000002}'),
  (3,  'P03 théâtre',                 '2026-11-08 17:00', NULL, 'Zz Spectacle', NULL, false,
       '{4e000000-0000-4000-8000-000000000003}'),
  (4,  'P04 théâtre jeune public',    '2026-11-08 15:00', NULL, 'Zz Spectacle', NULL, false,
       '{4e000000-0000-4000-8000-000000000003,4e000000-0000-4000-8000-000000000001}'),
  (5,  'P05 cirque jeune (case)',     '2026-11-09 15:00', NULL, 'Zz Spectacle', NULL, true,
       '{4e000000-0000-4000-8000-000000000004}'),
  (6,  'P06 cirque',                  '2026-11-09 20:00', NULL, 'Zz Spectacle', NULL, false,
       '{4e000000-0000-4000-8000-000000000004}'),
  (7,  'P07 atelier',                 '2026-11-10 10:00', NULL, 'Zz Atelier', NULL, false, '{}'),
  (8,  'P08 concert retiré accueil',  '2026-11-10 20:00', NULL, 'Zz Concert', NULL, false, '{}'),
  (9,  'P09 concert fini',            '2026-11-06 10:00', '2026-11-06 12:00', 'Zz Concert', NULL, false, '{}'),
  (10, 'P10 concert au Lieu Deux',    '2026-11-11 20:00', NULL, 'Zz Concert', '1a000000-0000-4000-8000-000000000002', false, '{}'),
  (11, 'P11 atelier de l''orga',      '2026-11-12 10:00', NULL, 'Zz Atelier', NULL, false, '{}'),
  (12, 'P12 atelier avec l''artiste', '2026-11-13 10:00', NULL, 'Zz Atelier', NULL, false, '{}'),
  (13, 'P13 atelier organisé par le Lieu Deux', '2026-11-14 10:00', NULL, 'Zz Atelier', NULL, false, '{}'),
  (14, 'P14 concert masqué par Inès', '2026-11-15 20:00', NULL, 'Zz Concert', NULL, false, '{}'),
  (15, 'P15 catégorie inconnue',      '2026-11-16 20:00', NULL, 'Zz inconnue', NULL, false, NULL),
  (16, 'P16 concert du festival',     '2026-11-20 21:00', NULL, 'Zz Concert', NULL, false, '{}'),
  (17, 'P17 atelier',                 '2026-11-17 10:00', NULL, 'Zz Atelier', NULL, false, '{}'),
  (18, 'P18 concert d''humour',       '2026-11-18 20:00', NULL, 'Zz Concert', NULL, false,
       '{4e000000-0000-4000-8000-000000000002}'),
  (19, 'P19 concert en Ville B',      '2026-11-19 20:00', NULL, 'Zz Concert', '1a000000-0000-4000-8000-000000000003', false, '{}'),
  (20, 'F20 festival',                '2026-11-20 10:00', '2026-11-22 23:00', 'Zz Festival', NULL, false, '{}')
) AS v(n, titre, debut, fin, categorie, lieu, jeune, tags);

UPDATE public.events SET hide_from_home = true WHERE id = 'e0000000-0000-4000-8000-000000000008';
UPDATE public.events SET festival_id = 'e0000000-0000-4000-8000-000000000020'
WHERE id = 'e0000000-0000-4000-8000-000000000016';

INSERT INTO public.event_organizers (event_id, location_id, organizer_id) VALUES
  ('e0000000-0000-4000-8000-000000000011', NULL, '0b000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000013', '1a000000-0000-4000-8000-000000000002', NULL);
INSERT INTO public.event_artists (event_id, artist_id) VALUES
  ('e0000000-0000-4000-8000-000000000012', 'a7000000-0000-4000-8000-000000000001');

INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e0000000-0000-4000-8000-000000000014', '3d000000-0000-4000-8000-000000000001');

-- Inès : Concerts, Humour. Julien : Cirque, En famille. U3 suit le Lieu Deux, l'orga et l'artiste. U4 : rien.
-- L'invité : Théâtre et Concerts ; le compte où il se connecte : Concerts.
INSERT INTO public.user_interests (user_id, interest_id)
SELECT v.utilisateur::uuid, i.id
FROM (VALUES
  ('3d000000-0000-4000-8000-000000000001', 'concerts'),
  ('3d000000-0000-4000-8000-000000000001', 'humour'),
  ('3d000000-0000-4000-8000-000000000002', 'cirque'),
  ('3d000000-0000-4000-8000-000000000002', 'en-famille'),
  ('3d000000-0000-4000-8000-00000000000a', 'theatre'),
  ('3d000000-0000-4000-8000-00000000000a', 'concerts'),
  ('3d000000-0000-4000-8000-00000000000b', 'concerts')
) AS v(utilisateur, slug)
JOIN public.app_interests AS i ON i.slug = v.slug;

INSERT INTO public.user_follows (user_id, target_type, target_id) VALUES
  ('3d000000-0000-4000-8000-000000000003', 'location', '1a000000-0000-4000-8000-000000000002'),
  ('3d000000-0000-4000-8000-000000000003', 'organizer', '0b000000-0000-4000-8000-000000000001'),
  ('3d000000-0000-4000-8000-000000000003', 'artist', 'a7000000-0000-4000-8000-000000000001');

-- La règle d'un goût (app_interest_ids) ------------------------------------------------------------------------

SET LOCAL ROLE anon;
SELECT pg_temp.session(NULL);

SELECT pg_temp.verifie('un concert : Concerts ; un spectacle d''humour : Humour',
  pg_temp.gouts('P01') || ' | ' || pg_temp.gouts('P02'), 'concerts | humour');
SELECT pg_temp.verifie('catégorie et tag : les deux goûts, dans l''ordre des bulles',
  pg_temp.gouts('P18'), 'concerts humour');
SELECT pg_temp.verifie('jeune public (par le tag, par la case) : seulement En famille, pas Théâtre ni Cirque',
  pg_temp.gouts('P04') || ' | ' || pg_temp.gouts('P05'), 'en-famille | en-famille');
SELECT pg_temp.verifie('un atelier : Ateliers ; une catégorie inconnue : aucun goût',
  pg_temp.gouts('P07') || '/' || pg_temp.gouts('P15'), 'ateliers/');
SELECT pg_temp.verifie('la fiche d''un festival : Festivals',
  pg_temp.gouts('F20'), 'festivals');
SELECT pg_temp.verifie('colonne calculée : lisible sur les lignes d''app_events_in_range',
  (SELECT cardinality(public.app_interest_ids(e))::text
   FROM public.app_events_in_range('2026-11-06 00:00', NULL, NULL, NULL, '2026-11-06 19:15') AS e
   WHERE e.id = 'e0000000-0000-4000-8000-000000000018'),
  '2');

-- Sans session --------------------------------------------------------------------------------------------------

SELECT pg_temp.verifie('sans session, sans for_me : tout (P09 fini absent)',
  pg_temp.liste(),
  'P01 P02 P04 P03 P05 P06 P07 P08 P10 P11 P12 P13 P14 P15 P17 P18 P19 F20 P16');
SELECT pg_temp.verifie('sans session : rien pour toi, et tout le reste',
  '[' || pg_temp.liste(true) || '] ' || pg_temp.liste(false),
  '[] P01 P02 P04 P03 P05 P06 P07 P08 P10 P11 P12 P13 P14 P15 P17 P18 P19 F20 P16');
SELECT pg_temp.verifie('les appels d''avant marchent toujours (cinq arguments, free et family nommés)',
  (SELECT count(*)::text FROM public.app_events_in_range('2026-11-06 00:00', NULL, NULL, NULL, '2026-11-06 19:15'))
  || ' ' || (SELECT count(*)::text FROM public.app_events_in_range(
     '2026-11-06 00:00', NULL, NULL, NULL, '2026-11-06 19:15', free => false, family => true)),
  '19 2');
SELECT pg_temp.verifie('les bulles sans session : à 5 événements ou plus',
  pg_temp.bulles(), 'concerts=7 ateliers=5');
SELECT pg_temp.verifie('les bulles dans la zone (Ville A, 25 km) : sans le concert de la Ville B',
  pg_temp.bulles('zz-ville-a', 25), 'concerts=6 ateliers=5');
SELECT pg_temp.verifie('anon ne lit pas les goûts choisis, ni le profil d''un autre',
  has_table_privilege('anon', 'public.user_interests', 'select')::text || ' '
  || has_function_privilege('anon', 'public.app_for_me_profile_of(uuid)', 'execute')::text || ' '
  || has_function_privilege('authenticated', 'public.app_for_me_profile_of(uuid)', 'execute')::text || ' '
  || has_function_privilege('anon', 'public.app_for_me_profile()', 'execute')::text,
  'false false false true');
SELECT pg_temp.verifie('anon lit les goûts, et n''en écrit pas',
  (SELECT count(*)::text FROM public.app_interests) || ' '
  || pg_temp.essaie($q$INSERT INTO public.app_interests (slug, name, phrase) VALUES ('zz', 'Zz', 'le zz')$q$),
  '12 erreur 42501');

-- Inès : Concerts, Humour (P14 masqué) --------------------------------------------------------------------------

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.session('3d000000-0000-4000-8000-000000000001');

SELECT pg_temp.verifie('Inès : pour toi (le retiré de l''accueil compris, comme une catégorie)',
  pg_temp.liste(true), 'P01 P02 P08 P10 P18 P19 P16');
SELECT pg_temp.verifie('Inès : le reste',
  pg_temp.liste(false), 'P04 P03 P05 P06 P07 P11 P12 P13 P15 P17 F20');
SELECT pg_temp.verifie('Inès : sans for_me, tout sauf son masqué',
  pg_temp.liste(),
  'P01 P02 P04 P03 P05 P06 P07 P08 P10 P11 P12 P13 P15 P17 P18 P19 F20 P16');
SELECT pg_temp.verifie('Inès : pour toi et en famille, rien (le jeune public n''entre que par En famille)',
  '[' || pg_temp.liste(true, famille => true) || ']', '[]');
SELECT pg_temp.verifie('Inès : pour toi dans la zone',
  pg_temp.liste(true, ville => 'zz-ville-a', km => 25), 'P01 P02 P08 P10 P18 P16');
-- « Tout » : sans le retiré de l'accueil (P08) ni la fiche du festival qui a un programme (F20) ; « Pour toi » :
-- comme une catégorie ; les autres de « Tout » : sa règle, moins ce qui est pour toi.
SELECT pg_temp.verifie('Inès : comptes de Tout, de Pour toi, des autres de Tout',
  pg_temp.compte() || ' ' || pg_temp.compte(true) || ' ' || pg_temp.compte(false), '16 7 10');
SELECT pg_temp.verifie('Inès : comptes d''une catégorie, avec et sans for_me',
  pg_temp.compte(NULL, 'Zz Concert') || ' ' || pg_temp.compte(true, 'Zz Concert') || ' '
  || pg_temp.compte(false, 'Zz Concert'),
  '6 6 0');
SELECT pg_temp.verifie('Inès : plusieurs plages, Pour toi',
  (SELECT string_agg(range_key || '=' || events_count || '/' || starting_count, ' ' ORDER BY range_index)
   FROM public.app_event_counts(
     '[{"key": "ce soir", "start": "2026-11-06T18:00:00", "end": "2026-11-07T06:00:00"},
       {"key": "semaine", "start": "2026-11-09T00:00:00", "end": "2026-11-16T00:00:00"},
       {"key": "4 semaines", "start": "2026-11-06T00:00:00", "end": "2026-12-04T00:00:00"}]'::jsonb,
     NULL, NULL, '2026-11-06 19:15', for_me => true)),
  'ce soir=1/1 semaine=2/2 4 semaines=7/7');
SELECT pg_temp.verifie('Inès : ses bulles (Humour choisie sous 5 reste, Concerts sans son masqué)',
  pg_temp.bulles(), 'concerts=6* humour=2* ateliers=5');
SELECT pg_temp.verifie('Inès ne voit que ses goûts',
  (SELECT count(*)::text FROM public.user_interests), '2');
SELECT pg_temp.verifie('Inès n''ajoute pas un goût à Julien, ni ne retire les siens',
  pg_temp.essaie($q$INSERT INTO public.user_interests (user_id, interest_id)
    SELECT '3d000000-0000-4000-8000-000000000002', id FROM public.app_interests WHERE slug = 'danse'$q$)
  || ' | ' || pg_temp.essaie($q$DELETE FROM public.user_interests WHERE user_id = '3d000000-0000-4000-8000-000000000002'$q$),
  'erreur 42501 | ok 0');
SELECT pg_temp.verifie('Inès ne lit pas le profil de Julien, et lit le sien',
  pg_temp.essaie($q$SELECT * FROM public.app_for_me_profile_of('3d000000-0000-4000-8000-000000000002')$q$) || ' | '
  || (SELECT cardinality(p.interest_ids)::text FROM public.app_for_me_profile() AS p),
  'erreur 42501 | 2');
SELECT pg_temp.verifie('un admin seulement écrit les goûts',
  pg_temp.essaie($q$UPDATE public.app_interests SET name = 'Zz' WHERE slug = 'humour'$q$), 'ok 0');

-- Ajouter un goût, en retirer un : la page suit.
INSERT INTO public.user_interests (user_id, interest_id)
SELECT '3d000000-0000-4000-8000-000000000001', id FROM public.app_interests WHERE slug = 'festivals';
SELECT pg_temp.verifie('Inès ajoute Festivals : la fiche du festival entre',
  pg_temp.liste(true), 'P01 P02 P08 P10 P18 P19 F20 P16');
DELETE FROM public.user_interests
WHERE user_id = '3d000000-0000-4000-8000-000000000001'
  AND interest_id IN (SELECT id FROM public.app_interests WHERE slug IN ('festivals', 'concerts'));
SELECT pg_temp.verifie('Inès retire Festivals et Concerts : l''humour seul',
  pg_temp.liste(true) || ' | ' || pg_temp.bulles(), 'P02 P18 | concerts=6 humour=2* ateliers=5');

-- Julien : Cirque, En famille -----------------------------------------------------------------------------------

SELECT pg_temp.session('3d000000-0000-4000-8000-000000000002');
SELECT pg_temp.verifie('Julien : pour toi (le jeune public par En famille, le cirque)',
  pg_temp.liste(true), 'P04 P05 P06');
SELECT pg_temp.verifie('Julien : pour toi et en famille',
  pg_temp.liste(true, famille => true), 'P04 P05');
SELECT pg_temp.verifie('Julien : ses bulles, dans l''ordre',
  pg_temp.bulles(), 'concerts=7 cirque=1* ateliers=5 en-famille=2*');
RESET ROLE;
INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e0000000-0000-4000-8000-000000000017', '3d000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT pg_temp.session('3d000000-0000-4000-8000-000000000002');
SELECT pg_temp.verifie('Julien masque un atelier : Ateliers tombe à 4 et disparaît',
  pg_temp.bulles(), 'concerts=7 cirque=1* en-famille=2*');

-- U3 : des suivis, aucun goût -----------------------------------------------------------------------------------

SELECT pg_temp.session('3d000000-0000-4000-8000-000000000003');
SELECT pg_temp.verifie('les suivis : le lieu (où ça se tient, qui organise), l''orga, l''artiste',
  pg_temp.liste(true), 'P10 P11 P12 P13');
SELECT pg_temp.verifie('les suivis : comptes de Pour toi et des autres de Tout',
  pg_temp.compte(true) || ' ' || pg_temp.compte(false), '4 13');

-- U4 : rien ---------------------------------------------------------------------------------------------------

SELECT pg_temp.session('3d000000-0000-4000-8000-000000000004');
SELECT pg_temp.verifie('sans goût ni suivi : rien pour toi, tout dans le reste',
  '[' || pg_temp.liste(true) || '] ' || pg_temp.compte(true) || ' ' || pg_temp.compte(false) || ' ' || pg_temp.compte(),
  '[] 0 17 17');

-- Un goût inactif ne prend plus rien ----------------------------------------------------------------------------

RESET ROLE;
UPDATE public.app_interests SET is_active = false WHERE slug = 'humour';
SET LOCAL ROLE authenticated;
SELECT pg_temp.session('3d000000-0000-4000-8000-000000000001');
SELECT pg_temp.verifie('Humour inactif : ni dans les goûts d''un événement, ni dans les bulles, ni dans Pour toi',
  pg_temp.gouts('P18') || ' | ' || pg_temp.bulles() || ' | [' || pg_temp.liste(true) || ']',
  'concerts | concerts=6 ateliers=5 | []');
RESET ROLE;
UPDATE public.app_interests SET is_active = true WHERE slug = 'humour';

-- La recopie invité → compte ------------------------------------------------------------------------------------

SET LOCAL ROLE authenticated;
SELECT pg_temp.session('3d000000-0000-4000-8000-00000000000b');
SELECT pg_temp.verifie('copy_guest_data : un goût de l''invité ajouté (Concerts, déjà là, ne compte pas)',
  (SELECT interests::text FROM public.copy_guest_data('5e000000-0000-4000-8000-00000000000a')), '1');
-- Une requête de plus : la précédente ne voit pas ce que la fonction vient d'écrire.
SELECT pg_temp.verifie('copy_guest_data : les goûts du compte et ceux de l''invité',
  (SELECT string_agg(i.slug, ' ' ORDER BY i.display_order)
   FROM public.user_interests AS ui JOIN public.app_interests AS i ON i.id = ui.interest_id),
  'concerts theatre');

-- Mesure d'audience ---------------------------------------------------------------------------------------------

RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.session(NULL);
SELECT pg_temp.verifie('app_audience_add : les trois compteurs de « Pour toi »',
  public.app_audience_add(
    (now() AT TIME ZONE 'Europe/Paris')::date,
    '{"for_me_opened": 3, "interests_changed": 2, "for_me_to_all": 1, "radio_show_follow": 1}'::jsonb
  )::text,
  '4');

ROLLBACK;
