-- ============================================
-- Migration 033 : Ajouter facebook_page_id aux lieux
-- Date : 2025-01-XX
-- Description : Ajouter le champ facebook_page_id aux lieux pour permettre l'importation d'événements Facebook
-- ============================================

-- Ajouter le champ facebook_page_id aux lieux
ALTER TABLE locations
ADD COLUMN IF NOT EXISTS facebook_page_id TEXT;

-- Index pour améliorer les recherches
CREATE INDEX IF NOT EXISTS idx_locations_facebook_page_id ON locations(facebook_page_id) WHERE facebook_page_id IS NOT NULL;

-- Commentaire
COMMENT ON COLUMN locations.facebook_page_id IS 'ID de la page Facebook (ex: "123456789") pour récupérer les événements via l''API Graph. Utilisé lorsque le lieu est aussi un organisateur (is_organizer = true)';

