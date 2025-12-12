-- ============================================
-- Migration 048 : Création de la table pour les tokens de notifications push
-- Date : 2025-01-XX
-- Description : Table pour stocker les tokens FCM/APNs des utilisateurs
-- ============================================

-- Table pour stocker les tokens de notifications push
CREATE TABLE IF NOT EXISTS user_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_id TEXT,
  app_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token)
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id 
  ON user_push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_token 
  ON user_push_tokens(token);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_platform 
  ON user_push_tokens(platform);

-- ROW LEVEL SECURITY
ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour user_push_tokens
-- Les utilisateurs peuvent voir et modifier leurs propres tokens
CREATE POLICY "Users can view their own push tokens"
  ON user_push_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own push tokens"
  ON user_push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own push tokens"
  ON user_push_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push tokens"
  ON user_push_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Les admins peuvent tout voir
CREATE POLICY "Admins can view all push tokens"
  ON user_push_tokens FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Trigger pour mettre à jour updated_at automatiquement
CREATE TRIGGER update_user_push_tokens_updated_at
  BEFORE UPDATE ON user_push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_updated_at();

-- Commentaires pour documenter
COMMENT ON TABLE user_push_tokens IS 'Tokens de notifications push (FCM/APNs) pour chaque utilisateur et appareil';
COMMENT ON COLUMN user_push_tokens.platform IS 'Plateforme: ios, android, ou web';
COMMENT ON COLUMN user_push_tokens.device_id IS 'Identifiant unique de l''appareil (optionnel)';

