-- ============================================
-- Migration 061 : Ajout du champ scraping_url aux événements
-- Date : 2025-01-XX
-- Description : Ajouter le champ scraping_url pour le scraping d'informations sur les événements
-- ============================================

-- Ajouter la colonne scraping_url à la table events
ALTER TABLE events
ADD COLUMN IF NOT EXISTS scraping_url TEXT;

-- Commentaire
COMMENT ON COLUMN events.scraping_url IS 'URL d''exemple pour le scraping d''informations sur l''événement (optionnel)';



