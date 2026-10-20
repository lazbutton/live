-- Tests de app_organizer_counts() (migration 20261020140000_create_app_organizer_counts.sql).
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

-- Comptes en texte « nom:sorte=compte », dans l'ordre rendu (le plus fourni d'abord).
CREATE FUNCTION pg_temp.comptes(ids uuid[], villes uuid[] DEFAULT NULL,
  maintenant timestamp DEFAULT '2026-11-06 19:15') RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(
    coalesce(o.name, l.name) || ':' || c.kind || '=' || c.events_count, ' ' ORDER BY c.ordre), '')
  FROM (
    SELECT r.*, row_number() OVER () AS ordre
    FROM public.app_organizer_counts(ids, villes, maintenant) AS r
  ) AS c
  LEFT JOIN public.organizers AS o ON o.id = c.organizer_id
  LEFT JOIN public.locations AS l ON l.id = c.organizer_id
$$;

-- Jeu d'essai --------------------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('3d000000-0000-4000-8000-000000000001', 'u1@test.local');

INSERT INTO public.cities (id, label, label_normalized, slug, is_active) VALUES
  ('0a000000-0000-4000-8000-000000000001', 'Ville A', 'ville a', 'ville-a', true),
  ('0a000000-0000-4000-8000-000000000002', 'Ville B', 'ville b', 'ville-b', true);

-- Théâtre : lieu qui organise aussi ; Salle : simple lieu ; Collectif : organisateur.
INSERT INTO public.locations (id, name, address, is_organizer) VALUES
  ('1a000000-0000-4000-8000-000000000001', 'Zz Théâtre', '1 rue A', true),
  ('1a000000-0000-4000-8000-000000000002', 'Zz Salle', '1 rue B', false);
UPDATE public.locations SET city_id = '0a000000-0000-4000-8000-000000000001'
WHERE id = '1a000000-0000-4000-8000-000000000001';
UPDATE public.locations SET city_id = '0a000000-0000-4000-8000-000000000002'
WHERE id = '1a000000-0000-4000-8000-000000000002';
INSERT INTO public.organizers (id, name) VALUES
  ('5b000000-0000-4000-8000-000000000001', 'Zz Collectif'),
  ('5b000000-0000-4000-8000-000000000002', 'Zz Inactif');

INSERT INTO public.events (id, title, date, end_date, category, location_id, status)
SELECT
  ('e0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  titre,
  debut::timestamp AT TIME ZONE 'UTC',
  fin::timestamp AT TIME ZONE 'UTC',
  'Concert',
  lieu::uuid,
  coalesce(statut, 'approved')
FROM (VALUES
  (1, 'E01 au Théâtre, par le Collectif',        '2026-11-07 20:30', NULL, '1a000000-0000-4000-8000-000000000001', NULL),
  (2, 'E02 à la Salle, par le Théâtre',          '2026-11-08 20:30', NULL, '1a000000-0000-4000-8000-000000000002', NULL),
  (3, 'E03 au Théâtre, par le Théâtre',          '2026-11-09 20:30', NULL, '1a000000-0000-4000-8000-000000000001', NULL),
  (4, 'E04 au Théâtre, passé',                   '2026-11-01 20:30', NULL, '1a000000-0000-4000-8000-000000000001', NULL),
  (5, 'E05 au Théâtre, en attente',              '2026-11-10 20:30', NULL, '1a000000-0000-4000-8000-000000000001', 'pending'),
  (6, 'E06 au Théâtre, expo en cours',           '2026-10-01 10:00', '2026-12-01 18:00', '1a000000-0000-4000-8000-000000000001', NULL),
  (7, 'E07 au Théâtre, masqué par U1',           '2026-11-11 20:30', NULL, '1a000000-0000-4000-8000-000000000001', NULL),
  (8, 'E08 à la Salle, par le Collectif',        '2026-11-12 20:30', NULL, '1a000000-0000-4000-8000-000000000002', NULL),
  (9, 'E09 par le Collectif, passé',             '2026-10-01 20:30', NULL, '1a000000-0000-4000-8000-000000000002', NULL)
) AS v(n, titre, debut, fin, lieu, statut);

INSERT INTO public.event_organizers (event_id, organizer_id, location_id) VALUES
  ('e0000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', NULL),
  ('e0000000-0000-4000-8000-000000000002', NULL, '1a000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000003', NULL, '1a000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000005', '5b000000-0000-4000-8000-000000000001', NULL),
  ('e0000000-0000-4000-8000-000000000008', '5b000000-0000-4000-8000-000000000001', NULL),
  ('e0000000-0000-4000-8000-000000000009', '5b000000-0000-4000-8000-000000000001', NULL);

INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e0000000-0000-4000-8000-000000000007', '3d000000-0000-4000-8000-000000000001');

-- Sans session (clé anon publique) --------------------------------------------------------------

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

-- Théâtre : E01 (s'y tient), E02 (l'organise ailleurs), E03 (les deux, une fois), E06 (expo en
-- cours), E07 ; pas E04 (passé) ni E05 (en attente). Collectif : E01, E08 ; pas E05 ni E09.
-- Salle : E02, E08. Inactif : rien. À égalité, ordre des ids.
SELECT pg_temp.verifie('organisateur, lieu qui organise et accueille, simple lieu, sans événement',
  pg_temp.comptes(ARRAY[
    '5b000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001',
    '1a000000-0000-4000-8000-000000000002', '5b000000-0000-4000-8000-000000000002']::uuid[]),
  'Zz Théâtre:location=5 Zz Salle:location=2 Zz Collectif:organizer=2 Zz Inactif:organizer=0');

SELECT pg_temp.verifie('ids inconnus, nuls, en double ; tableau vide ou nul',
  pg_temp.comptes(ARRAY['5b000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001',
    NULL, '9f000000-0000-4000-8000-000000000000']::uuid[])
  || ' | ' || pg_temp.comptes(ARRAY[]::uuid[]) || ' | ' || pg_temp.comptes(NULL),
  'Zz Collectif:organizer=2 |  | ');

SELECT pg_temp.verifie('périmètre : ville B (la Salle)',
  pg_temp.comptes(ARRAY['1a000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001']::uuid[],
    ARRAY['0a000000-0000-4000-8000-000000000002']::uuid[]),
  'Zz Théâtre:location=1 Zz Collectif:organizer=1');

SELECT pg_temp.verifie('le 2 décembre : plus rien',
  pg_temp.comptes(ARRAY['1a000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001']::uuid[],
    NULL, '2026-12-02 09:00'),
  'Zz Théâtre:location=0 Zz Collectif:organizer=0');

-- Avec la session de U1 : sans E07, qu'il a masqué.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000001"}', true);
SELECT pg_temp.verifie('U1 : Théâtre sans l''événement masqué',
  pg_temp.comptes(ARRAY['1a000000-0000-4000-8000-000000000001']::uuid[]), 'Zz Théâtre:location=4');

RESET ROLE;
ROLLBACK;
