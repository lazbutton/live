ALTER TABLE public.artists
ADD COLUMN IF NOT EXISTS tag_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL;

COMMENT ON COLUMN public.artists.tag_ids IS
'Tags editoriaux associes a l''artiste, relies a la table publique tags.';

CREATE INDEX IF NOT EXISTS idx_artists_tag_ids_gin
ON public.artists
USING gin (tag_ids);
