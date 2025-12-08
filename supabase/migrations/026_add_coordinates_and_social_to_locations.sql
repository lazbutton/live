-- ============================================
-- Migration 026 : Ajout de coordonnées et réseaux sociaux aux lieux
-- Date : 2024-12-XX
-- Description : Ajout de latitude, longitude, instagram_url et facebook_url aux lieux
-- ============================================

ALTER TABLE locations
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS instagram_url TEXT,
ADD COLUMN IF NOT EXISTS facebook_url TEXT;

-- Index pour les recherches géographiques
CREATE INDEX IF NOT EXISTS idx_locations_coordinates ON locations(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;




