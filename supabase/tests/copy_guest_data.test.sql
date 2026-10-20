-- Tests de copy_guest_data() (migration 20261020200000_create_copy_guest_data.sql).
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

-- Appel de la fonction avec le rôle et la session courants : les lignes ajoutées, ou le code d'erreur.
CREATE FUNCTION pg_temp.copie(session_invitee uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.copy_guest_data(session_invitee);
  RETURN format('favoris +%s, masqués +%s, préférences +%s, catégories +%s',
    r.likes, r.hidden_events, r.notification_preferences, r.notification_categories);
EXCEPTION WHEN OTHERS THEN
  RETURN 'erreur ' || SQLSTATE;
END $$;

-- Données d'un utilisateur, lues sans RLS (rôle postgres) : « favoris E01,E02 | masqués E03 | … ».
CREATE FUNCTION pg_temp.etat(utilisateur uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT 'favoris ' || coalesce((
      SELECT string_agg('E0' || right(l.event_id::text, 1), ',' ORDER BY l.event_id)
      FROM public.event_likes AS l WHERE l.user_id = utilisateur), '-')
    || ' | masqués ' || coalesce((
      SELECT string_agg('E0' || right(h.event_id::text, 1), ',' ORDER BY h.event_id)
      FROM public.user_hidden_events AS h WHERE h.user_id = utilisateur), '-')
    || ' | préférences ' || coalesce((
      SELECT p.frequency || ' ' || p.is_enabled::text || ' ' || coalesce((
        SELECT string_agg('C' || right(x, 1), ',' ORDER BY x) FROM unnest(p.category_ids) AS x), '-')
      FROM public.user_notification_preferences AS p WHERE p.user_id = utilisateur), '-')
    || ' | catégories ' || coalesce((
      SELECT string_agg('C' || right(c.category_id::text, 1), ',' ORDER BY c.category_id)
      FROM public.user_notification_categories AS c WHERE c.user_id = utilisateur), '-')
$$;

CREATE FUNCTION pg_temp.session_de(utilisateur text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"' || utilisateur || '"}', true);
$$;

-- Jeu d'essai --------------------------------------------------------------------------------------
-- G et H : invités (sessions anonymes). A : compte neuf. B : compte qui a déjà ses préférences
-- (résumé quotidien des concerts).

INSERT INTO auth.users (id, email, is_anonymous) VALUES
  ('3d000000-0000-4000-8000-00000000000a', NULL, true),
  ('3d000000-0000-4000-8000-00000000000b', NULL, true),
  ('3d000000-0000-4000-8000-000000000001', 'a@test.local', false),
  ('3d000000-0000-4000-8000-000000000002', 'b@test.local', false);

INSERT INTO auth.sessions (id, user_id) VALUES
  ('5e000000-0000-4000-8000-00000000000a', '3d000000-0000-4000-8000-00000000000a'),
  ('5e000000-0000-4000-8000-00000000000b', '3d000000-0000-4000-8000-00000000000b'),
  ('5e000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-000000000001');

INSERT INTO public.events (id, title, date, category, status)
SELECT
  ('e0000000-0000-4000-8000-00000000000' || n)::uuid,
  'E0' || n,
  '2026-11-07 20:30'::timestamp AT TIME ZONE 'UTC',
  'Concert',
  'approved'
FROM generate_series(1, 4) AS n;

INSERT INTO public.categories (id, name, is_active, display_order) VALUES
  ('ca000000-0000-4000-8000-000000000001', 'Zz Concert', true, 1),
  ('ca000000-0000-4000-8000-000000000002', 'Zz Théâtre', true, 2);

-- G : favoris E01 et E02, masqué E03, résumé hebdomadaire du théâtre seulement.
INSERT INTO public.event_likes (event_id, user_id) VALUES
  ('e0000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-00000000000a'),
  ('e0000000-0000-4000-8000-000000000002', '3d000000-0000-4000-8000-00000000000a'),
  ('e0000000-0000-4000-8000-000000000002', '3d000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000004', '3d000000-0000-4000-8000-00000000000b');
INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e0000000-0000-4000-8000-000000000003', '3d000000-0000-4000-8000-00000000000a');
INSERT INTO public.user_notification_preferences (user_id, frequency, is_enabled, category_ids) VALUES
  ('3d000000-0000-4000-8000-00000000000a', 'weekly', true, ARRAY['ca000000-0000-4000-8000-000000000002']),
  ('3d000000-0000-4000-8000-000000000002', 'daily', true, ARRAY['ca000000-0000-4000-8000-000000000001']);
INSERT INTO public.user_notification_categories (user_id, category_id) VALUES
  ('3d000000-0000-4000-8000-00000000000a', 'ca000000-0000-4000-8000-000000000002'),
  ('3d000000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-000000000001');

SELECT pg_temp.verifie('exécutable par authenticated, pas par anon ni public',
  has_function_privilege('authenticated', 'public.copy_guest_data(uuid)', 'execute')::text || ' '
  || has_function_privilege('anon', 'public.copy_guest_data(uuid)', 'execute')::text || ' '
  || (SELECT coalesce(bool_or(a.grantee = 0), false)::text
      FROM pg_proc AS p, aclexplode(p.proacl) AS a
      WHERE p.oid = 'public.copy_guest_data(uuid)'::regprocedure),
  'true false false');

-- Le constat : le compte ne lit pas les lignes de l'invité (policies « chacun les siennes »).
SET LOCAL ROLE authenticated;
SELECT pg_temp.session_de('3d000000-0000-4000-8000-000000000001');
SELECT pg_temp.verifie('sans la fonction, le compte ne lit ni masqués ni préférences de l''invité',
  (SELECT count(*) FROM public.user_hidden_events
    WHERE user_id = '3d000000-0000-4000-8000-00000000000a')::text || ' '
  || (SELECT count(*) FROM public.user_notification_preferences
    WHERE user_id = '3d000000-0000-4000-8000-00000000000a')::text || ' '
  || (SELECT count(*) FROM public.user_notification_categories
    WHERE user_id = '3d000000-0000-4000-8000-00000000000a')::text,
  '0 0 0');

-- Compte neuf ----------------------------------------------------------------------------------------

SELECT pg_temp.verifie('compte neuf : tout passe, sans doublon (E02 déjà en favori)',
  pg_temp.copie('5e000000-0000-4000-8000-00000000000a'),
  'favoris +1, masqués +1, préférences +1, catégories +1');
SELECT pg_temp.verifie('rejouer l''appel n''ajoute rien',
  pg_temp.copie('5e000000-0000-4000-8000-00000000000a'),
  'favoris +0, masqués +0, préférences +0, catégories +0');

RESET ROLE;
SELECT pg_temp.verifie('compte neuf : les données de l''invité',
  pg_temp.etat('3d000000-0000-4000-8000-000000000001'),
  'favoris E01,E02 | masqués E03 | préférences weekly true C2 | catégories C2');
SELECT pg_temp.verifie('l''invité garde les siennes',
  pg_temp.etat('3d000000-0000-4000-8000-00000000000a'),
  'favoris E01,E02 | masqués E03 | préférences weekly true C2 | catégories C2');

-- Compte qui a déjà ses préférences --------------------------------------------------------------

SET LOCAL ROLE authenticated;
SELECT pg_temp.session_de('3d000000-0000-4000-8000-000000000002');
SELECT pg_temp.verifie('compte existant : favoris et masqués ajoutés, ses préférences gardées',
  pg_temp.copie('5e000000-0000-4000-8000-00000000000a'),
  'favoris +2, masqués +1, préférences +0, catégories +0');
RESET ROLE;
SELECT pg_temp.verifie('compte existant : ses préférences et ses catégories inchangées',
  pg_temp.etat('3d000000-0000-4000-8000-000000000002'),
  'favoris E01,E02 | masqués E03 | préférences daily true C1 | catégories C1');

-- Refus --------------------------------------------------------------------------------------------

SET LOCAL ROLE authenticated;
SELECT pg_temp.session_de('3d000000-0000-4000-8000-00000000000b');
SELECT pg_temp.verifie('un invité ne recopie pas un autre invité',
  pg_temp.copie('5e000000-0000-4000-8000-00000000000a'), 'erreur 42501');

SELECT pg_temp.session_de('3d000000-0000-4000-8000-000000000002');
SELECT pg_temp.verifie('source : la session d''un compte, inconnue, nulle',
  pg_temp.copie('5e000000-0000-4000-8000-000000000001') || ' | '
  || pg_temp.copie('5e000000-0000-4000-8000-0000000000ff') || ' | ' || pg_temp.copie(NULL),
  'erreur 42501 | erreur 42501 | erreur 42501');

-- L'id de l'invité ne remplace pas l'id de sa session.
SELECT pg_temp.verifie('l''id de l''utilisateur invité n''est pas une preuve',
  pg_temp.copie('3d000000-0000-4000-8000-00000000000b'), 'erreur 42501');

SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT pg_temp.verifie('authenticated sans utilisateur',
  pg_temp.copie('5e000000-0000-4000-8000-00000000000b'), 'erreur 42501');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT pg_temp.verifie('anon : refusé',
  pg_temp.copie('5e000000-0000-4000-8000-00000000000b'), 'erreur 42501');

RESET ROLE;
SELECT pg_temp.verifie('après les refus, rien n''a bougé (H, A, B)',
  pg_temp.etat('3d000000-0000-4000-8000-00000000000b') || ' || '
  || pg_temp.etat('3d000000-0000-4000-8000-000000000001') || ' || '
  || pg_temp.etat('3d000000-0000-4000-8000-000000000002'),
  'favoris E04 | masqués - | préférences - | catégories - || '
  || 'favoris E01,E02 | masqués E03 | préférences weekly true C2 | catégories C2 || '
  || 'favoris E01,E02 | masqués E03 | préférences daily true C1 | catégories C1');

ROLLBACK;
