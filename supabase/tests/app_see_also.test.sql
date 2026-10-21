-- Tests de app_see_also() (migration 20261021110000_create_app_see_also.sql, règle des séries de la
-- migration 20261021170000_create_app_event_series.sql).
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.
--
-- « Maintenant » est fixé au vendredi 6 novembre 2026, 19:15 (heure de Paris) par `at_time`. Les
-- événements sont désignés par les deux derniers chiffres de leur id (« 01 » = l'événement 01).

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

-- Rangée « Aussi à », dans l'ordre du rang, et sa source : « 06 09 02 (Zz Théâtre:location=9) » ; vide
-- sans rangée.
CREATE FUNCTION pg_temp.aussi(evenement text, villes uuid[] DEFAULT NULL, nombre integer DEFAULT 3,
  maintenant timestamp DEFAULT '2026-11-06 19:15') RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(
    string_agg(right(s.event_id::text, 2), ' ' ORDER BY s.rank)
      || ' (' || min(s.source_name || ':' || s.source_kind || '=' || s.source_events_count) || ')',
    '')
  FROM public.app_see_also(('e5000000-0000-4000-8000-0000000000' || evenement)::uuid, villes, maintenant, nombre) AS s
  WHERE s.section = 'place'
$$;

-- Rangée « Dans le même genre », dans l'ordre du rang : « 11 12 20 ».
CREATE FUNCTION pg_temp.genre(evenement text, villes uuid[] DEFAULT NULL, nombre integer DEFAULT 3,
  maintenant timestamp DEFAULT '2026-11-06 19:15') RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(s.event_id::text, 2), ' ' ORDER BY s.rank), '')
  FROM public.app_see_also(('e5000000-0000-4000-8000-0000000000' || evenement)::uuid, villes, maintenant, nombre) AS s
  WHERE s.section = 'genre'
$$;

-- Un appel refusé : le code de l'erreur au lieu d'arrêter le fichier.
CREATE FUNCTION pg_temp.lit_les_lignes() RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM public.app_see_also_results;
  RETURN 'lu';
EXCEPTION WHEN OTHERS THEN
  RETURN 'erreur ' || SQLSTATE;
END $$;

-- Jeu d'essai --------------------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('3d000000-0000-4000-8000-000000000001', 'u1@test.local'),
  ('3d000000-0000-4000-8000-000000000002', 'u2@test.local');

INSERT INTO public.cities (id, label, label_normalized, slug, is_active) VALUES
  ('0a000000-0000-4000-8000-000000000001', 'Ville A', 'ville a', 'ville-a', true),
  ('0a000000-0000-4000-8000-000000000002', 'Ville B', 'ville b', 'ville-b', true);

-- L1 théâtre qui organise aussi ; L2 salle (ville B) ; L3 bar et L6 kiosque, un seul événement chacun ;
-- L4 cave ; L5 grange, qui organise ailleurs ; L7 pré, sans rien d'autre ; L8 atelier ; L9 médiathèque.
-- Ville A sauf L2.
INSERT INTO public.locations (id, name, address, is_organizer) VALUES
  ('1a000000-0000-4000-8000-000000000001', 'Zz Théâtre', '1 rue A', true),
  ('1a000000-0000-4000-8000-000000000002', 'Zz Salle', '1 rue B', false),
  ('1a000000-0000-4000-8000-000000000003', 'Zz Bar', '2 rue A', false),
  ('1a000000-0000-4000-8000-000000000004', 'Zz Cave', '3 rue A', false),
  ('1a000000-0000-4000-8000-000000000005', 'Zz Grange', '4 rue A', true),
  ('1a000000-0000-4000-8000-000000000006', 'Zz Kiosque', '5 rue A', false),
  ('1a000000-0000-4000-8000-000000000007', 'Zz Pré', '6 rue A', false),
  ('1a000000-0000-4000-8000-000000000008', 'Zz Atelier', '7 rue A', false),
  ('1a000000-0000-4000-8000-000000000009', 'Zz Médiathèque', '8 rue A', false);
UPDATE public.locations SET city_id = '0a000000-0000-4000-8000-000000000001'
WHERE id::text LIKE '1a000000-%' AND id <> '1a000000-0000-4000-8000-000000000002';
UPDATE public.locations SET city_id = '0a000000-0000-4000-8000-000000000002'
WHERE id = '1a000000-0000-4000-8000-000000000002';

