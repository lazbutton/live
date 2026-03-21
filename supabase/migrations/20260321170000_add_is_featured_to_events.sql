ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.events.is_featured IS
'Permet de mettre en avant un evenement dans les surfaces editoriales publiques.';

CREATE INDEX IF NOT EXISTS idx_events_is_featured
ON public.events USING btree (is_featured)
WHERE (is_featured = true);
