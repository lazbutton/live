-- Tests de la migration 20261023170000_count_festival_programmes.sql : sur « Tout », la fiche d'un festival qui a
-- un programme (une ligne dans app_festival_events) ne compte pas, ses événements si, chacun à sa date ;
-- app_event_counts (sur « Tout » seulement), app_zone_counts, app_cities (upcoming_events_count).
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.
--
-- « Maintenant » est fixé au jeudi 19 novembre 2026, 18:00 (heure de Paris) par `at_time`. Les événements sont
-- désignés par les deux derniers caractères de leur id : « f1 » à « f7 » pour les fiches de festival, « 01 » à
-- « 08 » pour les autres.
--
-- Le jeu d'essai, dans Feteville (zone de 5 km) sauf mention :
--   F1 du 19 21:00 au 22 04:45, son programme : 01 (le 19, jusqu'au 20 00:45), 02 (le 20), 03 (le 21, à Ailleurs)
--   F2 du 25 au 27, sans programme
--   F3 du 20 10:00 au 21 23:00, son programme : 04 (le 21), masqué par U1
--   F4 du 10 au 30, son programme : 05 (le 12, fini)
--   F5 du 21 10:00 au 22 20:00, son programme : 06 (le 21), retiré de l'accueil
--   F7 du 20 au 21, à Fichecity, son programme : 07 (le 20)
--   08 le 20, hors festival

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

-- La session : anon, ou le compte U1. Toujours suivie de RESET ROLE.
CREATE FUNCTION pg_temp.session(compte text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF compte IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    SET LOCAL ROLE anon;
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object(
      'role', 'authenticated',
      'sub', '3f000000-0000-4000-8000-0000000000' || compte,
      'is_anonymous', false,
      'app_metadata', json_build_object('provider', 'email')
    )::text, true);
    SET LOCAL ROLE authenticated;
  END IF;
END $$;

-- Les comptes du calendrier du 19 au 22 novembre dans la zone de Feteville (5 km) : « j19=2/1 … »
-- (events_count/starting_count), sur « Tout » ou une catégorie.
CREATE FUNCTION pg_temp.jours(categorie text DEFAULT NULL) RETURNS text
LANGUAGE sql AS $$
  SELECT string_agg(c.range_key || '=' || c.events_count || '/' || c.starting_count, ' ' ORDER BY c.range_index)
  FROM public.app_event_counts(
    '[{"key": "j19", "start": "2026-11-19T00:00:00", "end": "2026-11-20T00:00:00"},
      {"key": "j20", "start": "2026-11-20T00:00:00", "end": "2026-11-21T00:00:00"},
      {"key": "j21", "start": "2026-11-21T00:00:00", "end": "2026-11-22T00:00:00"},
      {"key": "j22", "start": "2026-11-22T00:00:00", "end": "2026-11-23T00:00:00"}]'::jsonb,
    NULL, categorie, '2026-11-19 18:00', zone_city => 'zz-feteville', zone_km => 5
  ) AS c
$$;

-- Jeu d'essai ---------------------------------------------------------------------------------------------

INSERT INTO auth.users (id, email, is_anonymous) VALUES
  ('3f000000-0000-4000-8000-000000000001', 'u1@test.local', false);

INSERT INTO public.cities (id, label, label_normalized, slug, is_active) VALUES
  ('0c000000-0000-4000-8000-000000000001', 'Zz Feteville', 'zz feteville', 'zz-feteville', true),
  ('0c000000-0000-4000-8000-000000000002', 'Zz Ailleurs', 'zz ailleurs', 'zz-ailleurs', true),
  ('0c000000-0000-4000-8000-000000000003', 'Zz Fichecity', 'zz fichecity', 'zz-fichecity', true);

