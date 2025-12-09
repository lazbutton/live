-- ============================================
-- Migration 040 : Correction de organizer_id pour permettre NULL
-- Date : 2025-12-XX
-- Description : Permettre organizer_id d'être NULL pour supporter les lieux-organisateurs
-- ============================================

-- Modifier organizer_id pour permettre NULL
ALTER TABLE organizer_scraping_configs
ALTER COLUMN organizer_id DROP NOT NULL;

-- Commentaire
COMMENT ON COLUMN organizer_scraping_configs.organizer_id IS 'ID de l''organisateur (mutuellement exclusif avec location_id, peut être NULL pour les lieux-organisateurs)';



