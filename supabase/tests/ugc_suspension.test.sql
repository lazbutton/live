-- Tests de la suspension UGC dans app_metadata (migration 20261023230000_ugc_suspension_in_app_metadata).
--
-- Sur une base jetable avec toutes les migrations et aucun événement : npm run db:test. Jamais en prod :
-- tout se passe dans une transaction annulée, mais le script s'arrête si la base contient des événements.
--
-- Ce qu'on prouve :
-- - la suspension se lit dans raw_app_meta_data (is_user_safety_suspended / can_use_ugc_features) ;
-- - un trigger retire ugc_suspended* de raw_user_meta_data à chaque écriture (inscription ET mise à jour),
--   si bien qu'un compte suspendu ne peut pas lever sa propre suspension via updateUser (la faille) ;
-- - les autres clés de user_metadata (nom, conditions acceptées) restent intactes.
-- La RLS d'events pour un auteur suspendu est couverte par events_rls.test.sql (u09, suspendu via app_meta).

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events) THEN
    RAISE EXCEPTION 'Base non vide : ces tests se lancent sur une base jetable (npm run db:test), jamais en prod.';
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

-- La session d'un vrai compte (non anonyme) désigné par son id. Toujours suivie de RESET ROLE.
CREATE FUNCTION pg_temp.session(uid text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'role', 'authenticated',
    'sub', uid,
    'is_anonymous', false,
    'app_metadata', json_build_object('provider', 'email')
  )::text, true);
  SET LOCAL ROLE authenticated;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO anon, authenticated;

-- Jeu d'essai : u01 suspendu (via app_metadata, là où l'admin l'écrit), u02 compte ordinaire.
INSERT INTO auth.users (id, email, is_anonymous, raw_user_meta_data, raw_app_meta_data) VALUES
  ('d5a00000-0000-4000-8000-000000000001', 'u01@test.local', false,
    '{"ugc_terms_accepted_version":"2026-03-24-ugc-v1"}'::jsonb,
    '{"provider":"email","ugc_suspended":"true","ugc_suspension_reason":"Spam"}'::jsonb),
  ('d5a00000-0000-4000-8000-000000000002', 'u02@test.local', false,
    '{"full_name":"Camille"}'::jsonb, '{"provider":"email"}'::jsonb);

-- 1. is_user_safety_suspended() / can_use_ugc_features() lisent app_metadata.
SELECT pg_temp.session('d5a00000-0000-4000-8000-000000000001');
SELECT pg_temp.verifie('suspendu : is_user_safety_suspended()', public.is_user_safety_suspended()::text, 'true');
SELECT pg_temp.verifie('suspendu : can_use_ugc_features()', public.can_use_ugc_features()::text, 'false');
RESET ROLE;

SELECT pg_temp.session('d5a00000-0000-4000-8000-000000000002');
SELECT pg_temp.verifie('ordinaire : is_user_safety_suspended()', public.is_user_safety_suspended()::text, 'false');
SELECT pg_temp.verifie('ordinaire : can_use_ugc_features()', public.can_use_ugc_features()::text, 'true');
RESET ROLE;

-- 2. La faille : le compte suspendu lève sa propre suspension via updateUser. GoTrue écrit alors
--    raw_user_meta_data ; le trigger y retire ugc_suspended, quel que soit l'appelant. On simule cette
--    écriture (ici sous le rôle par défaut, comme l'auth-admin de GoTrue).
UPDATE auth.users
SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"ugc_suspended": false}'::jsonb
WHERE id = 'd5a00000-0000-4000-8000-000000000001';

SELECT pg_temp.verifie('attaque : ugc_suspended retiré de user_metadata',
  (SELECT (raw_user_meta_data ? 'ugc_suspended')::text FROM auth.users
   WHERE id = 'd5a00000-0000-4000-8000-000000000001'), 'false');
SELECT pg_temp.verifie('attaque : app_metadata.ugc_suspended intact',
  (SELECT raw_app_meta_data->>'ugc_suspended' FROM auth.users
   WHERE id = 'd5a00000-0000-4000-8000-000000000001'), 'true');
SELECT pg_temp.verifie('attaque : les conditions acceptées restent dans user_metadata',
  (SELECT raw_user_meta_data->>'ugc_terms_accepted_version' FROM auth.users
   WHERE id = 'd5a00000-0000-4000-8000-000000000001'), '2026-03-24-ugc-v1');

-- La suspension tient toujours après la tentative.
SELECT pg_temp.session('d5a00000-0000-4000-8000-000000000001');
SELECT pg_temp.verifie('après l''attaque : toujours suspendu', public.is_user_safety_suspended()::text, 'true');
SELECT pg_temp.verifie('après l''attaque : toujours sans UGC', public.can_use_ugc_features()::text, 'false');
RESET ROLE;

-- 3. À l'inscription aussi : un signup qui pose ugc_suspended dans ses métadonnées le voit retiré,
--    sans toucher à ses autres clés.
INSERT INTO auth.users (id, email, is_anonymous, raw_user_meta_data) VALUES
  ('d5a00000-0000-4000-8000-000000000003', 'u03@test.local', false,
    '{"ugc_suspended": true, "full_name": "Alex"}'::jsonb);

SELECT pg_temp.verifie('inscription : ugc_suspended retiré de user_metadata',
  (SELECT (raw_user_meta_data ? 'ugc_suspended')::text FROM auth.users
   WHERE id = 'd5a00000-0000-4000-8000-000000000003'), 'false');
SELECT pg_temp.verifie('inscription : les autres clés restent',
  (SELECT raw_user_meta_data->>'full_name' FROM auth.users
   WHERE id = 'd5a00000-0000-4000-8000-000000000003'), 'Alex');
SELECT pg_temp.session('d5a00000-0000-4000-8000-000000000003');
SELECT pg_temp.verifie('inscription : ne s''auto-suspend pas', public.is_user_safety_suspended()::text, 'false');
RESET ROLE;

ROLLBACK;