INSERT INTO public.locations (id, name, address, latitude, longitude) VALUES
  ('1c000000-0000-4000-8000-000000000001', 'Zz Dropkick', '1 rue A', 47.9, 1.9),
  ('1c000000-0000-4000-8000-000000000002', 'Zz Le 108', '1 rue B', 47.902, 1.91),
  ('1c000000-0000-4000-8000-000000000003', 'Zz Ailleurs Salle', '1 rue C', 47.9, 2.5),
  ('1c000000-0000-4000-8000-000000000004', 'Zz Fiche Salle', '1 rue D', 47.9, 3.2);
-- Les déclencheurs lisent la ville dans l'adresse : les villes et leurs centres sont posés ensuite.
UPDATE public.locations AS l SET city_id = v.city_id::uuid
FROM (VALUES
  ('1c000000-0000-4000-8000-000000000001', '0c000000-0000-4000-8000-000000000001'),
  ('1c000000-0000-4000-8000-000000000002', '0c000000-0000-4000-8000-000000000001'),
  ('1c000000-0000-4000-8000-000000000003', '0c000000-0000-4000-8000-000000000002'),
  ('1c000000-0000-4000-8000-000000000004', '0c000000-0000-4000-8000-000000000003')
) AS v(id, city_id)
WHERE l.id = v.id::uuid;
UPDATE public.cities AS c SET center_lat = v.lat, center_lng = v.lng
FROM (VALUES
  ('0c000000-0000-4000-8000-000000000001', 47.9, 1.9),
  ('0c000000-0000-4000-8000-000000000002', 47.9, 2.5),
  ('0c000000-0000-4000-8000-000000000003', 47.9, 3.2)
) AS v(id, lat, lng)
WHERE c.id = v.id::uuid;

INSERT INTO public.events (id, title, date, end_date, category, location_id, status, hide_from_home)
SELECT
  ('e7000000-0000-4000-8000-0000000000' || v.code)::uuid,
  'Zz ' || v.code,
  v.debut::timestamp AT TIME ZONE 'UTC',
  v.fin::timestamp AT TIME ZONE 'UTC',
  v.categorie,
  ('1c000000-0000-4000-8000-00000000000' || v.lieu)::uuid,
  'approved',
  v.hors_accueil
FROM (VALUES
  ('f1', '2026-11-19 21:00', '2026-11-22 04:45', 'Festival', 1, false),
  ('01', '2026-11-19 21:00', '2026-11-20 00:45', 'DJ Set', 1, false),
  ('02', '2026-11-20 18:00', '2026-11-21 00:00', 'Concert', 2, false),
  ('03', '2026-11-21 20:00', NULL, 'Concert', 3, false),
  ('f2', '2026-11-25 18:00', '2026-11-27 23:00', 'Festival', 2, false),
  ('f3', '2026-11-20 10:00', '2026-11-21 23:00', 'Festival', 2, false),
  ('04', '2026-11-21 15:00', NULL, 'Concert', 2, false),
  ('f4', '2026-11-10 10:00', '2026-11-30 18:00', 'Festival', 1, false),
  ('05', '2026-11-12 20:00', '2026-11-12 22:00', 'Concert', 1, false),
  ('f5', '2026-11-21 10:00', '2026-11-22 20:00', 'Festival', 2, false),
  ('06', '2026-11-21 21:00', NULL, 'Concert', 2, true),
  ('f7', '2026-11-20 10:00', '2026-11-21 20:00', 'Festival', 4, false),
  ('07', '2026-11-20 21:00', NULL, 'Concert', 1, false),
  ('08', '2026-11-20 20:00', NULL, 'Concert', 1, false)
) AS v(code, debut, fin, categorie, lieu, hors_accueil);

UPDATE public.events AS e SET festival_id = ('e7000000-0000-4000-8000-0000000000' || v.festival)::uuid
FROM (VALUES ('01', 'f1'), ('02', 'f1'), ('03', 'f1'), ('04', 'f3'), ('05', 'f4'), ('06', 'f5'), ('07', 'f7'))
  AS v(code, festival)
WHERE e.id = ('e7000000-0000-4000-8000-0000000000' || v.code)::uuid;

INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e7000000-0000-4000-8000-000000000004', '3f000000-0000-4000-8000-000000000001');

-- Les festivals qui ont un programme, pour anon : F1, F3 (04), F5 (06, retiré de l'accueil), F7 ; pas F2 (rien
-- de rattaché), ni F4 (son seul événement est fini).
SELECT pg_temp.session();
SELECT pg_temp.verifie('l''index : F1, F3, F5 et F7 ont un programme',
  (SELECT string_agg(DISTINCT upper(right(f.festival_id::text, 2)), ' ' ORDER BY upper(right(f.festival_id::text, 2)))
   FROM public.app_festival_events('2026-11-19 18:00') AS f),
  'F1 F3 F5 F7');

-- app_event_counts ----------------------------------------------------------------------------------------
-- Sur « Tout » : ni F1, ni F3, ni F5 ; F4 (sans programme à venir) compte chaque jour ; leurs événements à leur
-- date (06 retiré de l'accueil, 03 hors de la zone). Le 19 : 01, F4 (01 commence) ; le 20 : 02, F4, 07, 08 ;
-- le 21 : 04, F4 ; le 22 : F4.
SELECT pg_temp.verifie('sur « Tout », la fiche d''un festival qui a un programme ne compte pas',
  pg_temp.jours(), 'j19=2/1 j20=4/3 j21=2/1 j22=1/0');
-- Sur la page « Festival », les fiches comptent, toutes : F1 du 19 au 22, F3 les 20 et 21, F4, F5 les 21 et 22.
SELECT pg_temp.verifie('page Festival : les fiches comptent',
  pg_temp.jours('Festival'), 'j19=2/1 j20=3/1 j21=4/1 j22=3/0');
-- Une autre catégorie ne change pas (06, retiré de l'accueil, y compte).
SELECT pg_temp.verifie('page Concert : rien ne change',
  pg_temp.jours('Concert'), 'j19=0/0 j20=3/3 j21=2/2 j22=0/0');
RESET ROLE;

-- U1 a masqué 04, le seul événement de F3 : pour lui, F3 n'a pas de programme et compte (le 20, il commence).
SELECT pg_temp.session('01');
SELECT pg_temp.verifie('par utilisateur : un programme tout masqué ne compte pas',
  pg_temp.jours(), 'j19=2/1 j20=5/4 j21=2/0 j22=1/0');
RESET ROLE;

-- app_zone_counts -----------------------------------------------------------------------------------------
-- À venir (depuis le 19 à 0 h) dans la zone, comme sur « Tout » : 01, 02, F2, 04, F4, 07, 08 à 5 km ; 03 en plus
-- à 50 km (Ailleurs, à 45 km) ; F7 (Fichecity, à 97 km) hors des deux.
SELECT pg_temp.session();
SELECT pg_temp.verifie('app_zone_counts : sans les fiches des festivals qui ont un programme',
  (SELECT string_agg(z.radius_km || '=' || z.events_count, ' ')
   FROM public.app_zone_counts('zz-feteville', ARRAY[5, 50]::numeric[], '2026-11-19 18:00') AS z),
  '5=7 50=8');

-- app_cities ----------------------------------------------------------------------------------------------
-- upcoming_events_count comme sur « Tout » : Feteville 7 (sans F1, F3, F5), Ailleurs 1 (03) ; Fichecity n'a que
-- F7 à venir, qui ne compte pas : elle reste dans la liste, à 0. Récents : 05 (le 12) à Feteville.
SELECT pg_temp.verifie('app_cities : à venir comme sur « Tout », la ville d''une fiche seule reste',
  (SELECT string_agg(c.label || '=' || c.upcoming_events_count || '/' || c.recent_events_count, ' ' ORDER BY c.label)
   FROM public.app_cities('2026-11-19 18:00') AS c
   WHERE c.label LIKE 'Zz %'),
  'Zz Ailleurs=1/0 Zz Feteville=7/1 Zz Fichecity=0/0');
RESET ROLE;

ROLLBACK;
