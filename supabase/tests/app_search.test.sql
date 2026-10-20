-- Tests de app_search() et app_search_names() (migration 20261020160000_create_app_search.sql).
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.
--
-- « Maintenant » est fixé au vendredi 6 novembre 2026, 19:15 (heure de Paris) par `at_time`. Les
-- événements sont désignés par les deux derniers chiffres de leur id (« 01 » = S01).

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

-- Événements trouvés, dans l'ordre du rang : « 15 01 12 ».
CREATE FUNCTION pg_temp.trouve(requete text, villes uuid[] DEFAULT NULL, nombre integer DEFAULT 30,
  maintenant timestamp DEFAULT '2026-11-06 19:15') RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(s.event_id::text, 2), ' ' ORDER BY s.rank), '')
  FROM public.app_search(requete, villes, maintenant, nombre) AS s
$$;

-- Noms trouvés, dans l'ordre du rang : « category:Zz Fanfare=7 tag:Zz Jazz=3 ».
CREATE FUNCTION pg_temp.noms(requete text, villes uuid[] DEFAULT NULL, nombre integer DEFAULT 10,
  maintenant timestamp DEFAULT '2026-11-06 19:15') RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(n.kind || ':' || n.name || '=' || n.events_count, ' ' ORDER BY n.rank), '')
  FROM public.app_search_names(requete, villes, maintenant, nombre) AS n
$$;

-- Jeu d'essai --------------------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('3d000000-0000-4000-8000-000000000001', 'u1@test.local'),
  ('3d000000-0000-4000-8000-000000000002', 'u2@test.local');

INSERT INTO public.cities (id, label, label_normalized, slug, is_active) VALUES
  ('0a000000-0000-4000-8000-000000000001', 'Ville A', 'ville a', 'ville-a', true),
  ('0a000000-0000-4000-8000-000000000002', 'Ville B', 'ville b', 'ville-b', true);

-- L1 : théâtre qui organise aussi (ville A) ; L2 : salle (ville B) ; L3 : bar (ville A), homonyme de
-- l'organisateur O2. Les noms passent par format_entity_name_trigger : « Zz Théâtre d'orléans ».
INSERT INTO public.locations (id, name, address, is_organizer, image_url) VALUES
  ('1a000000-0000-4000-8000-000000000001', 'Zz Théâtre d’Orléans', '1 rue A', true, 'https://img.test/l1.jpg'),
  ('1a000000-0000-4000-8000-000000000002', 'Zz Salle Bleue', '1 rue B', false, NULL),
  ('1a000000-0000-4000-8000-000000000003', 'Zz Noraebang', '2 rue A', false, NULL);
UPDATE public.locations SET city_id = '0a000000-0000-4000-8000-000000000001'
WHERE id IN ('1a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000003');
UPDATE public.locations SET city_id = '0a000000-0000-4000-8000-000000000002'
WHERE id = '1a000000-0000-4000-8000-000000000002';

INSERT INTO public.organizers (id, name, logo_url, icon_url) VALUES
  ('5b000000-0000-4000-8000-000000000001', 'Zz Collectif Lune', 'https://img.test/o1.png', NULL),
  ('5b000000-0000-4000-8000-000000000002', 'Zz Noraebang', NULL, 'https://img.test/o2.png');

INSERT INTO public.artists (id, name, slug) VALUES
  ('a7000000-0000-4000-8000-000000000001', 'Luiza Zz', 'luiza-zz');

INSERT INTO public.categories (id, name, is_active, display_order) VALUES
  ('2c000000-0000-4000-8000-000000000001', 'Zz Fanfare', true, 90),
  ('2c000000-0000-4000-8000-000000000002', 'Zz Inactive', false, 91);

INSERT INTO public.tags (id, name) VALUES
  ('4e000000-0000-4000-8000-000000000001', 'Zz Jazz'),
  ('4e000000-0000-4000-8000-000000000002', 'Zz Humour');

