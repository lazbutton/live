-- ============================================
-- Migration : Configuration scraping des agendas (liste + pagination)
-- Date : 2025-12-14
-- Description :
--   Permet de configurer le scraping des pages "agenda" (liste d'événements)
--   pour les organisateurs et les lieux-organisateurs, avec pagination.
-- ============================================

-- Table : organizer_agenda_scraping_configs
CREATE TABLE IF NOT EXISTS public.organizer_agenda_scraping_configs (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  organizer_id uuid,
  location_id uuid,
  enabled boolean DEFAULT true NOT NULL,
  agenda_url text NOT NULL,
  event_link_selector text NOT NULL,
  event_link_attribute text DEFAULT 'href' NOT NULL,
  next_page_selector text,
  next_page_attribute text DEFAULT 'href' NOT NULL,
  max_pages integer DEFAULT 10 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT organizer_agenda_scraping_configs_pkey PRIMARY KEY (id),
  CONSTRAINT organizer_agenda_scraping_configs_exactly_one_owner
    CHECK (
      ((organizer_id IS NOT NULL) AND (location_id IS NULL))
      OR
      ((organizer_id IS NULL) AND (location_id IS NOT NULL))
    )
);

COMMENT ON TABLE public.organizer_agenda_scraping_configs IS 'Configuration de scraping des agendas (pages liste + pagination) pour organisateurs et lieux-organisateurs.';

-- FKs
DO $$
BEGIN
  ALTER TABLE ONLY public.organizer_agenda_scraping_configs
    ADD CONSTRAINT organizer_agenda_scraping_configs_organizer_id_fkey
    FOREIGN KEY (organizer_id) REFERENCES public.organizers(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE ONLY public.organizer_agenda_scraping_configs
    ADD CONSTRAINT organizer_agenda_scraping_configs_location_id_fkey
    FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_organizer_agenda_scraping_configs_organizer
  ON public.organizer_agenda_scraping_configs USING btree (organizer_id);

CREATE INDEX IF NOT EXISTS idx_organizer_agenda_scraping_configs_location
  ON public.organizer_agenda_scraping_configs USING btree (location_id);

CREATE INDEX IF NOT EXISTS idx_organizer_agenda_scraping_configs_enabled
  ON public.organizer_agenda_scraping_configs USING btree (enabled);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_organizer_agenda_scraping_configs_updated_at ON public.organizer_agenda_scraping_configs;
CREATE TRIGGER update_organizer_agenda_scraping_configs_updated_at
  BEFORE UPDATE ON public.organizer_agenda_scraping_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.organizer_agenda_scraping_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agenda scraping configs are viewable by everyone" ON public.organizer_agenda_scraping_configs;
CREATE POLICY "Agenda scraping configs are viewable by everyone"
  ON public.organizer_agenda_scraping_configs
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated admins can manage agenda scraping configs" ON public.organizer_agenda_scraping_configs;
CREATE POLICY "Authenticated admins can manage agenda scraping configs"
  ON public.organizer_agenda_scraping_configs
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));


