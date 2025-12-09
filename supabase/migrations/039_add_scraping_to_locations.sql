-- ============================================
-- Migration 039 : Ajout du scraping aux lieux-organisateurs
-- Date : 2025-12-XX
-- Description : Ajouter website_url et scraping_example_url aux lieux pour les lieux-organisateurs
-- ============================================

-- Ajouter les colonnes website_url et scraping_example_url aux lieux
ALTER TABLE locations
ADD COLUMN IF NOT EXISTS website_url TEXT,
ADD COLUMN IF NOT EXISTS scraping_example_url TEXT;

-- Index pour améliorer les recherches
CREATE INDEX IF NOT EXISTS idx_locations_website_url ON locations(website_url) WHERE website_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_locations_scraping_example_url ON locations(scraping_example_url) WHERE scraping_example_url IS NOT NULL;

-- Commentaires
COMMENT ON COLUMN locations.website_url IS 'URL du site web du lieu (pour les lieux-organisateurs)';
COMMENT ON COLUMN locations.scraping_example_url IS 'URL d''exemple de page web à scraper (pour les lieux-organisateurs)';

-- Modifier la table organizer_scraping_configs pour accepter aussi location_id
ALTER TABLE organizer_scraping_configs
ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE CASCADE;

-- Modifier la contrainte UNIQUE pour accepter organizer_id OU location_id
ALTER TABLE organizer_scraping_configs
DROP CONSTRAINT IF EXISTS organizer_scraping_configs_organizer_id_event_field_key;

-- Créer une nouvelle contrainte UNIQUE qui fonctionne avec organizer_id ou location_id
CREATE UNIQUE INDEX IF NOT EXISTS organizer_scraping_configs_organizer_unique 
  ON organizer_scraping_configs(organizer_id, event_field) 
  WHERE organizer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS organizer_scraping_configs_location_unique 
  ON organizer_scraping_configs(location_id, event_field) 
  WHERE location_id IS NOT NULL;

-- Ajouter une contrainte pour s'assurer qu'on a soit organizer_id, soit location_id, mais pas les deux
ALTER TABLE organizer_scraping_configs
ADD CONSTRAINT organizer_scraping_configs_exactly_one_organizer 
  CHECK (
    (organizer_id IS NOT NULL AND location_id IS NULL) OR 
    (organizer_id IS NULL AND location_id IS NOT NULL)
  );

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_organizer_scraping_configs_location ON organizer_scraping_configs(location_id);

-- Commentaire
COMMENT ON COLUMN organizer_scraping_configs.location_id IS 'ID du lieu-organisateur (mutuellement exclusif avec organizer_id)';




