-- ============================================
-- Migration 049 : Ajout des préférences de catégories aux notifications
-- Date : 2025-01-XX
-- Description : Ajouter un champ pour stocker les catégories préférées par l'utilisateur
-- ============================================

-- Ajouter la colonne category_ids à user_notification_preferences
-- Si NULL ou vide, l'utilisateur reçoit des notifications pour toutes les catégories
ALTER TABLE user_notification_preferences
ADD COLUMN IF NOT EXISTS category_ids TEXT[];

-- Index pour améliorer les performances des requêtes sur category_ids
CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_category_ids 
  ON user_notification_preferences USING GIN (category_ids);

-- Commentaire pour documenter
COMMENT ON COLUMN user_notification_preferences.category_ids IS 
  'Tableau des IDs des catégories pour lesquelles l''utilisateur souhaite recevoir des notifications. Si NULL ou vide, toutes les catégories sont incluses.';




