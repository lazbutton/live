-- ============================================
-- Migration 047 : Création de la table de logs des notifications
-- Date : 2025-01-XX
-- Description : Table pour logger les notifications envoyées aux utilisateurs
-- ============================================

-- Table pour logger les notifications envoyées
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  event_ids UUID[],
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id 
  ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at 
  ON notification_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at 
  ON notification_logs(created_at DESC);

-- ROW LEVEL SECURITY
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour notification_logs
-- Les utilisateurs peuvent voir leurs propres logs
CREATE POLICY "Users can view their own notification logs"
  ON notification_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Les admins peuvent tout voir
CREATE POLICY "Admins can view all notification logs"
  ON notification_logs FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Seuls les services (avec service_role) peuvent insérer des logs
-- Note: Les insertions depuis Next.js avec service_role bypasseront RLS automatiquement

-- Commentaires pour documenter
COMMENT ON TABLE notification_logs IS 'Logs des notifications envoyées aux utilisateurs';
COMMENT ON COLUMN notification_logs.event_ids IS 'Tableau des IDs des événements concernés par la notification';
COMMENT ON COLUMN notification_logs.sent_at IS 'Date et heure d''envoi de la notification';

