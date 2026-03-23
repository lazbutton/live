ALTER TABLE public.artists
ADD COLUMN IF NOT EXISTS artist_type_label text;

COMMENT ON COLUMN public.artists.artist_type_label IS
'Libelle libre affiche sur la fiche publique de l''artiste a la place du badge par defaut "Artiste" (ex: DJ, Groupe, Plasticien, Musicien).';
