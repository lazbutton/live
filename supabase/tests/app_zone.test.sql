-- Tests de la zone de l'app (migration 20261021220000_create_app_zone.sql) : app_distance_km, app_zone,
-- app_in_zone par app_events_in_range et les fonctions qui la transmettent, app_events_in_zone,
-- app_major_events_in_zone, app_zone_counts, app_cities.
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.
--
-- « Maintenant » est fixé au vendredi 6 novembre 2026, 19:15 (heure de Paris) par `at_time`.
--
-- La carte du jeu d'essai (centre de Centreville en 47,9 ; 1,9) :
--   Z01 lieu au centre de Centreville                 0 km
--   Z02 lieu de Centreville au sud (« La Source »)    6 km, dans la ville
--   Z03 lieu de Voisine                               3 km
--   Z04 lieu de Lointaine                            30 km
--   Z05 lieu de « 45000 Centreville » (même groupe)   5,6 km, dans la ville
--   Z06 lieu de Lointaine, près de Centreville        4 km
--   Z07 sans lieu, ses propres coordonnées            1,7 km
--   Z08 au centre, retiré de l'accueil                0 km
--   Z09 à Voisine, fini le mois dernier (récent)      3 km

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

-- Les événements à venir (à partir du 6 novembre 0 h, sans fin) de la zone, par leur code, triés.
CREATE FUNCTION pg_temp.liste(ville text, km numeric, villes uuid[] DEFAULT NULL) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(split_part(e.title, ' ', 1), ' ' ORDER BY e.title), '')
  FROM public.app_events_in_range(
    '2026-11-06 00:00', NULL, villes, NULL, '2026-11-06 19:15', zone_city => ville, zone_km => km
  ) AS e
$$;

-- Jeu d'essai --------------------------------------------------------------------------------------

INSERT INTO public.cities (id, label, label_normalized, slug, is_active) VALUES
  ('0b000000-0000-4000-8000-000000000001', 'Centreville', 'centreville', 'centreville', true),
  ('0b000000-0000-4000-8000-000000000002', '45000 Centreville', '45000 centreville', '45000-centreville', true),
  ('0b000000-0000-4000-8000-000000000003', 'Voisine', 'voisine', 'voisine', true),
  ('0b000000-0000-4000-8000-000000000004', 'Lointaine', 'lointaine', 'lointaine', true),
  ('0b000000-0000-4000-8000-000000000005', 'Vide', 'vide', 'vide', true),
  ('0b000000-0000-4000-8000-000000000006', 'Sans Centre', 'sans centre', 'sans-centre', true),
  ('0b000000-0000-4000-8000-000000000007', 'Inactive', 'inactive', 'inactive', false);

INSERT INTO public.locations (id, name, address, latitude, longitude) VALUES
  ('1b000000-0000-4000-8000-000000000001', 'Lieu centre', '1 rue A', 47.9, 1.9),
  ('1b000000-0000-4000-8000-000000000002', 'Lieu sud', '1 rue B', 47.846, 1.9),
  ('1b000000-0000-4000-8000-000000000003', 'Lieu voisin', '1 rue C', 47.9, 1.94),
  ('1b000000-0000-4000-8000-000000000004', 'Lieu lointain', '1 rue D', 47.9, 2.3),
  ('1b000000-0000-4000-8000-000000000005', 'Lieu code postal', '1 rue E', 47.95, 1.9),
  ('1b000000-0000-4000-8000-000000000006', 'Lieu frontière', '1 rue F', 47.9, 1.9537),
  ('1b000000-0000-4000-8000-000000000007', 'Lieu sans centre', '1 rue G', NULL, NULL);
-- Les déclencheurs lisent la ville dans l'adresse : les villes et leurs centres sont posés ensuite.
UPDATE public.locations AS l SET city_id = v.city_id::uuid
FROM (VALUES
  ('1b000000-0000-4000-8000-000000000001', '0b000000-0000-4000-8000-000000000001'),
  ('1b000000-0000-4000-8000-000000000002', '0b000000-0000-4000-8000-000000000001'),
  ('1b000000-0000-4000-8000-000000000003', '0b000000-0000-4000-8000-000000000003'),
  ('1b000000-0000-4000-8000-000000000004', '0b000000-0000-4000-8000-000000000004'),
  ('1b000000-0000-4000-8000-000000000005', '0b000000-0000-4000-8000-000000000002'),
  ('1b000000-0000-4000-8000-000000000006', '0b000000-0000-4000-8000-000000000004'),
  ('1b000000-0000-4000-8000-000000000007', '0b000000-0000-4000-8000-000000000006')
) AS v(id, city_id)
WHERE l.id = v.id::uuid;
UPDATE public.cities AS c SET center_lat = v.lat, center_lng = v.lng
FROM (VALUES
  ('0b000000-0000-4000-8000-000000000001', 47.9, 1.9),
  ('0b000000-0000-4000-8000-000000000002', NULL, NULL),
  ('0b000000-0000-4000-8000-000000000003', 47.9, 1.94),
  ('0b000000-0000-4000-8000-000000000004', 47.9, 2.3),
  ('0b000000-0000-4000-8000-000000000005', 47.905, 1.9),
  ('0b000000-0000-4000-8000-000000000006', NULL, NULL),
  ('0b000000-0000-4000-8000-000000000007', 47.9, 1.9)
) AS v(id, lat, lng)
WHERE c.id = v.id::uuid;

