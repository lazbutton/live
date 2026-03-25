ALTER TABLE public.artists
ADD COLUMN IF NOT EXISTS origin_city text;

COMMENT ON COLUMN public.artists.origin_city IS
'Ville d''origine affichée sur le profil public de l''artiste.';

CREATE INDEX IF NOT EXISTS idx_artists_origin_city
ON public.artists USING btree (origin_city);
