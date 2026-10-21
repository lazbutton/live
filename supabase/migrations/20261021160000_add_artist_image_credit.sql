-- ============================================
-- Migration : crédit et licence des photos d'artistes
-- Date : 2026-10-21
-- Description : U33 de ../live/docs/AMELIORATIONS.md. Les photos d'artistes viennent de Wikimedia Commons,
--   sous licence libre seulement (CC BY, CC BY-SA, CC0, domaine public) : leur auteur et leur licence
--   s'affichent avec elles. Mode d'emploi : docs/ARTIST_PHOTOS.md.
-- ============================================

-- ============================================
-- CHANGEMENTS
-- ============================================

-- - artists : image_credit (auteur, à afficher avec la photo), image_license (« CC BY-SA 4.0 », « CC0 »,
--   « Domaine public »), image_source_url (page du fichier sur Commons, le lien du crédit). Les trois à
--   null pour une photo sans crédit à afficher (envoyée par l'artiste ou l'admin).
-- - Trigger artists_reset_image_credit : quand image_url change sans que le crédit change dans la même
--   écriture (photo remplacée ou retirée dans l'admin), le crédit repart à null. Un crédit ne reste donc
--   jamais accroché à une autre photo que la sienne.
-- - Contrainte artists_image_credit_check : pas de crédit sans photo.
--
-- L'app lit artists en direct (select) : ces colonnes s'ajoutent à son select, sans autre changement.

-- ============================================
-- CODE SQL
-- ============================================

ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS image_credit text,
  ADD COLUMN IF NOT EXISTS image_license text,
  ADD COLUMN IF NOT EXISTS image_source_url text;

COMMENT ON COLUMN public.artists.image_credit IS
  'Auteur de image_url, à afficher avec elle (photo sous licence libre). Null : rien à afficher.';
COMMENT ON COLUMN public.artists.image_license IS
  'Licence de image_url (« CC BY-SA 4.0 », « CC0 », « Domaine public »), à afficher avec le crédit.';
COMMENT ON COLUMN public.artists.image_source_url IS
  'Page d''origine de image_url (fichier Wikimedia Commons), lien du crédit.';

ALTER TABLE public.artists
  DROP CONSTRAINT IF EXISTS artists_image_credit_check,
  ADD CONSTRAINT artists_image_credit_check CHECK (
    image_url IS NOT NULL
    OR (image_credit IS NULL AND image_license IS NULL AND image_source_url IS NULL)
  );

CREATE OR REPLACE FUNCTION public.reset_artist_image_credit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.image_url IS DISTINCT FROM OLD.image_url
     AND NEW.image_credit IS NOT DISTINCT FROM OLD.image_credit
     AND NEW.image_license IS NOT DISTINCT FROM OLD.image_license
     AND NEW.image_source_url IS NOT DISTINCT FROM OLD.image_source_url THEN
    NEW.image_credit := NULL;
    NEW.image_license := NULL;
    NEW.image_source_url := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS artists_reset_image_credit ON public.artists;
CREATE TRIGGER artists_reset_image_credit
  BEFORE UPDATE OF image_url ON public.artists
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_artist_image_credit();

-- Vérification (SQL Editor, lecture seule) :
-- select count(*) filter (where image_url is not null) as avec_photo,
--        count(*) filter (where image_credit is not null) as avec_credit
-- from public.artists;

-- ============================================
-- ROLLBACK
-- ============================================

-- DROP TRIGGER IF EXISTS artists_reset_image_credit ON public.artists;
-- DROP FUNCTION IF EXISTS public.reset_artist_image_credit();
-- ALTER TABLE public.artists
--   DROP CONSTRAINT IF EXISTS artists_image_credit_check,
--   DROP COLUMN IF EXISTS image_credit,
--   DROP COLUMN IF EXISTS image_license,
--   DROP COLUMN IF EXISTS image_source_url;
