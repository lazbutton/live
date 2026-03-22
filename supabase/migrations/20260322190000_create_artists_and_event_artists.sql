CREATE OR REPLACE FUNCTION public.normalize_artist_label(value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    normalized text := lower(trim(coalesce(value, '')));
BEGIN
    normalized := replace(normalized, 'à', 'a');
    normalized := replace(normalized, 'â', 'a');
    normalized := replace(normalized, 'ä', 'a');
    normalized := replace(normalized, 'á', 'a');
    normalized := replace(normalized, 'ã', 'a');
    normalized := replace(normalized, 'ç', 'c');
    normalized := replace(normalized, 'é', 'e');
    normalized := replace(normalized, 'è', 'e');
    normalized := replace(normalized, 'ê', 'e');
    normalized := replace(normalized, 'ë', 'e');
    normalized := replace(normalized, 'î', 'i');
    normalized := replace(normalized, 'ï', 'i');
    normalized := replace(normalized, 'ì', 'i');
    normalized := replace(normalized, 'í', 'i');
    normalized := replace(normalized, 'ô', 'o');
    normalized := replace(normalized, 'ö', 'o');
    normalized := replace(normalized, 'ò', 'o');
    normalized := replace(normalized, 'ó', 'o');
    normalized := replace(normalized, 'õ', 'o');
    normalized := replace(normalized, 'ù', 'u');
    normalized := replace(normalized, 'û', 'u');
    normalized := replace(normalized, 'ü', 'u');
    normalized := replace(normalized, 'ú', 'u');
    normalized := replace(normalized, 'œ', 'oe');
    normalized := replace(normalized, 'æ', 'ae');
    normalized := regexp_replace(normalized, '[^a-z0-9]+', ' ', 'g');
    normalized := regexp_replace(normalized, '\s+', ' ', 'g');
    RETURN trim(normalized);
END;
$$;

CREATE OR REPLACE FUNCTION public.slugify_artist_label(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT replace(public.normalize_artist_label(value), ' ', '-');
$$;

CREATE TABLE IF NOT EXISTS public.artists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    short_description text,
    image_url text,
    website_url text,
    instagram_url text,
    soundcloud_url text,
    deezer_url text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT artists_pkey PRIMARY KEY (id),
    CONSTRAINT artists_slug_key UNIQUE (slug),
    CONSTRAINT artists_name_not_blank CHECK (char_length(trim(name)) > 0),
    CONSTRAINT artists_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.artists IS
'Profils publics des artistes/collaborateurs liés aux événements.';

COMMENT ON COLUMN public.artists.slug IS
'Slug public généré automatiquement à partir du nom de l''artiste.';

COMMENT ON COLUMN public.artists.short_description IS
'Description courte affichée dans l''admin et la page artiste publique.';

CREATE TABLE IF NOT EXISTS public.event_artists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    artist_id uuid NOT NULL,
    sort_index integer DEFAULT 0 NOT NULL,
    role_label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_artists_pkey PRIMARY KEY (id),
    CONSTRAINT event_artists_event_id_artist_id_key UNIQUE (event_id, artist_id),
    CONSTRAINT event_artists_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artists(id) ON DELETE CASCADE,
    CONSTRAINT event_artists_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.event_artists IS
'Liaison N-N entre événements et artistes/collaborateurs.';

COMMENT ON COLUMN public.event_artists.sort_index IS
'Ordre d''affichage des artistes dans les fiches événement.';

COMMENT ON COLUMN public.event_artists.role_label IS
'Libellé libre optionnel pour qualifier un artiste (ex: guest, collectif, DJ set).';

CREATE INDEX IF NOT EXISTS idx_artists_name ON public.artists USING btree (name);
CREATE INDEX IF NOT EXISTS idx_artists_slug ON public.artists USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_event_artists_artist_id ON public.event_artists USING btree (artist_id);
CREATE INDEX IF NOT EXISTS idx_event_artists_event_id ON public.event_artists USING btree (event_id);
CREATE INDEX IF NOT EXISTS idx_event_artists_sort_index ON public.event_artists USING btree (event_id, sort_index, created_at);

CREATE OR REPLACE FUNCTION public.assign_artist_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    base_slug text;
    candidate_slug text;
    suffix integer := 2;
BEGIN
    base_slug := nullif(public.slugify_artist_label(NEW.name), '');
    IF base_slug IS NULL THEN
        base_slug := 'artist';
    END IF;

    candidate_slug := base_slug;

    WHILE EXISTS (
        SELECT 1
        FROM public.artists
        WHERE public.artists.slug = candidate_slug
          AND public.artists.id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) LOOP
        candidate_slug := base_slug || '-' || suffix::text;
        suffix := suffix + 1;
    END LOOP;

    NEW.slug := candidate_slug;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_event_approved_for_public_event_artists(
  target_event_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events
    WHERE public.events.id = target_event_id
      AND public.events.status = 'approved'
  );
$$;

COMMENT ON FUNCTION public.is_event_approved_for_public_event_artists(uuid) IS
'Retourne true si un lien event_artists pointe vers un événement approuvé, sans réévaluer les policies RLS de la requête appelante.';

DROP TRIGGER IF EXISTS update_artists_updated_at ON public.artists;
CREATE TRIGGER update_artists_updated_at
BEFORE UPDATE ON public.artists
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_event_artists_updated_at ON public.event_artists;
CREATE TRIGGER update_event_artists_updated_at
BEFORE UPDATE ON public.event_artists
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS assign_artist_slug_before_write ON public.artists;
CREATE TRIGGER assign_artist_slug_before_write
BEFORE INSERT OR UPDATE OF name ON public.artists
FOR EACH ROW
EXECUTE FUNCTION public.assign_artist_slug();

ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_artists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Artists are viewable by everyone"
  ON public.artists;
DROP POLICY IF EXISTS "Admins can insert artists"
  ON public.artists;
DROP POLICY IF EXISTS "Admins can update artists"
  ON public.artists;
DROP POLICY IF EXISTS "Admins can delete artists"
  ON public.artists;

CREATE POLICY "Artists are viewable by everyone"
  ON public.artists
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert artists"
  ON public.artists
  FOR INSERT
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

CREATE POLICY "Admins can update artists"
  ON public.artists
  FOR UPDATE
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

CREATE POLICY "Admins can delete artists"
  ON public.artists
  FOR DELETE
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

DROP POLICY IF EXISTS "Event artists for approved events are viewable by everyone"
  ON public.event_artists;
DROP POLICY IF EXISTS "Admins can view all event artists"
  ON public.event_artists;
DROP POLICY IF EXISTS "Admins can insert event artists"
  ON public.event_artists;
DROP POLICY IF EXISTS "Admins can update event artists"
  ON public.event_artists;
DROP POLICY IF EXISTS "Admins can delete event artists"
  ON public.event_artists;

CREATE POLICY "Event artists for approved events are viewable by everyone"
  ON public.event_artists
  FOR SELECT
  USING (public.is_event_approved_for_public_event_artists(event_id));

CREATE POLICY "Admins can view all event artists"
  ON public.event_artists
  FOR SELECT
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

CREATE POLICY "Admins can insert event artists"
  ON public.event_artists
  FOR INSERT
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

CREATE POLICY "Admins can update event artists"
  ON public.event_artists
  FOR UPDATE
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true))
  WITH CHECK ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));

CREATE POLICY "Admins can delete event artists"
  ON public.event_artists
  FOR DELETE
  USING ((auth.uid() IS NOT NULL) AND (public.is_user_admin() = true));