INSERT INTO public.organizers (id, name) VALUES
  ('5b000000-0000-4000-8000-000000000001', 'Zz Collectif'),
  ('5b000000-0000-4000-8000-000000000002', 'Zz Asso'),
  ('5b000000-0000-4000-8000-000000000003', 'Zz Bande'),
  ('5b000000-0000-4000-8000-000000000004', 'Zz Troupe');

INSERT INTO public.categories (id, name, is_active, display_order) VALUES
  ('2c000000-0000-4000-8000-000000000001', 'Zz Concert', true, 90),
  ('2c000000-0000-4000-8000-000000000002', 'Zz Danse', true, 91),
  ('2c000000-0000-4000-8000-000000000003', 'Zz Cirque', true, 92),
  ('2c000000-0000-4000-8000-000000000004', 'Zz Conte', true, 93),
  ('2c000000-0000-4000-8000-000000000005', 'Zz Lecture', true, 94),
  ('2c000000-0000-4000-8000-000000000006', 'Zz Série', true, 95),
  ('2c000000-0000-4000-8000-000000000007', 'Zz Nuit', true, 96);

INSERT INTO public.tags (id, name) VALUES
  ('4e000000-0000-4000-8000-000000000001', 'Zz Jazz'),
  ('4e000000-0000-4000-8000-000000000002', 'Zz Blues'),
  ('4e000000-0000-4000-8000-000000000003', 'Zz Rock');

