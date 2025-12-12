-- ============================================
-- Migration 060 : Ajout du champ tiktok_url aux organisateurs et lieux
-- Date : 2025-01-XX
-- Description : Ajouter le champ tiktok_url pour les liens TikTok dans les tables organizers et locations
-- ============================================

-- Ajouter la colonne tiktok_url à la table organizers
ALTER TABLE organizers
ADD COLUMN IF NOT EXISTS tiktok_url TEXT;

-- Ajouter la colonne tiktok_url à la table locations
ALTER TABLE locations
ADD COLUMN IF NOT EXISTS tiktok_url TEXT;

-- Commentaires
COMMENT ON COLUMN organizers.tiktok_url IS 'URL du profil TikTok de l''organisateur (optionnel)';
COMMENT ON COLUMN locations.tiktok_url IS 'URL du profil TikTok du lieu (optionnel)';



