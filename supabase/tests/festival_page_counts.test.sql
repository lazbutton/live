-- Tests de la migration 20261023190000_count_festival_frames_on_pages.sql : les nombres des pages de lieu,
-- d'organisateur et d'artiste sans les fiches qu'elles montrent dans « Festivals » (un festival qui a un programme ;
-- sur la page d'un lieu, aussi un festival dont il est un des lieux) : app_organizer_counts, app_search_names,
-- app_see_also (source_events_count), app_follows.
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.
--
-- « Maintenant » est fixé au mercredi 18 novembre 2026, 10:00 (heure de Paris) par `at_time`. Les événements sont
-- désignés par les deux derniers caractères de leur id ; les lieux L1 à L5, l'organisateur O1, l'artiste A1.
--
-- Le jeu d'essai :
--   F1 « Zz Fulgurances » au Dropkick (L1), ses lieux L1, L2, L3, organisé par O1, avec A1, tag Zz Jazz ;
--      son programme : 01 au Dropkick (tag Zz Jazz), 02 au Cent Huit (L2)
--   03 à l'Astrolabe (L3), avec A1 ; 04 au Dropkick ; 05 au Dropkick, organisé par l'Astrolabe
--   F2 à la Passerelle (L4), ses lieux L4, organisé par O1, sans programme (« programme à venir »)
--   F3 à la Passerelle, festival sans lieux ni programme (une ancienne fiche)
--   F4 au Fichier (L5), ses lieux L5, sans programme : le seul événement à venir du lieu
--   U1 a masqué 01 et 02 (pour lui, F1 n'a plus de programme) ; U2, rien.

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

-- La session : anon, ou un compte (« 01 », « 02 »). Toujours suivie de RESET ROLE.
CREATE FUNCTION pg_temp.session(compte text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF compte IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    SET LOCAL ROLE anon;
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object(
      'role', 'authenticated',
      'sub', '3a000000-0000-4000-8000-0000000000' || compte,
      'is_anonymous', false,
      'app_metadata', json_build_object('provider', 'email')
    )::text, true);
    SET LOCAL ROLE authenticated;
  END IF;
END $$;

-- Le code d'un lieu, d'un organisateur ou d'un artiste : « L1 », « O1 », « A1 ».
CREATE FUNCTION pg_temp.code(id uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT CASE left(id::text, 2) WHEN '1e' THEN 'L' WHEN '2e' THEN 'O' WHEN '4e' THEN 'A' ELSE '?' END
    || right(id::text, 1)
$$;

-- app_organizer_counts des cinq lieux et de l'organisateur : « L1=3 L2=1 … O1=1 ».
CREATE FUNCTION pg_temp.pages() RETURNS text
LANGUAGE sql AS $$
  SELECT string_agg(pg_temp.code(c.organizer_id) || '=' || c.events_count, ' ' ORDER BY pg_temp.code(c.organizer_id))
  FROM public.app_organizer_counts(
    ARRAY['1e000000-0000-4000-8000-000000000001', '1e000000-0000-4000-8000-000000000002',
          '1e000000-0000-4000-8000-000000000003', '1e000000-0000-4000-8000-000000000004',
          '1e000000-0000-4000-8000-000000000005', '2e000000-0000-4000-8000-000000000001']::uuid[],
    at_time => '2026-11-18 10:00'
  ) AS c
$$;

-- app_search_names("zz") : « location:Zz Dropkick=3 … tag:Zz Jazz=2 », par sorte puis par nom.
CREATE FUNCTION pg_temp.recherche() RETURNS text
LANGUAGE sql AS $$
  SELECT string_agg(n.kind || ':' || n.name || '=' || n.events_count, ' ' ORDER BY n.kind, n.name)
  FROM public.app_search_names('zz', at_time => '2026-11-18 10:00', max_results => 20) AS n
$$;

-- La source de « À voir aussi » d'un événement et son nombre : « Zz Dropkick=3 ».
CREATE FUNCTION pg_temp.source(evenement text) RETURNS text
LANGUAGE sql AS $$
  SELECT min(s.source_name || '=' || s.source_events_count)
  FROM public.app_see_also(('e6000000-0000-4000-8000-0000000000' || evenement)::uuid,
    at_time => '2026-11-18 10:00', max_results => 20) AS s
  WHERE s.section = 'place'
$$;

-- app_follows de la session : « artist:A1=1/1 location:L1=3/3 … » (à venir / nouveaux).
CREATE FUNCTION pg_temp.suivis() RETURNS text
LANGUAGE sql AS $$
  SELECT string_agg(f.target_type || ':' || pg_temp.code(f.target_id) || '=' || f.upcoming_count || '/' || f.new_count,
    ' ' ORDER BY f.target_type, pg_temp.code(f.target_id))
  FROM public.app_follows('2026-11-18 10:00') AS f
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO anon, authenticated;

-- Jeu d'essai ---------------------------------------------------------------------------------------------

INSERT INTO auth.users (id, email, is_anonymous) VALUES
  ('3a000000-0000-4000-8000-000000000001', 'u1@test.local', false),
  ('3a000000-0000-4000-8000-000000000002', 'u2@test.local', false);

INSERT INTO public.locations (id, name, address) VALUES
  ('1e000000-0000-4000-8000-000000000001', 'Zz Dropkick', '1 rue A'),
  ('1e000000-0000-4000-8000-000000000002', 'Zz Cent Huit', '1 rue B'),
  ('1e000000-0000-4000-8000-000000000003', 'Zz Astrolabe', '1 rue C'),
  ('1e000000-0000-4000-8000-000000000004', 'Zz Passerelle', '1 rue D'),
  ('1e000000-0000-4000-8000-000000000005', 'Zz Fichier', '1 rue E');
INSERT INTO public.organizers (id, name) VALUES ('2e000000-0000-4000-8000-000000000001', 'Zz Collectif');
INSERT INTO public.artists (id, name, slug) VALUES ('4e000000-0000-4000-8000-000000000001', 'Zz Artiste', 'zz-artiste');
INSERT INTO public.tags (id, name) VALUES ('5e000000-0000-4000-8000-000000000001', 'Zz Jazz');

INSERT INTO public.events (id, title, date, end_date, category, location_id, status, tag_ids)
SELECT
  ('e6000000-0000-4000-8000-0000000000' || v.code)::uuid,
  'Zz ' || v.code,
  v.debut::timestamp AT TIME ZONE 'UTC',
  v.fin::timestamp AT TIME ZONE 'UTC',
  v.categorie,
  ('1e000000-0000-4000-8000-00000000000' || v.lieu)::uuid,
  'approved',
  v.tags::uuid[]
FROM (VALUES
  ('f1', '2026-11-19 21:00', '2026-11-22 04:45', 'Festival', 1, '{5e000000-0000-4000-8000-000000000001}'),
  ('01', '2026-11-19 21:00', '2026-11-20 00:45', 'DJ Set', 1, '{5e000000-0000-4000-8000-000000000001}'),
  ('02', '2026-11-20 18:00', NULL, 'Concert', 2, '{}'),
  ('03', '2026-11-21 20:00', NULL, 'Concert', 3, '{}'),
  ('04', '2026-11-20 20:00', NULL, 'DJ Set', 1, '{}'),
  ('05', '2026-11-21 21:00', NULL, 'Concert', 1, '{}'),
  ('f2', '2026-11-25 18:00', '2026-11-27 23:00', 'Festival', 4, '{}'),
  ('f3', '2026-11-26 20:00', '2026-11-26 23:00', 'Festival', 4, '{}'),
  ('f4', '2026-11-28 18:00', '2026-11-29 23:00', 'Festival', 5, '{}')
) AS v(code, debut, fin, categorie, lieu, tags);

UPDATE public.events SET festival_id = 'e6000000-0000-4000-8000-0000000000f1'
WHERE id IN ('e6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000002');

INSERT INTO public.festival_locations (festival_id, location_id, sort_index) VALUES
  ('e6000000-0000-4000-8000-0000000000f1', '1e000000-0000-4000-8000-000000000001', 0),
  ('e6000000-0000-4000-8000-0000000000f1', '1e000000-0000-4000-8000-000000000002', 1),
  ('e6000000-0000-4000-8000-0000000000f1', '1e000000-0000-4000-8000-000000000003', 2),
  ('e6000000-0000-4000-8000-0000000000f2', '1e000000-0000-4000-8000-000000000004', 0),
  ('e6000000-0000-4000-8000-0000000000f4', '1e000000-0000-4000-8000-000000000005', 0);

INSERT INTO public.event_organizers (event_id, organizer_id, location_id) VALUES
  ('e6000000-0000-4000-8000-0000000000f1', '2e000000-0000-4000-8000-000000000001', NULL),
  ('e6000000-0000-4000-8000-0000000000f2', '2e000000-0000-4000-8000-000000000001', NULL),
  ('e6000000-0000-4000-8000-000000000005', NULL, '1e000000-0000-4000-8000-000000000003');
INSERT INTO public.event_artists (event_id, artist_id) VALUES
  ('e6000000-0000-4000-8000-0000000000f1', '4e000000-0000-4000-8000-000000000001'),
  ('e6000000-0000-4000-8000-000000000003', '4e000000-0000-4000-8000-000000000001');

-- Publiés la veille de « maintenant » : nouveaux pour les suivis (depuis 7 jours et depuis le suivi).
ALTER TABLE public.events DISABLE TRIGGER trg_events_set_published_at;
UPDATE public.events SET published_at = '2026-11-17 08:00+00' WHERE id::text LIKE 'e6000000-%';
ALTER TABLE public.events ENABLE TRIGGER trg_events_set_published_at;

INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e6000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-000000000001'),
  ('e6000000-0000-4000-8000-000000000002', '3a000000-0000-4000-8000-000000000001');
INSERT INTO public.user_follows (user_id, target_type, target_id, created_at) VALUES
  ('3a000000-0000-4000-8000-000000000001', 'location', '1e000000-0000-4000-8000-000000000001', '2026-11-01 08:00+00'),
  ('3a000000-0000-4000-8000-000000000001', 'organizer', '2e000000-0000-4000-8000-000000000001', '2026-11-01 08:00+00'),
  ('3a000000-0000-4000-8000-000000000001', 'artist', '4e000000-0000-4000-8000-000000000001', '2026-11-01 08:00+00'),
  ('3a000000-0000-4000-8000-000000000002', 'location', '1e000000-0000-4000-8000-000000000001', '2026-11-01 08:00+00'),
  ('3a000000-0000-4000-8000-000000000002', 'location', '1e000000-0000-4000-8000-000000000004', '2026-11-01 08:00+00'),
  ('3a000000-0000-4000-8000-000000000002', 'location', '1e000000-0000-4000-8000-000000000005', '2026-11-01 08:00+00'),
  ('3a000000-0000-4000-8000-000000000002', 'organizer', '2e000000-0000-4000-8000-000000000001', '2026-11-01 08:00+00'),
  ('3a000000-0000-4000-8000-000000000002', 'artist', '4e000000-0000-4000-8000-000000000001', '2026-11-01 08:00+00');

-- Le public -----------------------------------------------------------------------------------------------

SELECT pg_temp.session();
SELECT pg_temp.verifie('l''index : F1 seul a un programme',
  (SELECT string_agg(DISTINCT right(f.festival_id::text, 2), ' ') FROM public.app_festival_events('2026-11-18 10:00') AS f),
  'f1');

-- L1 : 01, 04, 05, sans F1 ; L2 : 02 (F1 n'est pas sur sa page, qu'il soit un de ses lieux n'y change rien) ;
-- L3 : 03 et 05 qu'il organise ; L4 : F3, sans F2 (un de ses lieux, même sans programme) ; L5 : rien, F4 est dans
-- sa section ; O1 : F2 (pas de programme : un organisateur ne regarde pas les lieux), sans F1.
SELECT pg_temp.verifie('app_organizer_counts : le nombre de chaque page',
  pg_temp.pages(), 'L1=3 L2=1 L3=2 L4=1 L5=0 O1=1');

-- Les lieux et l'organisateur comme leurs pages ; le Fichier, sans rien d'autre, n'est pas proposé ; le tag compte
-- F1 et 01 (sa liste garde la fiche).
SELECT pg_temp.verifie('app_search_names : lieux et organisateur comme leurs pages, le tag inchangé',
  pg_temp.recherche(),
  'location:Zz Astrolabe=2 location:Zz Cent Huit=1 location:Zz Dropkick=3 location:Zz Passerelle=1 '
  || 'organizer:Zz Collectif=1 tag:Zz Jazz=2');

-- « À voir aussi » : le nombre de la page de la source (les rangées ne changent pas).
SELECT pg_temp.verifie('app_see_also : source_events_count, celui de la page',
  pg_temp.source('04') || ' | ' || pg_temp.source('03') || ' | ' || pg_temp.source('f3'),
  'Zz Dropkick=3 | Zz Astrolabe=2 | Zz Passerelle=1');
RESET ROLE;

-- U2 : ses suivis comme les pages ; A1 : 03, sans F1 ----------------------------------------------------

SELECT pg_temp.session('02');
SELECT pg_temp.verifie('app_follows : à venir et nouveaux comme les pages',
  pg_temp.suivis(),
  'artist:A1=1/1 location:L1=3/3 location:L4=1/1 location:L5=0/0 organizer:O1=1/1');
RESET ROLE;

-- U1 a masqué 01 et 02 : pour lui, F1 n'a plus de programme. Il compte pour O1 et A1, pas pour L1 (un de ses lieux).

SELECT pg_temp.session('01');
SELECT pg_temp.verifie('par utilisateur : app_organizer_counts sans programme visible',
  pg_temp.pages(), 'L1=2 L2=0 L3=2 L4=1 L5=0 O1=2');
SELECT pg_temp.verifie('par utilisateur : app_search_names',
  pg_temp.recherche(),
  'location:Zz Astrolabe=2 location:Zz Dropkick=2 location:Zz Passerelle=1 organizer:Zz Collectif=2 tag:Zz Jazz=1');
SELECT pg_temp.verifie('par utilisateur : app_follows',
  pg_temp.suivis(), 'artist:A1=2/2 location:L1=2/2 organizer:O1=2/2');
RESET ROLE;

ROLLBACK;