INSERT INTO public.events (id, title, date, end_date, category, location_id, status, created_by, tag_ids)
SELECT
  ('e5000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  titre,
  debut::timestamp AT TIME ZONE 'UTC',
  fin::timestamp AT TIME ZONE 'UTC',
  CASE categorie
    WHEN 'C1' THEN '2c000000-0000-4000-8000-000000000001'
    WHEN 'C2' THEN '2c000000-0000-4000-8000-000000000002'
    WHEN 'C3' THEN '2c000000-0000-4000-8000-000000000003'
    WHEN 'C4' THEN '2c000000-0000-4000-8000-000000000004'
    WHEN 'C5' THEN '2c000000-0000-4000-8000-000000000005'
    WHEN 'C7' THEN '2c000000-0000-4000-8000-000000000007'
    ELSE categorie
  END,
  CASE WHEN lieu IS NOT NULL THEN ('1a000000-0000-4000-8000-00000000000' || lieu)::uuid END,
  coalesce(statut, 'approved'),
  auteur::uuid,
  (SELECT coalesce(array_agg(('4e000000-0000-4000-8000-00000000000' || t)::uuid ORDER BY t), '{}')
   FROM unnest(string_to_array(tags, ' ')) AS t)
FROM (VALUES
  -- Le théâtre (L1) : l'événement de la fiche (01), qu'il organise, et ses autres événements.
  (1,  'Courant au Théâtre',          '2026-11-17 20:00', NULL, 'C1', 1, NULL, NULL, '1 2'),
  (2,  'Théâtre samedi',              '2026-11-07 20:30', NULL, 'C2', 1, NULL, NULL, ''),
  (3,  'Par le Théâtre, à la Salle',  '2026-11-08 20:30', NULL, 'C2', 2, NULL, NULL, ''),
  (4,  'Théâtre passé',               '2026-11-01 20:30', NULL, 'C1', 1, NULL, NULL, '1'),
  (5,  'Théâtre en attente, par U1',  '2026-11-19 20:30', NULL, 'C1', 1, 'pending', '3d000000-0000-4000-8000-000000000001', '1'),
  (6,  'Expo au Théâtre',             '2026-10-01 10:00', '2026-12-01 18:00', 'C2', 1, NULL, NULL, ''),
  (7,  'Théâtre, masqué par U1',      '2026-11-20 20:30', NULL, 'C1', 1, NULL, NULL, '1'),
  (8,  'Théâtre hors accueil',        '2026-11-25 20:30', NULL, 'C2', 1, NULL, NULL, ''),
  (9,  'Théâtre ce matin',            '2026-11-06 10:00', NULL, 'C2', 1, NULL, NULL, ''),
  -- Autour du 17 novembre (01 : concert, jazz et blues).
  (11, 'Jazz et blues à la Cave',     '2026-11-15 16:30', NULL, 'C1', 4, NULL, NULL, '1 2'),
  (12, 'Blues en ville B',            '2026-11-16 20:30', NULL, 'C1', 2, NULL, NULL, '2'),
  (13, 'Danse jazz',                  '2026-11-21 20:30', NULL, 'C2', 4, NULL, NULL, '1'),
  (14, 'Concert le même soir',        '2026-11-17 20:00', NULL, 'C1', 4, NULL, NULL, ''),
  (15, 'Concert écrit par son nom',   '2026-11-18 20:00', NULL, ' zz CONCERT ', 4, NULL, NULL, ''),
  (16, 'Rock dansé',                  '2026-11-16 20:30', NULL, 'C2', 4, NULL, NULL, '3'),
  (17, 'Concert trop tard',           '2026-11-25 20:00', NULL, 'C1', 4, NULL, NULL, '1'),
  (18, 'Concert trop tôt',            '2026-11-09 20:30', NULL, 'C1', 4, NULL, NULL, '1'),
  (19, 'Festival de jazz en cours',   '2026-11-12 10:00', '2026-11-22 23:00', 'C2', 4, NULL, NULL, '1'),
  (20, 'Concert d''un auteur bloqué', '2026-11-17 21:00', NULL, 'C1', 4, NULL, '3d000000-0000-4000-8000-000000000002', '1 2'),
  -- Premier et dernier jours de la plage.
  (33, 'Concert du 10 novembre',      '2026-11-10 12:00', NULL, 'C1', 4, NULL, NULL, ''),
  (34, 'Concert du 24 novembre',      '2026-11-24 20:00', NULL, 'C1', 4, NULL, NULL, ''),
  -- Autres dates d'une même série (même titre, sans accents, casse ni ponctuation, même lieu, à 7 jours
  -- au plus ; migration 20261021170000) : de la fiche (36), de 02 au théâtre (37), de 11 plus loin du
  -- 17 novembre (38), du bar (40). 39 a le titre de 09, mais à un autre lieu : une autre série.
  (36, 'Courant au Théâtre',          '2026-11-18 20:00', NULL, 'C1', 1, NULL, NULL, '1 2'),
  (37, 'THÉÂTRE  Samedi !',           '2026-11-09 20:30', NULL, 'C2', 1, NULL, NULL, ''),
  (38, 'Jazz et blues à la cave',     '2026-11-22 12:00', NULL, 'C1', 4, NULL, NULL, '1 2'),
  (39, 'Théâtre ce matin',            '2026-11-16 10:00', NULL, 'C1', 4, NULL, NULL, ''),
  (40, 'Seul au bar',                 '2026-11-12 20:30', NULL, 'C4', 3, NULL, NULL, ''),
  -- Seul à son lieu, organisé par le Collectif (O1) et l'Asso (O2).
  (21, 'Seul au Bar',                 '2026-11-10 20:30', NULL, 'C4', 3, NULL, NULL, ''),
  (22, 'Collectif à la Cave',         '2026-11-12 20:30', NULL, 'C2', 4, NULL, NULL, ''),
  (23, 'Collectif en ville B',        '2026-11-13 20:30', NULL, 'C2', 2, NULL, NULL, ''),
  (24, 'Collectif passé',             '2026-11-01 20:30', NULL, 'C2', 4, NULL, NULL, ''),
  (25, 'Asso à la Cave',              '2026-11-14 20:30', NULL, 'C2', 4, NULL, NULL, ''),
  -- Seul au kiosque, organisé par la grange (L5).
  (26, 'Seul au Kiosque',             '2026-11-11 20:30', NULL, 'C2', 6, NULL, NULL, ''),
  (27, 'À la Grange',                 '2026-11-13 18:00', NULL, 'C2', 5, NULL, NULL, ''),
  (28, 'Par la Grange, à la Cave',    '2026-11-14 18:00', NULL, 'C2', 4, NULL, NULL, ''),
  -- Seul au pré, sans organisateur, seul de sa catégorie.
  (29, 'Seul au Pré',                 '2026-11-10 18:00', NULL, 'C3', 7, NULL, NULL, ''),
  -- Sans lieu, organisé par la Bande (O3).
  (31, 'Sans lieu',                   '2026-11-12 18:00', NULL, 'C2', NULL, NULL, NULL, ''),
  (32, 'Bande à la Cave',             '2026-11-16 18:00', NULL, 'C2', 4, NULL, NULL, ''),
  -- La nuit du 6 au 7 novembre (moins de 13 h, à la salle), puis le soir du 7 (à la cave).
  (41, 'Nuit blanche',                '2026-11-06 22:00', '2026-11-07 02:00', 'C7', 2, NULL, NULL, ''),
  (48, 'Nuit suivante',               '2026-11-07 21:00', NULL, 'C7', 4, NULL, NULL, ''),
  -- Une catégorie qui n'est pas dans categories, écrite de deux façons.
  (42, 'Catégorie inconnue, un',      '2026-11-20 20:00', NULL, 'zz inconnue', 4, NULL, NULL, ''),
  (43, 'Catégorie inconnue, deux',    '2026-11-21 20:00', NULL, ' Zz Inconnue ', 4, NULL, NULL, ''),
  -- À l'atelier (L8), dont 44, organisé par la Troupe (O4), qui organise aussi 46 ailleurs.
  (44, 'Atelier un',                  '2026-11-13 18:00', NULL, 'C5', 8, NULL, NULL, ''),
  (45, 'Atelier deux',                '2026-11-14 18:00', NULL, 'C5', 8, NULL, NULL, ''),
  (46, 'Troupe à la Cave',            '2026-11-15 18:00', NULL, 'C5', 4, NULL, NULL, '')
) AS v(n, titre, debut, fin, categorie, lieu, statut, auteur, tags);

