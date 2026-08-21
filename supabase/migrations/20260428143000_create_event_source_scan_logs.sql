CREATE TABLE IF NOT EXISTS public.event_source_scan_logs (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  source_id uuid NOT NULL REFERENCES public.event_sources(id) ON DELETE CASCADE,
  action text NOT NULL DEFAULT 'scanned',
  scanned_at timestamp with time zone NOT NULL DEFAULT now(),
  previous_next_scan_at timestamp with time zone,
  next_scan_at timestamp with time zone,
  previous_scan_count integer,
  scan_count integer,
  opportunities_found integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_source_scan_logs_action_check
    CHECK (action = ANY (ARRAY['scanned'::text, 'reset_scan'::text, 'status_change'::text])),
  CONSTRAINT event_source_scan_logs_opportunities_found_check
    CHECK (opportunities_found >= 0)
);

CREATE INDEX IF NOT EXISTS event_source_scan_logs_source_scanned_idx
  ON public.event_source_scan_logs(source_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS event_source_scan_logs_scanned_idx
  ON public.event_source_scan_logs(scanned_at DESC);

ALTER TABLE public.event_source_scan_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage event source scan logs"
  ON public.event_source_scan_logs
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

COMMENT ON TABLE public.event_source_scan_logs IS 'Historique operationnel des scans, reinitialisations et changements de statut des sources de collecte.';
COMMENT ON COLUMN public.event_source_scan_logs.action IS 'Action journalisee: scanned, reset_scan ou status_change.';
COMMENT ON COLUMN public.event_source_scan_logs.opportunities_found IS 'Nombre d opportunites rattachees au scan quand il est connu.';
