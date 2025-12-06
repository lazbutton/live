-- ============================================
-- Migration 023 : Ajout des réseaux sociaux aux organisateurs
-- Date : 2025-01-XX
-- Description : Ajouter les champs Instagram et Facebook aux organisateurs
-- ============================================

-- Ajouter les colonnes pour les réseaux sociaux
ALTER TABLE organizers
ADD COLUMN IF NOT EXISTS instagram_url TEXT,
ADD COLUMN IF NOT EXISTS facebook_url TEXT;

-- Index pour améliorer les recherches (optionnel)
CREATE INDEX IF NOT EXISTS idx_organizers_instagram ON organizers(instagram_url) WHERE instagram_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizers_facebook ON organizers(facebook_url) WHERE facebook_url IS NOT NULL;

-- Commentaires
COMMENT ON COLUMN organizers.instagram_url IS 'URL du profil Instagram de l''organisateur';
COMMENT ON COLUMN organizers.facebook_url IS 'URL du profil Facebook de l''organisateur';

