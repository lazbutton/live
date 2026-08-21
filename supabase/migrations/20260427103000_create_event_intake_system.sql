CREATE TABLE IF NOT EXISTS public.event_sources (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'website',
  url text NOT NULL,
  priority text NOT NULL DEFAULT 'p2',
  scan_frequency_days integer NOT NULL DEFAULT 7,
  last_scanned_at timestamp with time zone,
  next_scan_at timestamp with time zone,
  status text NOT NULL DEFAULT 'active',
  reliability_score integer NOT NULL DEFAULT 70,
  novelty_score integer NOT NULL DEFAULT 50,
  average_scan_minutes integer NOT NULL DEFAULT 3,
  category_hint text,
  city_hint text,
  notes text,
  scan_count integer NOT NULL DEFAULT 0,
  discovery_count integer NOT NULL DEFAULT 0,
  last_found_at timestamp with time zone,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_sources_type_check
    CHECK (
      type = ANY (
        ARRAY[
          'instagram'::text,
          'facebook'::text,
          'website'::text,
          'newsletter'::text,
          'ticketing'::text,
          'agenda'::text,
          'other'::text
        ]
      )
    ),
  CONSTRAINT event_sources_priority_check
    CHECK (priority = ANY (ARRAY['p0'::text, 'p1'::text, 'p2'::text, 'p3'::text])),
  CONSTRAINT event_sources_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'dead'::text, 'duplicate'::text])),
  CONSTRAINT event_sources_scan_frequency_positive_check
    CHECK (scan_frequency_days > 0),
  CONSTRAINT event_sources_reliability_score_check
    CHECK (reliability_score >= 0 AND reliability_score <= 100),
  CONSTRAINT event_sources_novelty_score_check
    CHECK (novelty_score >= 0 AND novelty_score <= 100),
  CONSTRAINT event_sources_average_scan_minutes_check
    CHECK (average_scan_minutes > 0)
);

CREATE TABLE IF NOT EXISTS public.event_opportunities (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  source_id uuid REFERENCES public.event_sources(id) ON DELETE SET NULL,
  source_url text,
  raw_title text NOT NULL,
  detected_date timestamp with time zone,
  detected_location text,
  detected_category text,
  missing_fields text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'spotted',
  confidence_score integer NOT NULL DEFAULT 50,
  priority_score integer NOT NULL DEFAULT 50,
  duplicate_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  created_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  decision_reason text,
  notes text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_opportunities_status_check
    CHECK (
      status = ANY (
        ARRAY[
          'spotted'::text,
          'needs_info'::text,
          'ready_to_create'::text,
          'created'::text,
          'published'::text,
          'duplicate'::text,
          'out_of_scope'::text,
          'recheck'::text,
          'archived'::text
        ]
      )
    ),
  CONSTRAINT event_opportunities_confidence_score_check
    CHECK (confidence_score >= 0 AND confidence_score <= 100),
  CONSTRAINT event_opportunities_priority_score_check
    CHECK (priority_score >= 0 AND priority_score <= 100)
);

CREATE INDEX IF NOT EXISTS event_sources_due_idx
  ON public.event_sources(status, next_scan_at, priority);

CREATE INDEX IF NOT EXISTS event_sources_priority_idx
  ON public.event_sources(priority, status);

CREATE INDEX IF NOT EXISTS event_sources_url_idx
  ON public.event_sources(url);

CREATE INDEX IF NOT EXISTS event_opportunities_status_priority_idx
  ON public.event_opportunities(status, priority_score DESC, detected_date);

CREATE INDEX IF NOT EXISTS event_opportunities_source_idx
  ON public.event_opportunities(source_id, status);

CREATE INDEX IF NOT EXISTS event_opportunities_detected_date_idx
  ON public.event_opportunities(detected_date);

CREATE INDEX IF NOT EXISTS event_opportunities_created_event_idx
  ON public.event_opportunities(created_event_id)
  WHERE created_event_id IS NOT NULL;

CREATE TRIGGER update_event_sources_updated_at
  BEFORE UPDATE ON public.event_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_event_opportunities_updated_at
  BEFORE UPDATE ON public.event_opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.event_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage event sources"
  ON public.event_sources
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

CREATE POLICY "Admins can manage event opportunities"
  ON public.event_opportunities
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

COMMENT ON TABLE public.event_sources IS 'Sources opérationnelles à scanner pour alimenter le pipeline événementiel admin.';
COMMENT ON TABLE public.event_opportunities IS 'Événements repérés avant création ou publication dans l’admin.';
COMMENT ON COLUMN public.event_sources.priority IS 'Priorité de veille: p0 quotidien, p1 plusieurs fois par semaine, p2 hebdo, p3 occasionnel.';
COMMENT ON COLUMN public.event_sources.novelty_score IS 'Score 0-100 mesurant la capacité historique de la source à produire de nouveaux événements utiles.';
COMMENT ON COLUMN public.event_opportunities.priority_score IS 'Score 0-100 permettant de trier les événements repérés selon urgence, source, complétude et valeur éditoriale.';
