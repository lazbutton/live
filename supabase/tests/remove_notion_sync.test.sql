-- Synchro Notion retirée (20261020235000) : plus aucun objet Notion, les tables qui mettaient une tâche
-- en file s'écrivent sans elle, la purge technique tourne sans la file.
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

-- 1. Plus aucun objet Notion ----------------------------------------------------------------------

SELECT pg_temp.verifie('aucune table notion_*',
  (SELECT coalesce(string_agg(c.relname, ', '), '') FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname LIKE 'notion%'),
  '');

SELECT pg_temp.verifie('aucune fonction qui parle de Notion ou met une synchro en file',
  (SELECT coalesce(string_agg(p.oid::regprocedure::text, ', '), '') FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.prosrc ILIKE '%notion%' OR p.proname LIKE 'queue_%sync_job%'
          OR p.proname = 'convert_event_request_to_event_service')),
  '');

SELECT pg_temp.verifie('aucun trigger queue_notion_*',
  (SELECT count(*)::text FROM pg_trigger WHERE tgname LIKE 'queue_notion_%'),
  '0');

-- 2. Écritures sur les tables qui avaient un trigger Notion ---------------------------------------

INSERT INTO public.locations (id, name, address) VALUES
  ('1a000000-0000-4000-8000-0000000000f1', 'Lieu test', '1 rue A');
INSERT INTO public.organizers (id, name) VALUES
  ('5b000000-0000-4000-8000-0000000000f1', 'Organisateur test');
INSERT INTO public.events (id, title, date, category, status, location_id) VALUES
  ('e0000000-0000-4000-8000-0000000000f1', 'Concert test', now() + interval '7 days', 'Concert', 'approved',
   '1a000000-0000-4000-8000-0000000000f1');
INSERT INTO public.event_organizers (event_id, organizer_id) VALUES
  ('e0000000-0000-4000-8000-0000000000f1', '5b000000-0000-4000-8000-0000000000f1');
INSERT INTO public.user_requests (id, request_type, source_url, status) VALUES
  ('d0000000-0000-4000-8000-0000000000f1', 'event_from_url', 'https://exemple.test/agenda', 'pending');

UPDATE public.locations SET address = '2 rue A' WHERE id = '1a000000-0000-4000-8000-0000000000f1';
UPDATE public.organizers SET name = 'Organisateur renommé' WHERE id = '5b000000-0000-4000-8000-0000000000f1';
UPDATE public.events SET title = 'Concert renommé', archived = true WHERE id = 'e0000000-0000-4000-8000-0000000000f1';
UPDATE public.user_requests SET status = 'rejected' WHERE id = 'd0000000-0000-4000-8000-0000000000f1';

DELETE FROM public.event_organizers WHERE event_id = 'e0000000-0000-4000-8000-0000000000f1';
DELETE FROM public.events WHERE id = 'e0000000-0000-4000-8000-0000000000f1';
DELETE FROM public.user_requests WHERE id = 'd0000000-0000-4000-8000-0000000000f1';
DELETE FROM public.organizers WHERE id = '5b000000-0000-4000-8000-0000000000f1';
DELETE FROM public.locations WHERE id = '1a000000-0000-4000-8000-0000000000f1';

SELECT pg_temp.verifie('insertion, mise à jour et suppression sans synchro (5 tables)',
  (SELECT count(*)::text FROM public.events WHERE id = 'e0000000-0000-4000-8000-0000000000f1'),
  '0');

-- 3. Purge technique ------------------------------------------------------------------------------

INSERT INTO public.admin_audit_log (action, entity_type, created_at) VALUES
  ('test.ancien', 'event', now() - interval '200 days'),
  ('test.recent', 'event', now() - interval '10 days');

SELECT pg_temp.verifie('cleanup_free_tier_technical_data : clés rendues, audit de plus de 180 jours purgé',
  (SELECT string_agg(k, ' ' ORDER BY k) || ' / ' || (r ->> 'admin_audit_deleted')
   FROM (SELECT public.cleanup_free_tier_technical_data(10000) AS r) AS appel,
        LATERAL jsonb_object_keys(r) AS k
   GROUP BY r),
  'admin_audit_deleted notification_logs_deleted organizer_audit_deleted scan_logs_deleted / 1');

SELECT pg_temp.verifie('audit récent gardé',
  (SELECT string_agg(action, ' ') FROM public.admin_audit_log WHERE action LIKE 'test.%'),
  'test.recent');

SELECT pg_temp.verifie('purge réservée au service role',
  has_function_privilege('anon', 'public.cleanup_free_tier_technical_data(integer)', 'execute')::text || ' '
  || has_function_privilege('authenticated', 'public.cleanup_free_tier_technical_data(integer)', 'execute')::text || ' '
  || has_function_privilege('service_role', 'public.cleanup_free_tier_technical_data(integer)', 'execute')::text,
  'false false true');

ROLLBACK;