INSERT INTO public.categories (id, name, is_active, display_order) VALUES
  ('2d000000-0000-4000-8000-000000000001', 'Zz Zone', true, 93);

INSERT INTO public.events (id, title, date, end_date, category, location_id, status)
SELECT
  ('e1000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  titre,
  debut::timestamp AT TIME ZONE 'UTC',
  fin::timestamp AT TIME ZONE 'UTC',
  '2d000000-0000-4000-8000-000000000001',
  lieu::uuid,
  'approved'
FROM (VALUES
  (1, 'Z01 centre',            '2026-11-07 20:00', NULL, '1b000000-0000-4000-8000-000000000001'),
  (2, 'Z02 sud de la ville',   '2026-11-07 20:00', NULL, '1b000000-0000-4000-8000-000000000002'),
  (3, 'Z03 voisine',           '2026-11-07 20:00', NULL, '1b000000-0000-4000-8000-000000000003'),
  (4, 'Z04 lointaine',         '2026-11-07 20:00', NULL, '1b000000-0000-4000-8000-000000000004'),
  (5, 'Z05 code postal',       '2026-11-07 20:00', NULL, '1b000000-0000-4000-8000-000000000005'),
  (6, 'Z06 frontière',         '2026-11-07 20:00', NULL, '1b000000-0000-4000-8000-000000000006'),
  (7, 'Z07 sans lieu',         '2026-11-07 20:00', NULL, NULL),
  (8, 'Z08 retiré de l''accueil', '2026-11-07 20:00', NULL, '1b000000-0000-4000-8000-000000000001'),
  (9, 'Z09 fini (récent)',     '2026-10-20 20:00', '2026-10-20 22:00', '1b000000-0000-4000-8000-000000000003'),
  (10, 'Z10 sans centre',      '2026-11-07 20:00', NULL, '1b000000-0000-4000-8000-000000000007')
) AS v(n, titre, debut, fin, lieu);

-- Z07 : pas de lieu, ses coordonnées, et la ville de Lointaine (son adresse) ; Z08 hors de l'accueil.
-- (la ville après les coordonnées : le déclencheur la recalcule quand elles changent).
UPDATE public.events SET latitude = 47.915, longitude = 1.9 WHERE id = 'e1000000-0000-4000-8000-000000000007';
UPDATE public.events SET city_id = '0b000000-0000-4000-8000-000000000004'
WHERE id = 'e1000000-0000-4000-8000-000000000007';
UPDATE public.events SET hide_from_home = true WHERE id = 'e1000000-0000-4000-8000-000000000008';

-- Grands événements : l'un rattaché à Lointaine mais avec un lieu au centre, l'autre seulement à Lointaine,
-- le troisième par un de ses événements (Z03, à Voisine).
INSERT INTO public.major_events (id, slug, title, start_at, end_at, status, city_id) VALUES
  ('3b000000-0000-4000-8000-000000000001', 'zz-lieu-centre', 'Zz par un lieu', '2026-11-07', '2026-11-08',
   'approved', '0b000000-0000-4000-8000-000000000004'),
  ('3b000000-0000-4000-8000-000000000002', 'zz-loin', 'Zz loin', '2026-11-07', '2026-11-08',
   'approved', '0b000000-0000-4000-8000-000000000004'),
  ('3b000000-0000-4000-8000-000000000003', 'zz-programme', 'Zz par le programme', '2026-11-07', '2026-11-08',
   'approved', NULL);
UPDATE public.major_events SET city_id = '0b000000-0000-4000-8000-000000000004'
WHERE id IN ('3b000000-0000-4000-8000-000000000001', '3b000000-0000-4000-8000-000000000002');
UPDATE public.major_events SET city_id = NULL WHERE id = '3b000000-0000-4000-8000-000000000003';
INSERT INTO public.major_event_locations (major_event_id, location_id) VALUES
  ('3b000000-0000-4000-8000-000000000001', '1b000000-0000-4000-8000-000000000001');
INSERT INTO public.major_event_events (major_event_id, event_id) VALUES
  ('3b000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000003');

-- Sans session (clé anon publique) --------------------------------------------------------------

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

SELECT pg_temp.verifie('distance : 0,04° de longitude à 47,9° de latitude ≈ 3 km',
  round(public.app_distance_km(47.9, 1.9, 47.9, 1.94)::numeric, 1)::text, '3.0');
SELECT pg_temp.verifie('distance : une coordonnée manque, pas de distance',
  coalesce(public.app_distance_km(47.9, NULL, 47.9, 1.94)::text, 'nulle'), 'nulle');

SELECT pg_temp.verifie('zone par le slug : le groupe, son centre, le rayon',
  (SELECT array_to_string(ARRAY(SELECT unnest(z.city_ids)::text ORDER BY 1), ',') || ' | '
          || z.center_lat || ',' || z.center_lng || ' | ' || z.radius_km
   FROM public.app_zone('centreville', 5) AS z),
  '0b000000-0000-4000-8000-000000000001,0b000000-0000-4000-8000-000000000002 | 47.9,1.9 | 5');
SELECT pg_temp.verifie('zone par l''id d''une ville du groupe, casse et espaces ignorés',
  (SELECT cardinality(z.city_ids)::text FROM public.app_zone(' 0B000000-0000-4000-8000-000000000002 ', 2) AS z),
  '2');
SELECT pg_temp.verifie('zone inconnue, nulle ou inactive : aucune ligne',
  (SELECT count(*) FROM public.app_zone('inconnue', 5))::text || ' '
  || (SELECT count(*) FROM public.app_zone(NULL, 5))::text || ' '
  || (SELECT count(*) FROM public.app_zone('inactive', 5))::text,
  '0 0 0');

-- La règle : la ville (tout son groupe), ou à moins du rayon de son centre.
SELECT pg_temp.verifie('2 km : la ville entière (Z02 à 6 km, Z05 « 45000 »), Z07 par ses coordonnées',
  pg_temp.liste('centreville', 2), 'Z01 Z02 Z05 Z07 Z08');
SELECT pg_temp.verifie('5 km : plus Voisine (3 km) et le lieu de Lointaine à 4 km',
  pg_temp.liste('centreville', 5), 'Z01 Z02 Z03 Z05 Z06 Z07 Z08');
SELECT pg_temp.verifie('50 km : tout ce qui a des coordonnées ou une ville de la zone',
  pg_temp.liste('centreville', 50), 'Z01 Z02 Z03 Z04 Z05 Z06 Z07 Z08');
SELECT pg_temp.verifie('rayon nul : la ville seule',
  pg_temp.liste('centreville', NULL), 'Z01 Z02 Z05 Z08');
SELECT pg_temp.verifie('autre ville : Voisine à 2 km (et le lieu de Lointaine, à 1 km d''elle)',
  pg_temp.liste('voisine', 2), 'Z03 Z06');
SELECT pg_temp.verifie('sans zone, ou une ville inconnue : tout',
  pg_temp.liste(NULL, NULL) || ' | ' || pg_temp.liste('inconnue', 5),
  'Z01 Z02 Z03 Z04 Z05 Z06 Z07 Z08 Z10 | Z01 Z02 Z03 Z04 Z05 Z06 Z07 Z08 Z10');
SELECT pg_temp.verifie('l''ancien périmètre (city_ids) marche toujours, seul ou avec la zone',
  pg_temp.liste(NULL, NULL, ARRAY['0b000000-0000-4000-8000-000000000004']::uuid[]) || ' | '
  || pg_temp.liste('centreville', 5, ARRAY['0b000000-0000-4000-8000-000000000004']::uuid[]),
  'Z04 Z06 Z07 | Z06 Z07');

-- Les fonctions qui transmettent la zone.
SELECT pg_temp.verifie('app_event_counts : la zone, sans Z08 sur « Tout »',
  (SELECT events_count::text FROM public.app_event_counts(
     '[{"start": "2026-11-06T00:00:00"}]'::jsonb, NULL, NULL, '2026-11-06 19:15',
     zone_city => 'centreville', zone_km => 2)),
  '4');
SELECT pg_temp.verifie('app_category_counts : la zone',
  (SELECT events_count::text FROM public.app_category_counts(
     NULL, '2026-11-06 19:15', zone_city => 'centreville', zone_km => 5)
   WHERE category_id = '2d000000-0000-4000-8000-000000000001'),
  '7');
SELECT pg_temp.verifie('app_organizer_counts : la zone (lieu lointain hors de 5 km)',
  (SELECT coalesce(string_agg(events_count::text, ' '), 'aucun') FROM public.app_organizer_counts(
     ARRAY['1b000000-0000-4000-8000-000000000004', '1b000000-0000-4000-8000-000000000003']::uuid[],
     NULL, '2026-11-06 19:15', zone_city => 'centreville', zone_km => 5)
   WHERE organizer_id = '1b000000-0000-4000-8000-000000000003'),
  '1');
SELECT pg_temp.verifie('app_search : « lointaine » (ville de Z04, Z06, Z07), sans zone puis à 5 km',
  (SELECT count(*)::text FROM public.app_search('lointaine', NULL, '2026-11-06 19:15', 10)) || ' '
  || (SELECT count(*)::text FROM public.app_search('lointaine', NULL, '2026-11-06 19:15', 10,
     zone_city => 'centreville', zone_km => 5)),
  '3 2');
SELECT pg_temp.verifie('app_search_names : à 5 km, ni le lieu lointain ni celui sans coordonnées',
  (SELECT string_agg(name || '=' || events_count, ' ' ORDER BY name)
   FROM public.app_search_names('lieu', NULL, '2026-11-06 19:15', 10, zone_city => 'centreville', zone_km => 5)),
  'Lieu Centre=2 Lieu Code Postal=1 Lieu Frontière=1 Lieu Sud=1 Lieu Voisin=1');

-- L'accueil « Toutes les dates » : app_events() dans la zone, toutes dates (Z09 fini compris).
SELECT pg_temp.verifie('app_events_in_zone : 5 km',
  (SELECT string_agg(split_part(e.title, ' ', 1), ' ' ORDER BY e.title)
   FROM public.app_events_in_zone('centreville', 5) AS e),
  'Z01 Z02 Z03 Z05 Z06 Z07 Z08 Z09');
SELECT pg_temp.verifie('app_events_in_zone : sans zone, tout',
  (SELECT count(*)::text FROM public.app_events_in_zone()), '10');

-- Grands événements.
SELECT pg_temp.verifie('grands événements : par un lieu, par le programme ; pas celui de Lointaine seule',
  (SELECT string_agg(m.slug, ' ' ORDER BY m.slug) FROM public.app_major_events_in_zone('centreville', 5) AS m),
  'zz-lieu-centre zz-programme');
SELECT pg_temp.verifie('grands événements : sans zone, tous',
  (SELECT count(*)::text FROM public.app_major_events_in_zone()), '3');

-- L'écran « Ville et rayon ».
SELECT pg_temp.verifie('app_zone_counts : un compte par rayon, dans l''ordre, sans Z08',
  (SELECT string_agg(radius_km || '=' || events_count, ' ')
   FROM public.app_zone_counts('centreville', ARRAY[50, 2, 5]::numeric[], '2026-11-06 19:15')),
  '50=7 2=4 5=6');
SELECT pg_temp.verifie('app_zone_counts : rayons par défaut 5, 10, 25, 50',
  (SELECT string_agg(radius_km::text, ',') FROM public.app_zone_counts('voisine', at_time => '2026-11-06 19:15')),
  '5,10,25,50');

-- Les villes proposées : avec un centre et des événements ; le groupe compté ensemble.
SELECT pg_temp.verifie('app_cities : Centreville (groupe), Lointaine, Voisine ; ni Vide, ni Sans Centre, ni Inactive',
  (SELECT string_agg(c.slug || ':' || c.upcoming_events_count || '/' || c.recent_events_count, ' '
                     ORDER BY c.label)
   FROM public.app_cities('2026-11-06 19:15') AS c
   WHERE c.slug IN ('centreville', 'voisine', 'lointaine', 'vide', 'sans-centre', 'inactive')),
  'centreville:3/0 lointaine:3/0 voisine:1/1');
SELECT pg_temp.verifie('app_cities : sans argument, comme les versions installées de l''app',
  (SELECT count(*) FILTER (WHERE c.slug = 'centreville')::text FROM public.app_cities() AS c),
  '1');

-- Avec une session : ses événements masqués restent écartés --------------------------------------

RESET ROLE;
INSERT INTO auth.users (id, email) VALUES ('3e000000-0000-4000-8000-000000000001', 'zone@test.local');
INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e1000000-0000-4000-8000-000000000001', '3e000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3e000000-0000-4000-8000-000000000001"}', true);
SELECT pg_temp.verifie('session : sans Z01 masqué, dans la liste et les comptes',
  pg_temp.liste('centreville', 2) || ' | '
  || (SELECT events_count::text FROM public.app_zone_counts('centreville', ARRAY[2]::numeric[], '2026-11-06 19:15')),
  'Z02 Z05 Z07 Z08 | 3');

ROLLBACK;