-- La médiathèque (L9) : 25 lectures du 8 au 9 novembre, de la même catégorie (50 à 74).
INSERT INTO public.events (id, title, date, category, location_id, status)
SELECT
  ('e5000000-0000-4000-8000-0000000000' || n)::uuid,
  'Lecture n° ' || (n - 49),
  ('2026-11-08 10:00'::timestamp + (n - 50) * interval '1 hour') AT TIME ZONE 'UTC',
  '2c000000-0000-4000-8000-000000000006',
  '1a000000-0000-4000-8000-000000000009',
  'approved'
FROM generate_series(50, 74) AS n;

UPDATE public.events SET hide_from_home = true WHERE id = 'e5000000-0000-4000-8000-000000000008';
INSERT INTO public.event_organizers (event_id, organizer_id, location_id) VALUES
  ('e5000000-0000-4000-8000-000000000001', NULL, '1a000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000003', NULL, '1a000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000021', '5b000000-0000-4000-8000-000000000001', NULL),
  ('e5000000-0000-4000-8000-000000000021', '5b000000-0000-4000-8000-000000000002', NULL),
  ('e5000000-0000-4000-8000-000000000022', '5b000000-0000-4000-8000-000000000001', NULL),
  ('e5000000-0000-4000-8000-000000000023', '5b000000-0000-4000-8000-000000000001', NULL),
  ('e5000000-0000-4000-8000-000000000024', '5b000000-0000-4000-8000-000000000001', NULL),
  ('e5000000-0000-4000-8000-000000000025', '5b000000-0000-4000-8000-000000000002', NULL),
  ('e5000000-0000-4000-8000-000000000026', NULL, '1a000000-0000-4000-8000-000000000005'),
  ('e5000000-0000-4000-8000-000000000028', NULL, '1a000000-0000-4000-8000-000000000005'),
  ('e5000000-0000-4000-8000-000000000031', '5b000000-0000-4000-8000-000000000003', NULL),
  ('e5000000-0000-4000-8000-000000000032', '5b000000-0000-4000-8000-000000000003', NULL),
  ('e5000000-0000-4000-8000-000000000044', '5b000000-0000-4000-8000-000000000004', NULL),
  ('e5000000-0000-4000-8000-000000000046', '5b000000-0000-4000-8000-000000000004', NULL);
INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e5000000-0000-4000-8000-000000000007', '3d000000-0000-4000-8000-000000000001');
INSERT INTO public.blocked_users (blocker_user_id, blocked_user_id) VALUES
  ('3d000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-000000000002');

-- Sans session (clé anon publique) --------------------------------------------------------------

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

-- « Aussi à » : le théâtre, ses événements à venir par date (l'expo en cours d'abord, celui de ce matin
-- sans heure de fin), une ligne par série ; pas 01 (la fiche), 36 (une autre date de la fiche), 37
-- (une autre date de 02), 04 (passé), 05 (en attente). Compte : 01, 02, 03, 06, 07, 08, 09, 36, 37, la
-- fiche comprise, chaque date comptée, comme sa page.
SELECT pg_temp.verifie('aussi : le lieu, par date, et son compte',
  pg_temp.aussi('01'), '06 09 02 (Zz Théâtre:location=9)');
-- Tous : avec 03, qu'il organise en ville B (hors périmètre : la page du lieu est toutes villes), et 08,
-- retiré de l'accueil.
SELECT pg_temp.verifie('aussi : ce qu''il organise ailleurs, hors périmètre ; hors accueil compris',
  pg_temp.aussi('01', ARRAY['0a000000-0000-4000-8000-000000000001']::uuid[], 20),
  '06 09 02 03 07 08 (Zz Théâtre:location=9)');
