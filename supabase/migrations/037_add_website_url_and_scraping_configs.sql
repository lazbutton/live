-- ============================================
-- Migration 037 : Ajout du site web et des configurations de scraping
-- Date : 2025-12-XX
-- Description : Ajouter le champ website_url aux organisateurs et créer une table pour les mappings CSS
-- ============================================

-- Ajouter la colonne website_url aux organisateurs
ALTER TABLE organizers
ADD COLUMN IF NOT EXISTS website_url TEXT;

-- Index pour améliorer les recherches
CREATE INDEX IF NOT EXISTS idx_organizers_website_url ON organizers(website_url) WHERE website_url IS NOT NULL;

-- Commentaire
COMMENT ON COLUMN organizers.website_url IS 'URL du site web de l''organisateur pour le scraping automatique';

-- Table pour stocker les configurations de scraping par organisateur
CREATE TABLE IF NOT EXISTS organizer_scraping_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  event_field TEXT NOT NULL, -- Ex: 'title', 'description', 'date', 'price', 'location', 'image_url', etc.
  css_selector TEXT NOT NULL, -- Ex: '.event-title', 'h1.event-name', '#price', etc.
  attribute TEXT, -- Attribut HTML à extraire (default: 'textContent', peut être 'href', 'src', 'data-date', etc.)
  transform_function TEXT, -- Fonction de transformation optionnelle (ex: 'date', 'price', 'url')
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organizer_id, event_field)
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_organizer_scraping_configs_organizer ON organizer_scraping_configs(organizer_id);
CREATE INDEX IF NOT EXISTS idx_organizer_scraping_configs_field ON organizer_scraping_configs(event_field);

-- RLS pour la table scraping_configs
ALTER TABLE organizer_scraping_configs ENABLE ROW LEVEL SECURITY;

-- Politique : tout le monde peut voir, seuls les admins peuvent modifier
CREATE POLICY "Scraping configs are viewable by everyone"
  ON organizer_scraping_configs FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage scraping configs"
  ON organizer_scraping_configs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_organizer_scraping_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizer_scraping_configs_updated_at
  BEFORE UPDATE ON organizer_scraping_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_organizer_scraping_configs_updated_at();

-- Commentaires
COMMENT ON TABLE organizer_scraping_configs IS 'Configuration de scraping CSS pour chaque organisateur';
COMMENT ON COLUMN organizer_scraping_configs.event_field IS 'Nom du champ d''événement (title, description, date, price, location, image_url, organizer, category, tags, capacity, door_opening_time, address)';
COMMENT ON COLUMN organizer_scraping_configs.css_selector IS 'Sélecteur CSS pour trouver l''élément sur la page';
COMMENT ON COLUMN organizer_scraping_configs.attribute IS 'Attribut HTML à extraire (textContent par défaut, peut être href, src, data-*, etc.)';
COMMENT ON COLUMN organizer_scraping_configs.transform_function IS 'Fonction de transformation optionnelle (date, price, url, etc.)';




