-- ============================================
-- Migration 038 : Ajout de l'URL d'exemple de scraping aux organisateurs
-- Date : 2025-12-XX
-- Description : Ajouter un champ pour stocker une URL d'exemple de page à scraper
-- ============================================

-- Ajouter la colonne scraping_example_url aux organisateurs
ALTER TABLE organizers
ADD COLUMN IF NOT EXISTS scraping_example_url TEXT;

-- Index pour améliorer les recherches
CREATE INDEX IF NOT EXISTS idx_organizers_scraping_example_url ON organizers(scraping_example_url) WHERE scraping_example_url IS NOT NULL;

-- Commentaire
COMMENT ON COLUMN organizers.scraping_example_url IS 'URL d''exemple de page web à scraper pour cet organisateur. Les sélecteurs CSS configurés seront utilisés pour scraper cette page et les autres pages similaires.';