-- 04 est passé : sa fiche propose le théâtre, dont le compte ne le comprend pas.
SELECT pg_temp.verifie('aussi : fiche d''un événement passé',
  pg_temp.aussi('04'), '06 09 02 (Zz Théâtre:location=9)');
SELECT pg_temp.verifie('aussi : fiche de l''expo en cours',
  pg_temp.aussi('06'), '09 02 03 (Zz Théâtre:location=9)');

-- Le lieu n'a pas d'autre série (40 est une autre date de la sienne) : l'organisateur qui a le plus
-- d'événements (Collectif : 22, 23 ; Asso : 25).
SELECT pg_temp.verifie('aussi : à défaut du lieu, l''organisateur le plus fourni',
  pg_temp.aussi('21'), '22 23 (Zz Collectif:organizer=3)');
-- Un lieu qui organise (la grange) : ceux qui s'y tiennent (27) et ceux qu'il organise (28).
SELECT pg_temp.verifie('aussi : à défaut du lieu, le lieu qui organise',
  pg_temp.aussi('26'), '27 28 (Zz Grange:location=3)');
SELECT pg_temp.verifie('aussi : sans lieu, l''organisateur',
  pg_temp.aussi('31'), '32 (Zz Bande:organizer=2)');
SELECT pg_temp.verifie('aussi : ni lieu fourni ni organisateur, pas de rangée',
  pg_temp.aussi('29'), '');
-- L'atelier a un autre spectacle (45) : il passe avant la Troupe, qui organise 44 et 46.
SELECT pg_temp.verifie('aussi : le lieu avant l''organisateur',
  pg_temp.aussi('44'), '45 (Zz Atelier:location=2)');

-- « Dans le même genre » autour du 17 novembre ([10, 25 novembre)), le plus proche d'abord : 20 et 11
-- (catégorie et deux tags), 12 et 07 (catégorie et un tag), puis 19 (un tag, en cours ce soir-là), 14
-- (catégorie, même soir), 15 (catégorie écrite par son nom), 39 (catégorie ; le titre de 09, montré dans
-- « Aussi à », mais une autre série), 13 (un tag), 33 et 34 (catégorie, premier et dernier jours). Pas 16
-- (autre genre), 17 et 18 (hors des 7 jours), 05 (en attente), 36 (la série de la fiche), 38 (la série
-- de 11, plus loin). Les trois retenus, par date.
SELECT pg_temp.verifie('genre : les plus proches, rendus par date',
  pg_temp.genre('01'), '11 12 20');
SELECT pg_temp.verifie('genre : tous, par date',
  pg_temp.genre('01', NULL, 4) || ' / ' || pg_temp.genre('01', NULL, 20),
  '11 12 20 07 / 33 19 11 39 12 14 20 15 13 34');
-- Avec 5 par rangée, 07 est dans « Aussi à » : plus dans « Dans le même genre ».
SELECT pg_temp.verifie('genre : sans ceux de la rangée « Aussi à »',
  pg_temp.aussi('01', NULL, 5) || ' / ' || pg_temp.genre('01', NULL, 5),
  '06 09 02 03 07 (Zz Théâtre:location=9) / 19 11 12 14 20');
SELECT pg_temp.verifie('genre : dans le périmètre (ville A : pas 12)',
  pg_temp.genre('01', ARRAY['0a000000-0000-4000-8000-000000000001']::uuid[]), '11 20 07');
-- Passé ou en cours : les 7 jours à partir d'aujourd'hui ([6, 14 novembre)). 04 : 18 (catégorie et
-- tag), 33 (catégorie), 19 (tag). 06 (danse, sans tag ; 09, 02 et 03 sont dans « Aussi à ») : les trois danses les plus
-- proches de maintenant, 26, 19 et 31 (sans lieu), avant 22, 27 et 23 ; pas 25 ni 28 (14 novembre).
SELECT pg_temp.verifie('genre : fiche d''un événement passé, à partir d''aujourd''hui',
  pg_temp.genre('04'), '18 33 19');
SELECT pg_temp.verifie('genre : fiche de l''expo en cours',
  pg_temp.genre('06'), '26 19 31');
SELECT pg_temp.verifie('genre : seul de sa catégorie, sans tag',
  pg_temp.genre('29'), '');
SELECT pg_temp.verifie('genre : catégorie absente de categories, par son texte',
  pg_temp.genre('42'), '43');
