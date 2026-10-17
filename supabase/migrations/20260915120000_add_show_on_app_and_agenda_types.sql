-- Partner/off-app events: keep them out of the public app feed
-- while remaining available to trusted partner APIs (service role).

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS show_on_app boolean DEFAULT true;

UPDATE public.events
SET show_on_app = true
WHERE show_on_app IS NULL;

ALTER TABLE public.events
ALTER COLUMN show_on_app SET DEFAULT true;

ALTER TABLE public.events
ALTER COLUMN show_on_app SET NOT NULL;

COMMENT ON COLUMN public.events.show_on_app IS
  'If false, event is hidden from the OutLive app and public Events API. Partner feeds (e.g. Radio Campus) can still read it via service role.';

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS agenda_types text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_agenda_types_valid;

ALTER TABLE public.events
ADD CONSTRAINT events_agenda_types_valid CHECK (
  agenda_types <@ ARRAY['evenement', 'emission', 'festival', 'benevolat']::text[]
);

COMMENT ON COLUMN public.events.agenda_types IS
  'Partner agenda labels (Radio Campus): evenement, emission, festival, benevolat. Multiple values allowed.';

CREATE INDEX IF NOT EXISTS idx_events_show_on_app
  ON public.events USING btree (show_on_app)
  WHERE show_on_app = true;

DROP POLICY IF EXISTS "Approved events are viewable by everyone"
  ON public.events;

CREATE POLICY "Approved events are viewable by everyone"
  ON public.events
  FOR SELECT
  USING (
    status = 'approved'::text
    AND COALESCE(is_safety_hidden, false) = false
    AND show_on_app = true
  );
