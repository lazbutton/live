-- Tests de event_like_counts() et de la policy SELECT de event_likes (migrations
-- 20261020180000_create_event_like_counts.sql et 20261020181000_restrict_event_likes_select.sql).
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.

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

-- Comptes en texte « E0n=compte », par id (sans lire events : sa RLS cacherait des lignes).
CREATE FUNCTION pg_temp.comptes(ids uuid[]) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg('E0' || right(c.event_id::text, 1) || '=' || c.likes_count, ' '
    ORDER BY c.event_id), '')
  FROM public.event_like_counts(ids) AS c
$$;

-- Lignes de event_likes visibles par le rôle courant, « E0n:utilisateur ».
CREATE FUNCTION pg_temp.lignes_visibles() RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg('E0' || right(l.event_id::text, 1) || ':' || right(l.user_id::text, 1), ' '
    ORDER BY l.event_id, l.user_id), '')
  FROM public.event_likes AS l
$$;

-- Jeu d'essai --------------------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('3d000000-0000-4000-8000-000000000001', 'u1@test.local'),
  ('3d000000-0000-4000-8000-000000000002', 'u2@test.local'),
  ('3d000000-0000-4000-8000-000000000003', 'u3@test.local');

-- E05 et E06 sont des contributions de U1.
INSERT INTO public.events (id, title, date, category, status, show_on_app, archived, created_by)
SELECT
  ('e0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  titre,
  '2026-11-07 20:30'::timestamp AT TIME ZONE 'UTC',
  'Concert',
  statut,
  dans_app,
  archive,
  auteur::uuid
FROM (VALUES
  (1, 'E01 publié, trois favoris',          'approved', true,  false, NULL),
  (2, 'E02 publié, sans favori',            'approved', true,  false, NULL),
  (3, 'E03 en attente, d''un autre',        'pending',  true,  false, NULL),
  (4, 'E04 retiré de l''app, d''un autre',  'approved', false, false, NULL),
  (5, 'E05 de U1, en attente',              'pending',  true,  false, '3d000000-0000-4000-8000-000000000001'),
  (6, 'E06 de U1, archivé',                 'approved', true,  true,  '3d000000-0000-4000-8000-000000000001')
) AS v(n, titre, statut, dans_app, archive, auteur);

INSERT INTO public.event_likes (event_id, user_id) VALUES
  ('e0000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-000000000003'),
  ('e0000000-0000-4000-8000-000000000003', '3d000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000004', '3d000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000005', '3d000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000005', '3d000000-0000-4000-8000-000000000003'),
  ('e0000000-0000-4000-8000-000000000006', '3d000000-0000-4000-8000-000000000003');

SELECT pg_temp.verifie('exécutable par anon et authenticated, pas par public',
  has_function_privilege('anon', 'public.event_like_counts(uuid[])', 'execute')::text || ' '
  || has_function_privilege('authenticated', 'public.event_like_counts(uuid[])', 'execute')::text || ' '
  || (SELECT coalesce(bool_or(a.grantee = 0), false)::text
      FROM pg_proc AS p, aclexplode(p.proacl) AS a
      WHERE p.oid = 'public.event_like_counts(uuid[])'::regprocedure),
  'true true false');

-- Sans session (clé anon publique) --------------------------------------------------------------

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

SELECT pg_temp.verifie('anon : événements publiés seulement, 0 compris',
  pg_temp.comptes(ARRAY[
    'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002',
    'e0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000004',
    'e0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000006']::uuid[]),
  'E01=3 E02=0');

SELECT pg_temp.verifie('ids inconnus, nuls, en double ; tableau vide ou nul',
  pg_temp.comptes(ARRAY['e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
    NULL, '9f000000-0000-4000-8000-000000000000']::uuid[])
  || ' | ' || pg_temp.comptes(ARRAY[]::uuid[]) || ' | ' || pg_temp.comptes(NULL),
  'E01=3 |  | ');

SELECT pg_temp.verifie('anon : aucune ligne de event_likes', pg_temp.lignes_visibles(), '');

-- Avec la session de U1 (auteur de E05 et E06) ----------------------------------------------------

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000001"}', true);

SELECT pg_temp.verifie('U1 : publiés et ses contributions, même en attente ou archivées',
  pg_temp.comptes(ARRAY[
    'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002',
    'e0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000004',
    'e0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000006']::uuid[]),
  'E01=3 E02=0 E05=2 E06=1');

SELECT pg_temp.verifie('U1 : ses lignes seulement', pg_temp.lignes_visibles(), 'E01:1');

-- Avec la session de U2 : ni les contributions de U1, ni les lignes des autres.
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000002"}', true);

SELECT pg_temp.verifie('U2 : pas les contributions de U1',
  pg_temp.comptes(ARRAY[
    'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000005',
    'e0000000-0000-4000-8000-000000000006']::uuid[]),
  'E01=3');

SELECT pg_temp.verifie('U2 : ses lignes seulement', pg_temp.lignes_visibles(), 'E01:2 E03:2 E04:2 E05:2');

-- Ses favoris s'ajoutent et se retirent toujours.
DELETE FROM public.event_likes WHERE event_id = 'e0000000-0000-4000-8000-000000000001';
INSERT INTO public.event_likes (event_id, user_id)
VALUES ('e0000000-0000-4000-8000-000000000002', '3d000000-0000-4000-8000-000000000002');
SELECT pg_temp.verifie('U2 : retire un favori, en ajoute un ; ceux des autres restent',
  pg_temp.lignes_visibles() || ' | ' || pg_temp.comptes(ARRAY[
    'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002']::uuid[]),
  'E02:2 E03:2 E04:2 E05:2 | E01=2 E02=1');

RESET ROLE;
ROLLBACK;
