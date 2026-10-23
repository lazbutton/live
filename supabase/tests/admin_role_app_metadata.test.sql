-- Le rôle admin vit dans raw_app_meta_data (non modifiable par l'utilisateur), plus dans
-- raw_user_meta_data : migration 20261023150000_admin_role_in_app_metadata.sql.
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

-- La session connectée vue par is_user_admin() (via auth.uid()).
CREATE FUNCTION pg_temp.session(compte text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'role', 'authenticated',
    'sub', 'ad000000-0000-4000-8000-0000000000' || compte
  )::text, true);
END $$;

-- Jeu d'essai : un admin (rôle dans app_metadata), un compte ordinaire, et un compte qui tente de poser
-- lui-même le rôle dans user_metadata (ce que fait updateUser côté client).
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES
  ('ad000000-0000-4000-8000-000000000001', 'admin@test.local',   '{"role":"admin"}'::jsonb, '{}'::jsonb),
  ('ad000000-0000-4000-8000-000000000002', 'ordinaire@test.local','{}'::jsonb,               '{}'::jsonb),
  ('ad000000-0000-4000-8000-000000000003', 'pirate@test.local',   '{}'::jsonb,               '{"role":"admin","full_name":"Pirate"}'::jsonb);

-- 1. Le trigger a retiré `role` du user_metadata de « pirate » dès l'INSERT, sans toucher au reste.
SELECT pg_temp.verifie('INSERT : role retiré de user_metadata, full_name gardé',
  (SELECT (raw_user_meta_data ? 'role')::text || ' ' || coalesce(raw_user_meta_data->>'full_name','∅')
   FROM auth.users WHERE id = 'ad000000-0000-4000-8000-000000000003'),
  'false Pirate');

-- 2. is_user_admin() : admin (app_metadata) oui ; ordinaire non ; « pirate » (role seulement tenté dans
--    user_metadata) non.
SELECT pg_temp.session('01'); SELECT pg_temp.verifie('admin (app_metadata) → is_user_admin', (SELECT public.is_user_admin()::text), 'true');
SELECT pg_temp.session('02'); SELECT pg_temp.verifie('compte ordinaire → pas admin', (SELECT public.is_user_admin()::text), 'false');
SELECT pg_temp.session('03'); SELECT pg_temp.verifie('role tenté dans user_metadata → pas admin', (SELECT public.is_user_admin()::text), 'false');

-- 3. L'attaque par UPDATE (updateUser { data: { role: "admin" } }) : le trigger efface la clé.
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role":"admin"}'::jsonb
WHERE id = 'ad000000-0000-4000-8000-000000000002';
SELECT pg_temp.verifie('UPDATE user_metadata role=admin : effacé par le trigger',
  (SELECT (raw_user_meta_data ? 'role')::text FROM auth.users WHERE id = 'ad000000-0000-4000-8000-000000000002'),
  'false');
SELECT pg_temp.session('02');
SELECT pg_temp.verifie('après l''attaque : toujours pas admin', (SELECT public.is_user_admin()::text), 'false');

-- 4. make_user_admin() promeut via app_metadata (usage manuel, SQL Editor).
SELECT pg_temp.verifie('make_user_admin : succès',
  (SELECT public.make_user_admin('ordinaire@test.local')),
  'Succès: L''utilisateur ordinaire@test.local est maintenant admin');
SELECT pg_temp.verifie('make_user_admin écrit app_metadata, pas user_metadata',
  (SELECT (raw_app_meta_data->>'role') || ' ' || (raw_user_meta_data ? 'role')::text
   FROM auth.users WHERE id = 'ad000000-0000-4000-8000-000000000002'),
  'admin false');
SELECT pg_temp.session('02');
SELECT pg_temp.verifie('promu par make_user_admin → is_user_admin', (SELECT public.is_user_admin()::text), 'true');

-- 5. Surface réelle : lecture de app_audience_counts (policy « Admins lisent l'audience de l'app »,
--    USING is_user_admin()). L'admin voit la ligne, le compte ordinaire non.
INSERT INTO public.app_audience_counts (day, metric, count) VALUES (current_date, 'event_opened', 7);

SET LOCAL ROLE authenticated;
SELECT pg_temp.session('01');
SELECT pg_temp.verifie('admin : lit la ligne d''audience', (SELECT count(*)::text FROM public.app_audience_counts), '1');
SELECT pg_temp.session('03');
SELECT pg_temp.verifie('non-admin : aucune ligne d''audience visible', (SELECT count(*)::text FROM public.app_audience_counts), '0');
RESET ROLE;

-- 6. organizer_audit_log : la policy (réécrite via is_user_admin) laisse l'admin lire, pas un tiers.
INSERT INTO public.organizers (id, name) VALUES ('ad000000-0000-4000-8000-0000000000a1', 'Orga audit');
INSERT INTO public.organizer_audit_log (id, organizer_id, action, performed_by) VALUES
  ('ad000000-0000-4000-8000-0000000000b1', 'ad000000-0000-4000-8000-0000000000a1', 'user_added', 'ad000000-0000-4000-8000-000000000001');

SET LOCAL ROLE authenticated;
SELECT pg_temp.session('01');
SELECT pg_temp.verifie('admin : lit le journal d''un organisateur', (SELECT count(*)::text FROM public.organizer_audit_log), '1');
SELECT pg_temp.session('03');
SELECT pg_temp.verifie('tiers (ni admin ni membre) : rien du journal', (SELECT count(*)::text FROM public.organizer_audit_log), '0');
RESET ROLE;

ROLLBACK;
