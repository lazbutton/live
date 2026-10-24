-- Table event_notifications supprimée (20261024043000) : plus de table ni de fonction des anciens
-- rappels, la fonction updated_at partagée reste à ses trois tables, un événement et un compte se
-- suppriment sans elle.
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

-- 1. Plus de table ni de fonction des anciens rappels ---------------------------------------------

SELECT pg_temp.verifie('plus de table event_notifications',
  (to_regclass('public.event_notifications') IS NULL)::text, 'true');

SELECT pg_temp.verifie('plus de fonction des anciens rappels',
  (SELECT coalesce(string_agg(p.oid::regprocedure::text, ', '), '') FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proname IN ('calculate_notification_scheduled_at', 'update_event_notifications_updated_at')
          OR p.prosrc ILIKE '%reminder_timing%' OR p.prosrc ILIKE '%notification_scheduled_at%')),
  '');

SELECT pg_temp.verifie('update_notification_preferences_updated_at garde ses trois tables',
  (SELECT string_agg(t.tgrelid::regclass::text, ', ' ORDER BY t.tgrelid::regclass::text) FROM pg_trigger t
   WHERE t.tgfoid = 'public.update_notification_preferences_updated_at()'::regprocedure),
  'notification_settings, user_notification_preferences, user_push_tokens');

-- 2. Un événement et un compte se suppriment sans la table ----------------------------------------

INSERT INTO auth.users (id, email, is_anonymous) VALUES
  ('e7a00000-0000-4000-8000-0000000000f1', 'rappels@test.local', false);
INSERT INTO public.events (id, title, date, category, status) VALUES
  ('e7e00000-0000-4000-8000-0000000000f1', 'Concert test', now() + interval '7 days', 'Concert', 'approved');

DELETE FROM public.events WHERE id = 'e7e00000-0000-4000-8000-0000000000f1';
DELETE FROM auth.users WHERE id = 'e7a00000-0000-4000-8000-0000000000f1';

SELECT pg_temp.verifie('événement et compte supprimés',
  ((SELECT count(*) FROM public.events WHERE id = 'e7e00000-0000-4000-8000-0000000000f1')
   + (SELECT count(*) FROM auth.users WHERE id = 'e7a00000-0000-4000-8000-0000000000f1'))::text,
  '0');

ROLLBACK;