INSERT INTO public.events (id, title, description, date, end_date, category, location_id, status, created_by, tag_ids)
SELECT
  ('e1000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  titre,
  coalesce(texte, ''),
  debut::timestamp AT TIME ZONE 'UTC',
  fin::timestamp AT TIME ZONE 'UTC',
  coalesce(categorie, 'Spectacle'),
  ('1a000000-0000-4000-8000-00000000000' || lieu)::uuid,
  coalesce(statut, 'approved'),
  auteur::uuid,
  coalesce(tags, '{}')::uuid[]
FROM (VALUES
  -- Fanfare : titre, catégorie (par id ou par nom), description, exclusions.
  (1,  'Fanfare du samedi',       NULL, '2026-11-07 20:30', NULL, '2c000000-0000-4000-8000-000000000001', 2, NULL, NULL, NULL),
  (2,  'Soirée cabaret',          NULL, '2026-11-08 20:30', NULL, '2c000000-0000-4000-8000-000000000001', 2, NULL, NULL, NULL),
  (3,  'Concert au parc',         'Une fanfare joyeuse ouvre le bal.', '2026-11-09 20:30', NULL, NULL, 1, NULL, NULL, NULL),
  (10, 'Fanfare passée',          NULL, '2026-11-01 20:30', NULL, '2c000000-0000-4000-8000-000000000001', 1, NULL, NULL,
       '{4e000000-0000-4000-8000-000000000002}'),
  (11, 'Fanfare en attente',      NULL, '2026-11-16 20:30', NULL, '2c000000-0000-4000-8000-000000000001', 1, 'pending', NULL, NULL),
  (12, 'Fanfare masquée par U1',  NULL, '2026-11-17 20:30', NULL, '2c000000-0000-4000-8000-000000000001', 1, NULL, NULL, NULL),
  (13, 'Fanfare d’un auteur bloqué', NULL, '2026-11-18 20:30', NULL, '2c000000-0000-4000-8000-000000000001', 1, NULL,
       '3d000000-0000-4000-8000-000000000002', NULL),
  (14, 'Fanfare hors accueil',    NULL, '2026-11-19 20:30', NULL, '2c000000-0000-4000-8000-000000000001', 1, NULL, NULL, NULL),
  (15, 'Expo longue de la fanfare', NULL, '2026-10-01 10:00', '2026-12-01 18:00', '2c000000-0000-4000-8000-000000000001', 1, NULL, NULL, NULL),
  (16, 'Fanfare de Ville B',      NULL, '2026-11-20 20:30', NULL, ' zz FANFARE ', 2, NULL, NULL, NULL),
  -- Artiste, tag, organisateurs, homonyme, catégorie inactive.
  (4,  'Récital',                 NULL, '2026-11-10 20:30', NULL, NULL, 1, NULL, NULL, NULL),
  (5,  'Nuit jazz',               NULL, '2026-11-11 20:30', NULL, NULL, 2, NULL, NULL, '{4e000000-0000-4000-8000-000000000001}'),
  (6,  'Blues et swing',          NULL, '2026-11-12 20:30', NULL, NULL, 1, NULL, NULL, '{4e000000-0000-4000-8000-000000000001}'),
  (7,  'Jam session',             NULL, '2026-11-13 20:30', NULL, NULL, 2, NULL, NULL, '{4e000000-0000-4000-8000-000000000001}'),
  (8,  'Atelier impro',           NULL, '2026-11-14 20:30', NULL, NULL, 1, NULL, NULL, NULL),
  (9,  'Karaoké',                 NULL, '2026-11-15 20:30', NULL, NULL, 3, NULL, NULL, NULL),
  (19, 'Karaoké géant',           NULL, '2026-11-07 21:00', NULL, NULL, 2, NULL, NULL, NULL),
  (20, 'Spectacle discret',       NULL, '2026-11-21 20:30', NULL, '2c000000-0000-4000-8000-000000000002', 2, NULL, NULL, NULL),
  -- Requête de plusieurs mots : la phrase d'un bloc d'abord.
  (17, 'Salle comble pour Bleue', NULL, '2026-11-08 18:00', NULL, NULL, 1, NULL, NULL, NULL),
  (18, 'La salle bleue en fête',  NULL, '2026-11-22 18:00', NULL, NULL, 1, NULL, NULL, NULL)
) AS v(n, titre, texte, debut, fin, categorie, lieu, statut, auteur, tags);

UPDATE public.events SET hide_from_home = true WHERE id = 'e1000000-0000-4000-8000-000000000014';
INSERT INTO public.event_artists (event_id, artist_id) VALUES
  ('e1000000-0000-4000-8000-000000000004', 'a7000000-0000-4000-8000-000000000001');
INSERT INTO public.event_organizers (event_id, organizer_id, location_id) VALUES
  ('e1000000-0000-4000-8000-000000000008', '5b000000-0000-4000-8000-000000000001', NULL),
  ('e1000000-0000-4000-8000-000000000009', '5b000000-0000-4000-8000-000000000002', NULL),
  ('e1000000-0000-4000-8000-000000000019', '5b000000-0000-4000-8000-000000000002', NULL),
  -- Le théâtre organise une soirée à la salle.
  ('e1000000-0000-4000-8000-000000000002', NULL, '1a000000-0000-4000-8000-000000000001');
INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e1000000-0000-4000-8000-000000000012', '3d000000-0000-4000-8000-000000000001');
INSERT INTO public.blocked_users (blocker_user_id, blocked_user_id) VALUES
  ('3d000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-000000000002');

-- Sans session (clé anon publique) --------------------------------------------------------------

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

SELECT pg_temp.verifie('mots de la requête : normalisés, mots vides non exigés',
  (SELECT string_agg(w.word || '/' || coalesce(w.word_prefix, '-') || '/' || w.required, ' ' ORDER BY w.word_count, w.word)
   FROM public.app_search_query_words('Théâtre d’Orléans') AS w),
  'd/-/false orleans/orle/true theatre/thea/true');

-- Titre (le plus ancien d'abord : l'expo en cours) ; puis la catégorie seule (02) ; puis la
-- description seule (03). Pas le passé (10) ni l'événement en attente (11) ; avec celui retiré de
-- l'accueil (14) ; 16 a sa catégorie écrite par son nom.
SELECT pg_temp.verifie('« fanfare » : titre, puis catégorie, puis description',
  pg_temp.trouve('fanfare'), '15 01 12 13 14 16 02 03');
SELECT pg_temp.verifie('sans accents ni casse',
  pg_temp.trouve('FANFARÉ'), pg_temp.trouve('fanfare'));
SELECT pg_temp.verifie('début de mot (« fanf »)',
  pg_temp.trouve('fanf'), '15 01 12 13 14 16 02 03');
SELECT pg_temp.verifie('faute de frappe : titres et catégorie, pas la description',
  pg_temp.trouve('fanfre'), '15 01 12 13 14 16 02');
SELECT pg_temp.verifie('faute de frappe dans un titre (« concrt »)',
  pg_temp.trouve('concrt'), '03');
SELECT pg_temp.verifie('même racine (« concerts » trouve « Concert au parc »)',
  pg_temp.trouve('concerts'), '03');
SELECT pg_temp.verifie('artiste lié (« luiza »)',
  pg_temp.trouve('luiza'), '04');
SELECT pg_temp.verifie('organisateur (« lune »)',
  pg_temp.trouve('lune'), '08');
SELECT pg_temp.verifie('« jaz » : le titre, puis le tag',
  pg_temp.trouve('jaz'), '05 06 07');
SELECT pg_temp.verifie('chaque mot quelque part : tag et lieu (« jazz salle »)',
  pg_temp.trouve('jazz salle'), '05 07');
SELECT pg_temp.verifie('« theatre d orleans » : les événements du lieu et celui qu''il organise (« d » non exigé)',
  pg_temp.trouve('theatre d orleans'), '15 17 02 03 04 06 08 12 13 14 18');
SELECT pg_temp.verifie('la phrase d''un bloc d''abord (titre, puis lieu), mots épars ensuite',
  pg_temp.trouve('salle bleue'), '18 17 01 19 02 05 07 16 20');
SELECT pg_temp.verifie('titre égal à la requête avant un titre plus ancien',
  pg_temp.trouve('karaoke'), '09 19');
SELECT pg_temp.verifie('ville (« ville b »)',
  pg_temp.trouve('ville b', nombre => 3), '16 01 19');
SELECT pg_temp.verifie('mots vides seuls : tous exigés (« de »)',
  pg_temp.trouve('de'), '15 16');
SELECT pg_temp.verifie('moins de 2 caractères, vide, nul : rien',
  pg_temp.trouve('f') || '|' || pg_temp.trouve('  ') || '|' || pg_temp.trouve(NULL), '||');
SELECT pg_temp.verifie('aucun résultat',
  pg_temp.trouve('zzqx'), '');
SELECT pg_temp.verifie('10 mots au plus : le onzième est ignoré',
  pg_temp.trouve('fanfare de la de la de la de la de zzqx'), pg_temp.trouve('fanfare'));
SELECT pg_temp.verifie('périmètre : ville A',
  pg_temp.trouve('fanfare', ARRAY['0a000000-0000-4000-8000-000000000001']::uuid[]), '15 12 13 14 03');
SELECT pg_temp.verifie('max_results 2, puis 0 (→ 1)',
  pg_temp.trouve('fanfare', nombre => 2) || ' | ' || pg_temp.trouve('fanfare', nombre => 0), '15 01 | 15');
SELECT pg_temp.verifie('max_results 1000 : 100 au plus (8 ici), nul : 30',
  (SELECT count(*)::text FROM public.app_search('fanfare', NULL, '2026-11-06 19:15', 1000)) || ' '
    || (SELECT count(*)::text FROM public.app_search('fanfare', NULL, '2026-11-06 19:15', NULL)),
  '8 8');
SELECT pg_temp.verifie('rangs de 1 à n',
  (SELECT string_agg(s.rank::text, ' ' ORDER BY s.rank) FROM public.app_search('jaz', NULL, '2026-11-06 19:15') AS s),
  '1 2 3');
-- Plus tard : le 21 novembre, il ne reste que l'expo en cours.
SELECT pg_temp.verifie('le 21 novembre',
  pg_temp.trouve('fanfare', maintenant => '2026-11-21 09:00'), '15');

-- Noms : catégories, tags, lieux, organisateurs avec leurs événements à venir.
SELECT pg_temp.verifie('« fanfare » : la catégorie, ses 7 événements à venir (par id ou nom)',
  pg_temp.noms('fanfare'), 'category:Zz Fanfare=7');
SELECT pg_temp.verifie('« jaz » : le tag',
  pg_temp.noms('jaz'), 'tag:Zz Jazz=3');
SELECT pg_temp.verifie('« theatre d orleans » : le lieu, ses événements et celui qu''il organise ailleurs',
  pg_temp.noms('theatre d orleans'), 'location:Zz Théâtre d''orléans=11');
SELECT pg_temp.verifie('lieu : organisateur, image, ville',
  (SELECT is_organizer || ' ' || image_url || ' ' || city FROM public.app_search_names('orleans', NULL, '2026-11-06 19:15')),
  'true https://img.test/l1.jpg Ville A');
SELECT pg_temp.verifie('organisateur : ses événements, son logo',
  (SELECT kind || ' ' || events_count || ' ' || is_organizer || ' ' || image_url || ' ' || coalesce(city, '-')
   FROM public.app_search_names('lune', NULL, '2026-11-06 19:15')),
  'organizer 1 true https://img.test/o1.png -');
SELECT pg_temp.verifie('homonymes : le lieu une fois, avec les événements de l''organisateur',
  (SELECT string_agg(kind || ' ' || events_count || ' ' || is_organizer, ', ')
   FROM public.app_search_names('noraebang', NULL, '2026-11-06 19:15')),
  'location 2 true');
SELECT pg_temp.verifie('salle simple : pas organisatrice',
  (SELECT is_organizer::text FROM public.app_search_names('salle bleue', NULL, '2026-11-06 19:15')), 'false');
SELECT pg_temp.verifie('catégorie inactive, tag sans événement à venir : rien',
  pg_temp.noms('inactive') || '|' || pg_temp.noms('humour'), '|');
SELECT pg_temp.verifie('« zz », 1 de chaque sorte, dans l''ordre catégories, tags, lieux, organisateurs',
  pg_temp.noms('zz', nombre => 1), 'category:Zz Fanfare=7 tag:Zz Jazz=3 location:Zz Théâtre d''orléans=11 organizer:Zz Collectif Lune=1');
SELECT pg_temp.verifie('noms, périmètre : ville B',
  pg_temp.noms('fanfare', ARRAY['0a000000-0000-4000-8000-000000000002']::uuid[]), 'category:Zz Fanfare=3');
SELECT pg_temp.verifie('noms, moins de 2 caractères : rien',
  pg_temp.noms('z'), '');

DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.app_search_results;
    RAISE EXCEPTION 'ÉCHEC anon a pu lire app_search_results';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok  app_search_results : lecture refusée en anon';
  END;
END $$;

-- Avec la session de U1 : sans 12 (masqué) ni 13 (auteur bloqué) ----------------------------------

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000001"}', true);
SELECT pg_temp.verifie('U1 : événements et comptes',
  pg_temp.trouve('fanfare') || ' | ' || pg_temp.noms('fanfare'),
  '15 01 14 16 02 03 | category:Zz Fanfare=5');

ROLLBACK;
