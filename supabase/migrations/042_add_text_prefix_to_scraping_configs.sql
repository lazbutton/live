-- ============================================
-- Migration 042 : Ajout du champ text_prefix pour l'extraction de texte
-- Date : 2025-12-XX
-- Description : Ajouter un champ pour extraire une valeur après un texte spécifique (ex: "prix :")
-- ============================================

-- Ajouter la colonne text_prefix aux configurations de scraping
ALTER TABLE organizer_scraping_configs
ADD COLUMN IF NOT EXISTS text_prefix TEXT;

-- Index pour améliorer les recherches
CREATE INDEX IF NOT EXISTS idx_organizer_scraping_configs_text_prefix ON organizer_scraping_configs(text_prefix) WHERE text_prefix IS NOT NULL;

-- Commentaire
COMMENT ON COLUMN organizer_scraping_configs.text_prefix IS 'Texte à rechercher avant la valeur à extraire (ex: "prix :", "date :"). Si défini, la valeur sera extraite après ce texte dans le contenu de l''élément sélectionné.';



