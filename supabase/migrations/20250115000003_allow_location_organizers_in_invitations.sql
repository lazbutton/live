-- ============================================
-- Migration : Permettre les lieux-organisateurs dans organizer_invitations
-- Date : 2025-01-15
-- Description : Modifie la contrainte FK de organizer_invitations.organizer_id pour permettre
--               de référencer soit organizers(id) soit locations(id) (quand is_organizer = true)
-- ============================================

-- ============================================
-- CHANGEMENTS
-- ============================================

-- Cette migration modifie la contrainte FK de organizer_invitations.organizer_id pour permettre
-- de référencer à la fois les organisateurs classiques (organizers.id) et les lieux-organisateurs
-- (locations.id où is_organizer = true).

-- ============================================
-- CODE SQL
-- ============================================

-- ============================================
-- IMPORTANT : Cette migration modifie la contrainte FK de organizer_invitations
-- pour permettre de référencer à la fois organizers et locations (lieux-organisateurs)
-- ============================================

-- Supprimer l'ancienne contrainte FK
ALTER TABLE public.organizer_invitations 
DROP CONSTRAINT IF EXISTS organizer_invitations_organizer_id_fkey;

-- La fonction check_organizer_id_exists existe déjà depuis la migration 20250115000002
-- On l'utilise aussi pour organizer_invitations

-- Ajouter une contrainte CHECK qui utilise la fonction existante
ALTER TABLE public.organizer_invitations
ADD CONSTRAINT organizer_invitations_organizer_id_check
CHECK (public.check_organizer_id_exists(organizer_id));

COMMENT ON CONSTRAINT organizer_invitations_organizer_id_check ON public.organizer_invitations IS 
'Vérifie que organizer_id référence soit un organisateur classique (organizers.id) soit un lieu-organisateur (locations.id où is_organizer = true)';