-- 41 (22:00 → 02:00, moins de 13 h) appartient au 6 novembre : à 00:30 le 7, il n'est plus « à venir »
-- (à partir d'aujourd'hui 0 h, comme la recherche), même s'il n'est pas fini.
SELECT pg_temp.verifie('genre : à partir d''aujourd''hui 0 h',
  pg_temp.genre('48', NULL, 3, '2026-11-06 23:00') || ' / ' || pg_temp.genre('48', NULL, 3, '2026-11-07 00:30'),
  '41 / ');

SELECT pg_temp.verifie('rangs : « Aussi à » puis « Dans le même genre », à partir de 1',
  (SELECT string_agg(s.section || s.rank, ' ' ORDER BY s.rank)
   FROM public.app_see_also('e5000000-0000-4000-8000-000000000001', NULL, '2026-11-06 19:15') AS s),
  'place1 place2 place3 genre4 genre5 genre6');
SELECT pg_temp.verifie('nombre par rangée : 1 au moins, 20 au plus, 3 par défaut',
  pg_temp.aussi('01', NULL, 0) || ' / ' || pg_temp.genre('01', NULL, 0) || ' / '
  || pg_temp.genre('01', NULL, NULL) || ' / '
  || (SELECT count(*) FROM public.app_see_also('e5000000-0000-4000-8000-000000000001', NULL, '2026-11-06 19:15', 1000))::text,
  '06 (Zz Théâtre:location=9) / 20 / 11 12 20 / 16');
-- 24 autres lectures à la médiathèque : 20 dans « Aussi à », les 4 dernières dans « Dans le même genre ».
SELECT pg_temp.verifie('nombre par rangée : 20 au plus',
  (SELECT count(*) FILTER (WHERE s.section = 'place') || '/' || count(*) FILTER (WHERE s.section = 'genre')
   FROM public.app_see_also('e5000000-0000-4000-8000-000000000050', NULL, '2026-11-06 19:15', 1000) AS s),
  '20/4');
SELECT pg_temp.verifie('événement en attente, inconnu ou nul : rien',
  pg_temp.aussi('05') || pg_temp.genre('05') || '|'
  || (SELECT count(*) FROM public.app_see_also('9f000000-0000-4000-8000-000000000000'))::text
  || (SELECT count(*) FROM public.app_see_also(NULL))::text,
  '|00');
SELECT pg_temp.verifie('le 2 décembre : l''expo est finie, plus rien au théâtre',
  pg_temp.aussi('01', NULL, 3, '2026-12-02 09:00') || '|' || pg_temp.genre('01', NULL, 3, '2026-12-02 09:00'),
  '|');
SELECT pg_temp.verifie('anon : table des lignes illisible', pg_temp.lit_les_lignes(), 'erreur 42501');

-- Égalité entre organisateurs : par nom. L'Asso gagne un événement (2 contre 2) : « Zz Asso » d'abord.
RESET ROLE;
INSERT INTO public.events (id, title, date, category, location_id, status)
VALUES ('e5000000-0000-4000-8000-000000000030', 'Asso, encore', '2026-11-15 20:30'::timestamp AT TIME ZONE 'UTC',
  '2c000000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000004', 'approved');
INSERT INTO public.event_organizers (event_id, organizer_id) VALUES
  ('e5000000-0000-4000-8000-000000000030', '5b000000-0000-4000-8000-000000000002');
SET LOCAL ROLE anon;
SELECT pg_temp.verifie('aussi : organisateurs à égalité, par nom',
  pg_temp.aussi('21'), '25 30 (Zz Asso:organizer=3)');

-- Avec la session de U1 : sans 07, qu'il a masqué, ni 20, d'un auteur qu'il a bloqué ; il voit son
-- événement en attente (05), et sa fiche propose le théâtre.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000001"}', true);
SELECT pg_temp.verifie('U1 : sans l''événement masqué ni l''auteur bloqué',
  pg_temp.aussi('01', NULL, 20) || ' / ' || pg_temp.genre('01'),
  '06 09 02 03 08 (Zz Théâtre:location=8) / 19 11 12');
SELECT pg_temp.verifie('U1 : la fiche de son événement en attente',
  pg_temp.aussi('05'), '06 09 02 (Zz Théâtre:location=8)');
SELECT pg_temp.verifie('authenticated : table des lignes illisible', pg_temp.lit_les_lignes(), 'erreur 42501');

RESET ROLE;
ROLLBACK;
