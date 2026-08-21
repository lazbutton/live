-- Garde-fous de rétention pour rester sous les quotas Supabase Free.
-- La purge est bornée afin de conserver un temps d'exécution prévisible.

CREATE OR REPLACE FUNCTION public.cleanup_free_tier_technical_data(
  p_batch_size integer DEFAULT 10000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  effective_batch_size integer := LEAST(GREATEST(COALESCE(p_batch_size, 10000), 1), 100000);
  notion_jobs_deleted integer := 0;
  notion_errors_deleted integer := 0;
  scan_logs_deleted integer := 0;
  admin_audit_deleted integer := 0;
  organizer_audit_deleted integer := 0;
  notification_logs_deleted integer := 0;
BEGIN
  WITH expired_jobs AS (
    SELECT id
    FROM public.notion_sync_jobs
    WHERE
      (
        status = ANY (ARRAY['completed'::text, 'skipped'::text])
        AND COALESCE(processed_at, updated_at, created_at) < now() - interval '3 days'
      )
      OR (
        status = 'failed'
        AND COALESCE(processed_at, updated_at, created_at) < now() - interval '30 days'
      )
      OR (
        status = 'processing'
        AND COALESCE(locked_at, updated_at, created_at) < now() - interval '1 day'
      )
    ORDER BY COALESCE(processed_at, updated_at, created_at)
    LIMIT effective_batch_size
  )
  DELETE FROM public.notion_sync_jobs jobs
  USING expired_jobs
  WHERE jobs.id = expired_jobs.id;
  GET DIAGNOSTICS notion_jobs_deleted = ROW_COUNT;

  DELETE FROM public.notion_sync_errors
  WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS notion_errors_deleted = ROW_COUNT;

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
    'notion_jobs_deleted', notion_jobs_deleted,
    'notion_errors_deleted', notion_errors_deleted,
    'scan_logs_deleted', scan_logs_deleted,
    'admin_audit_deleted', admin_audit_deleted,
    'organizer_audit_deleted', organizer_audit_deleted,
    'notification_logs_deleted', notification_logs_deleted,
    'has_more_notion_jobs', notion_jobs_deleted = effective_batch_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_free_tier_technical_data(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_free_tier_technical_data(integer) TO service_role;

COMMENT ON FUNCTION public.cleanup_free_tier_technical_data(integer) IS
  'Purge bornée des données techniques selon la politique de rétention Supabase Free.';

ALTER TABLE public.notion_sync_jobs SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01
);
