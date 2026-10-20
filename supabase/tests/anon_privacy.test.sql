-- U39 — ce que la clé publique laisse appeler/lire après 20261020220000.
-- Base jetable avec toutes les migrations, aucun événement : scripts/db-test.sh. Jamais en prod.

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

-- anon ne peut pas exécuter la fonction (droit EXECUTE), « t »/« f » par fonction.
CREATE FUNCTION pg_temp.anon_execute(sig text) RETURNS text
LANGUAGE sql AS $$ SELECT has_function_privilege('anon', sig, 'execute')::text $$;

-- Jeu d'essai --------------------------------------------------------------------------------------

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('3d000000-0000-4000-8000-000000000001', 'proprio@test.local', '{}'::jsonb),      -- propriétaire d'organisateur
  ('3d000000-0000-4000-8000-000000000002', 'invite@test.local',  '{}'::jsonb),      -- utilisateur invité
  ('3d000000-0000-4000-8000-000000000003', 'quidam@test.local',  '{}'::jsonb),      -- utilisateur sans lien
  ('3d000000-0000-4000-8000-000000000009', 'admin@test.local',   '{"role":"admin"}'::jsonb);

INSERT INTO public.organizers (id, name) VALUES
  ('02000000-0000-4000-8000-000000000001', 'Organisateur test');

INSERT INTO public.user_organizers (user_id, organizer_id, role) VALUES
  ('3d000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001', 'owner');

-- Invitation adressée à invite@test.local.
INSERT INTO public.organizer_invitations (id, organizer_id, email, role, token, expires_at, invited_by) VALUES
  ('17000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001', 'invite@test.local',
   'editor', '7c000000-0000-4000-8000-0000000000aa', now() + interval '7 days',
   '3d000000-0000-4000-8000-000000000009');

-- 1. Droits EXECUTE retirés à anon ----------------------------------------------------------------

SELECT pg_temp.verifie('anon ne peut plus appeler les fonctions sensibles',
  pg_temp.anon_execute('public.make_user_admin(text)') || ' '
  || pg_temp.anon_execute('public.get_user_emails(uuid[])') || ' '
  || pg_temp.anon_execute('public.get_or_create_user_by_email(text)') || ' '
  || pg_temp.anon_execute('public.get_invitation_by_token(uuid)') || ' '
  || pg_temp.anon_execute('public.check_rls_policies()') || ' '
  || pg_temp.anon_execute('public.convert_event_request_to_event_service(uuid,uuid)') || ' '
  || pg_temp.anon_execute('public.cleanup_free_tier_technical_data(integer)') || ' '
  || pg_temp.anon_execute('public.upsert_city(text,numeric,numeric)') || ' '
  || pg_temp.anon_execute('public.accept_organizer_invitation(uuid,uuid)'),
  'false false false false false false false false false');

-- Les fonctions app_* et event_like_counts restent exécutables par anon (l'app en dépend).
SELECT pg_temp.verifie('anon garde app_events / event_like_counts',
  pg_temp.anon_execute('public.app_events()') || ' '
  || pg_temp.anon_execute('public.event_like_counts(uuid[])'),
  'true true');

-- 2. get_user_emails : admin ou propriétaire d'organisateur seulement -----------------------------

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000003","email":"quidam@test.local"}', true);
SELECT pg_temp.verifie('get_user_emails : simple utilisateur → aucune ligne',
  (SELECT count(*)::text FROM public.get_user_emails(ARRAY['3d000000-0000-4000-8000-000000000002']::uuid[])),
  '0');

SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000001","email":"proprio@test.local"}', true);
SELECT pg_temp.verifie('get_user_emails : propriétaire d''organisateur → résout',
  (SELECT count(*)::text FROM public.get_user_emails(ARRAY['3d000000-0000-4000-8000-000000000002']::uuid[])),
  '1');

SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000009","email":"admin@test.local"}', true);
SELECT pg_temp.verifie('get_user_emails : admin → résout',
  (SELECT count(*)::text FROM public.get_user_emails(ARRAY['3d000000-0000-4000-8000-000000000002']::uuid[])),
  '1');

-- 3. organizer_invitations : plus de lecture publique ---------------------------------------------

CREATE FUNCTION pg_temp.invitations_visibles() RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(id::text, 2), ' ' ORDER BY id), '')
  FROM public.organizer_invitations
$$;

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT pg_temp.verifie('anon : aucune invitation', pg_temp.invitations_visibles(), '');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000003","email":"quidam@test.local"}', true);
SELECT pg_temp.verifie('utilisateur sans lien : aucune invitation', pg_temp.invitations_visibles(), '');

SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000002","email":"invite@test.local"}', true);
SELECT pg_temp.verifie('invité : voit son invitation', pg_temp.invitations_visibles(), '01');

SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000001","email":"proprio@test.local"}', true);
SELECT pg_temp.verifie('propriétaire : voit l''invitation de son organisateur', pg_temp.invitations_visibles(), '01');

-- 4. accept_organizer_invitation : on ne lie que soi-même -----------------------------------------

SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000002","email":"invite@test.local"}', true);

-- Lier quelqu'un d'autre : refusé.
SELECT pg_temp.verifie('accept : user_id_param ≠ auth.uid() refusé',
  (public.accept_organizer_invitation(
    '7c000000-0000-4000-8000-0000000000aa',
    '3d000000-0000-4000-8000-000000000003'))->>'success',
  'false');

-- Se lier soi-même : accepté.
SELECT pg_temp.verifie('accept : se lier soi-même accepté',
  (public.accept_organizer_invitation(
    '7c000000-0000-4000-8000-0000000000aa',
    '3d000000-0000-4000-8000-000000000002'))->>'success',
  'true');

SELECT pg_temp.verifie('accept : la liaison existe',
  (SELECT count(*)::text FROM public.user_organizers
   WHERE user_id = '3d000000-0000-4000-8000-000000000002'
     AND organizer_id = '02000000-0000-4000-8000-000000000001'),
  '1');

RESET ROLE;
ROLLBACK;
