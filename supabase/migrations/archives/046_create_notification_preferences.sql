-- ============================================
-- Migration 046 : Création des tables pour les préférences de notifications push
-- Date : 2025-01-XX
-- Description : Tables pour gérer les préférences de notifications utilisateur et les paramètres admin
-- ============================================

-- Table pour les préférences de notifications utilisateur
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'never')),
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Table pour les catégories sélectionnées par l'utilisateur pour les notifications
CREATE TABLE IF NOT EXISTS user_notification_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, category_id)
);

-- Table pour les paramètres admin des notifications
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_time TIME NOT NULL DEFAULT '09:00:00',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Insérer un paramètre par défaut (un seul paramètre global)
INSERT INTO notification_settings (notification_time, is_active)
VALUES ('09:00:00', true)
ON CONFLICT DO NOTHING;

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_user_id 
  ON user_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notification_categories_user_id 
  ON user_notification_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notification_categories_category_id 
  ON user_notification_categories(category_id);

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_notification_preferences_updated_at
  BEFORE UPDATE ON user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_updated_at();

CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_updated_at();

-- ROW LEVEL SECURITY
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour user_notification_preferences
-- Les utilisateurs peuvent voir et modifier leurs propres préférences
CREATE POLICY "Users can view their own notification preferences"
  ON user_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification preferences"
  ON user_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification preferences"
  ON user_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notification preferences"
  ON user_notification_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- Les admins peuvent tout voir
CREATE POLICY "Admins can view all notification preferences"
  ON user_notification_preferences FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Politiques RLS pour user_notification_categories
-- Les utilisateurs peuvent voir et modifier leurs propres catégories
CREATE POLICY "Users can view their own notification categories"
  ON user_notification_categories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification categories"
  ON user_notification_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notification categories"
  ON user_notification_categories FOR DELETE
  USING (auth.uid() = user_id);

-- Les admins peuvent tout voir
CREATE POLICY "Admins can view all notification categories"
  ON user_notification_categories FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Politiques RLS pour notification_settings
-- Tout le monde peut lire les paramètres (pour connaître l'heure des notifications)
CREATE POLICY "Anyone can view notification settings"
  ON notification_settings FOR SELECT
  USING (true);

-- Seuls les admins peuvent modifier les paramètres
CREATE POLICY "Admins can update notification settings"
  ON notification_settings FOR UPDATE
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Commentaires pour documenter
COMMENT ON TABLE user_notification_preferences IS 'Préférences de notifications push pour chaque utilisateur';
COMMENT ON COLUMN user_notification_preferences.frequency IS 'Fréquence des notifications: daily (tous les jours), weekly (début de semaine), never (jamais)';
COMMENT ON COLUMN user_notification_preferences.is_enabled IS 'Indique si les notifications sont activées pour cet utilisateur';
COMMENT ON TABLE user_notification_categories IS 'Catégories d''événements pour lesquelles l''utilisateur souhaite recevoir des notifications';
COMMENT ON TABLE notification_settings IS 'Paramètres globaux des notifications (gérés par les admins)';
COMMENT ON COLUMN notification_settings.notification_time IS 'Heure à laquelle les notifications sont envoyées (format TIME)';



