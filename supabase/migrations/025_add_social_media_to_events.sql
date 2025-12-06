-- ============================================
-- Migration 025 : Ajout des réseaux sociaux aux événements
-- Date : 2025-01-XX
-- Description : Ajouter les champs Instagram et Facebook aux événements
-- ============================================

-- Ajouter les colonnes pour les réseaux sociaux
ALTER TABLE events
ADD COLUMN IF NOT EXISTS instagram_url TEXT,
ADD COLUMN IF NOT EXISTS facebook_url TEXT;

-- Index pour améliorer les recherches (optionnel)
CREATE INDEX IF NOT EXISTS idx_events_instagram ON events(instagram_url) WHERE instagram_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_facebook ON events(facebook_url) WHERE facebook_url IS NOT NULL;

-- Commentaires
COMMENT ON COLUMN events.instagram_url IS 'URL du profil Instagram de l''événement';
COMMENT ON COLUMN events.facebook_url IS 'URL du profil Facebook de l''événement';

-- ============================================
-- ROLLBACK (en cas de problème)
-- ============================================

-- Pour annuler cette migration, exécuter :
-- DROP INDEX IF EXISTS idx_events_instagram;
-- DROP INDEX IF EXISTS idx_events_facebook;
-- ALTER TABLE events DROP COLUMN IF EXISTS instagram_url;
-- ALTER TABLE events DROP COLUMN IF EXISTS facebook_url;


