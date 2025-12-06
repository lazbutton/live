-- ============================================
-- Migration 027 : Ajout de coordonnées aux événements
-- Date : 2024-12-XX
-- Description : Ajout de latitude et longitude aux événements pour leurs adresses
-- ============================================

ALTER TABLE events
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);

-- Index pour les recherches géographiques
CREATE INDEX IF NOT EXISTS idx_events_coordinates ON events(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

