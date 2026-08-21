ALTER TABLE public.event_source_scan_logs
  ADD COLUMN IF NOT EXISTS session_key text,
  ADD COLUMN IF NOT EXISTS started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS ended_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_source_scan_logs_duration_seconds_check'
  ) THEN
    ALTER TABLE public.event_source_scan_logs
      ADD CONSTRAINT event_source_scan_logs_duration_seconds_check
      CHECK (duration_seconds IS NULL OR duration_seconds >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS event_source_scan_logs_session_key_idx
  ON public.event_source_scan_logs(session_key)
  WHERE session_key IS NOT NULL;

ALTER TABLE public.event_opportunities
  ADD COLUMN IF NOT EXISTS source_scan_log_id uuid REFERENCES public.event_source_scan_logs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS event_opportunities_source_scan_log_idx
  ON public.event_opportunities(source_scan_log_id)
  WHERE source_scan_log_id IS NOT NULL;

COMMENT ON COLUMN public.event_source_scan_logs.session_key IS 'Cle de session de veille pour regrouper les scans dans une meme session.';
COMMENT ON COLUMN public.event_source_scan_logs.started_at IS 'Debut reel du travail sur la source.';
COMMENT ON COLUMN public.event_source_scan_logs.ended_at IS 'Fin reelle du travail sur la source.';
COMMENT ON COLUMN public.event_source_scan_logs.duration_seconds IS 'Temps reel passe sur la source pendant le scan.';
COMMENT ON COLUMN public.event_opportunities.source_scan_log_id IS 'Scan de collecte auquel cette opportunite est rattachee.';
