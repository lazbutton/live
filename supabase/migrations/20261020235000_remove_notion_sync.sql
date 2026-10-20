-- Retrait de la synchronisation Notion (décision de l'utilisateur, 2026-10-20 au soir).
--
-- La file notion_sync_jobs ne suivait plus : le cron notion-sync (une fois par jour, 25 tâches) en
-- traitait 25 quand les modifications d'événements, de lieux et d'organisateurs en ajoutaient 70 à 200
-- par jour depuis le 17/10 (532 en attente le 20/10). Plutôt que de la réparer, l'utilisateur retire
-- Notion. Le code part avec cette migration (lib/notion, /api/notion/webhook et bootstrap, cron
-- notion-sync) ; POST /api/notion/resync reste pour les anciennes versions de l'app, sans effet.
--
-- Retirés ici (tout vient de 20260414110000_create_notion_sync_tables.sql) :
-- - les 5 triggers queue_notion_* (events, user_requests, locations, organizers, event_organizers) et
--   leurs fonctions queue_*_sync_job (queue_event_sync_job redéfinie par 20261019190000) ;
-- - enqueue_notion_sync_job et claim_notion_sync_jobs ;
-- - convert_event_request_to_event_service : écrite pour le worker Notion, appelée par personne (le
--   worker convertissait en TypeScript ; l'admin passe par convert_event_request_to_event) ;
-- - les 7 tables notion_* : liens vers les pages Notion (événements, demandes, lieux, organisateurs),
--   file, erreurs, points de reprise ; leurs policies, index et triggers updated_at partent avec elles.
--   Exportées en CSV juste avant l'application en prod (~/Documents/Backups/outlive/notion-2026-10-20/,
--   hors dépôt) : leur contenu n'existe plus ailleurs.
-- cleanup_free_tier_technical_data (20260821122000) ne purge plus la file Notion. Même signature :
-- p_batch_size ne bornait que cette purge et n'a plus d'effet (le cron cleanup ne le passe plus), mais
-- le garder laisse valides les droits posés par 20261020220000, qu'elle passe avant ou après.
--
-- 20261020220000 (droits retirés à anon) cite enqueue/claim et convert_event_request_to_event_service ;
-- elle n'était pas appliquée en prod le 2026-10-20 et ne les touche plus que s'ils existent : les deux
-- migrations passent dans n'importe quel ordre.
--
-- Ordre : triggers avant leurs fonctions, fonctions avant les tables (claim_notion_sync_jobs rend
-- `setof notion_sync_jobs`). Sans CASCADE : si un objet inconnu dépend encore de l'un d'eux, la
-- migration échoue au lieu de le supprimer en silence. Rejouable : IF EXISTS partout.

DROP TRIGGER IF EXISTS queue_notion_event_sync_on_events ON public.events;
DROP TRIGGER IF EXISTS queue_notion_request_sync_on_user_requests ON public.user_requests;
DROP TRIGGER IF EXISTS queue_notion_location_sync_on_locations ON public.locations;
DROP TRIGGER IF EXISTS queue_notion_organizer_sync_on_organizers ON public.organizers;
DROP TRIGGER IF EXISTS queue_notion_event_sync_on_event_organizers ON public.event_organizers;

DROP FUNCTION IF EXISTS public.queue_event_sync_job();
DROP FUNCTION IF EXISTS public.queue_request_sync_job();
DROP FUNCTION IF EXISTS public.queue_location_sync_job();
DROP FUNCTION IF EXISTS public.queue_organizer_sync_job();
DROP FUNCTION IF EXISTS public.queue_event_sync_job_from_relations();

DROP FUNCTION IF EXISTS public.enqueue_notion_sync_job(text, uuid, text, text, text, jsonb, text);
DROP FUNCTION IF EXISTS public.claim_notion_sync_jobs(text, integer);
DROP FUNCTION IF EXISTS public.convert_event_request_to_event_service(uuid, uuid);

-- Définition de 20260821122000 sans les deux purges Notion.
CREATE OR REPLACE FUNCTION public.cleanup_free_tier_technical_data(
  p_batch_size integer DEFAULT 10000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  scan_logs_deleted integer := 0;
  admin_audit_deleted integer := 0;
  organizer_audit_deleted integer := 0;
  notification_logs_deleted integer := 0;
BEGIN
  DELETE FROM public.event_source_scan_logs
  WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS scan_logs_deleted = ROW_COUNT;

  DELETE FROM public.admin_audit_log
  WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS admin_audit_deleted = ROW_COUNT;

  DELETE FROM public.organizer_audit_log
  WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS organizer_audit_deleted = ROW_COUNT;

  DELETE FROM public.notification_logs
  WHERE sent_at < now() - interval '90 days';
  GET DIAGNOSTICS notification_logs_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'scan_logs_deleted', scan_logs_deleted,
    'admin_audit_deleted', admin_audit_deleted,
    'organizer_audit_deleted', organizer_audit_deleted,
    'notification_logs_deleted', notification_logs_deleted
  );
END;
$$;

-- Comme 20261020220000 : service role seulement (le cron cleanup).
REVOKE ALL ON FUNCTION public.cleanup_free_tier_technical_data(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_free_tier_technical_data(integer) TO service_role;

COMMENT ON FUNCTION public.cleanup_free_tier_technical_data(integer) IS
  'Purge des données techniques selon la politique de rétention Supabase Free (journaux de scan, audits, notifications). p_batch_size : sans effet depuis le retrait de Notion (20261020235000).';

-- notion_sync_errors référence notion_sync_jobs : supprimée avant elle.
DROP TABLE IF EXISTS public.notion_sync_errors;
DROP TABLE IF EXISTS public.notion_sync_jobs;
DROP TABLE IF EXISTS public.notion_sync_checkpoints;
DROP TABLE IF EXISTS public.notion_event_links;
DROP TABLE IF EXISTS public.notion_request_links;
DROP TABLE IF EXISTS public.notion_location_links;
DROP TABLE IF EXISTS public.notion_organizer_links;

-- Vérification (lecture seule), aucune ligne attendue :
-- select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname like 'notion%';
-- select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and (p.prosrc ilike '%notion%' or p.proname like 'queue_%sync_job%');
-- select tgrelid::regclass, tgname from pg_trigger where tgname like 'queue_notion_%';

-- Rollback : rejouer 20260414110000 (tables, fonctions, triggers), la définition de
-- queue_event_sync_job() de 20261019190000, celle de cleanup_free_tier_technical_data de 20260821122000,
-- puis les droits de 20261020220000 ; les données reviennent des CSV exportés (liens, file, erreurs).
