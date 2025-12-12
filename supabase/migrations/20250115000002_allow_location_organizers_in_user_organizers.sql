-- ============================================
-- Migration : Permettre les lieux-organisateurs dans user_organizers
-- Date : 2025-01-15
-- Description : Modifie la contrainte FK de user_organizers.organizer_id pour permettre
--               de référencer soit organizers(id) soit locations(id) (quand is_organizer = true)
-- ============================================

-- ============================================
-- CHANGEMENTS
-- ============================================

-- Cette migration modifie la contrainte FK de user_organizers.organizer_id pour permettre
-- de référencer à la fois les organisateurs classiques (organizers.id) et les lieux-organisateurs
-- (locations.id où is_organizer = true).

-- ============================================
-- CODE SQL
-- ============================================

-- ============================================
-- IMPORTANT : Cette migration modifie la contrainte FK de user_organizers
-- pour permettre de référencer à la fois organizers et locations (lieux-organisateurs)
-- ============================================

-- Supprimer l'ancienne contrainte FK
ALTER TABLE public.user_organizers 
DROP CONSTRAINT IF EXISTS user_organizers_organizer_id_fkey;

-- Créer une fonction de vérification pour l'intégrité référentielle
CREATE OR REPLACE FUNCTION public.check_organizer_id_exists(organizer_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Vérifier si c'est un organisateur classique
  IF EXISTS (SELECT 1 FROM public.organizers WHERE id = organizer_uuid) THEN
    RETURN true;
  END IF;
  
  -- Vérifier si c'est un lieu-organisateur
  IF EXISTS (SELECT 1 FROM public.locations WHERE id = organizer_uuid AND is_organizer = true) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.check_organizer_id_exists(uuid) IS 
'Vérifie que l''ID référence soit un organisateur classique (organizers.id) soit un lieu-organisateur (locations.id où is_organizer = true)';

-- Ajouter une contrainte CHECK qui utilise la fonction
-- NOTE: Une contrainte CHECK ne remplace pas complètement une FK pour l'intégrité référentielle,
-- mais elle garantit que seuls les IDs valides peuvent être insérés.
-- Pour une intégrité référentielle complète, vous pourriez créer un trigger INSTEAD OF
-- ou utiliser une table de mapping, mais cette solution fonctionne pour la plupart des cas.
ALTER TABLE public.user_organizers
ADD CONSTRAINT user_organizers_organizer_id_check
CHECK (public.check_organizer_id_exists(organizer_id));

COMMENT ON CONSTRAINT user_organizers_organizer_id_check ON public.user_organizers IS 
'Vérifie que organizer_id référence soit un organisateur classique (organizers.id) soit un lieu-organisateur (locations.id où is_organizer = true)';

