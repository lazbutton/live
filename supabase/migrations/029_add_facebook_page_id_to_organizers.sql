-- ============================================
-- Migration 029 : Ajout de l'ID de page Facebook aux organisateurs
-- Date : 2025-01-XX
-- Description : Ajouter un champ pour stocker l'ID de la page Facebook pour récupérer les événements
-- ============================================

-- Ajouter la colonne pour l'ID de page Facebook
ALTER TABLE organizers
ADD COLUMN IF NOT EXISTS facebook_page_id TEXT;

-- Index pour améliorer les recherches
CREATE INDEX IF NOT EXISTS idx_organizers_facebook_page_id ON organizers(facebook_page_id) WHERE facebook_page_id IS NOT NULL;

-- Commentaire
COMMENT ON COLUMN organizers.facebook_page_id IS 'ID de la page Facebook (ex: "123456789") pour récupérer les événements via l''API Graph';

