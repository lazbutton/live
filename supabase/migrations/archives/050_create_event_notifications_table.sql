-- ============================================
-- Migration 050 : Table des notifications d'événements
-- Date : 2024-12-10
-- Description : Création de la table pour gérer les notifications d'événements par utilisateur
-- ============================================

-- Table des notifications d'événements
CREATE TABLE IF NOT EXISTS event_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  notification_scheduled_at TIMESTAMP WITH TIME ZONE, -- Date à laquelle la notification est programmée (1 jour avant l'événement)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, user_id) -- Un utilisateur ne peut avoir qu'une notification par événement
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_event_notifications_event_id ON event_notifications(event_id);
CREATE INDEX IF NOT EXISTS idx_event_notifications_user_id ON event_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_event_notifications_is_enabled ON event_notifications(is_enabled);
CREATE INDEX IF NOT EXISTS idx_event_notifications_scheduled_at ON event_notifications(notification_scheduled_at) WHERE notification_scheduled_at IS NOT NULL;

-- Trigger pour mettre à jour updated_at automatiquement
-- Utilise la fonction générique de la migration 046 (update_notification_preferences_updated_at)
DROP TRIGGER IF EXISTS update_event_notifications_updated_at ON event_notifications;
CREATE TRIGGER update_event_notifications_updated_at
  BEFORE UPDATE ON event_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_updated_at();

-- ============================================
-- RLS (Row Level Security)
-- ============================================

-- Activer RLS
ALTER TABLE event_notifications ENABLE ROW LEVEL SECURITY;

-- Supprimer les politiques existantes si elles existent (pour permettre la réexécution)
DROP POLICY IF EXISTS "Users can view their own event notifications" ON event_notifications;
DROP POLICY IF EXISTS "Users can create their own event notifications" ON event_notifications;
DROP POLICY IF EXISTS "Users can update their own event notifications" ON event_notifications;
DROP POLICY IF EXISTS "Users can delete their own event notifications" ON event_notifications;

-- Politique : Les utilisateurs peuvent voir leurs propres notifications
CREATE POLICY "Users can view their own event notifications"
  ON event_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent créer leurs propres notifications
CREATE POLICY "Users can create their own event notifications"
  ON event_notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent mettre à jour leurs propres notifications
CREATE POLICY "Users can update their own event notifications"
  ON event_notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent supprimer leurs propres notifications
CREATE POLICY "Users can delete their own event notifications"
  ON event_notifications
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- COMMENTAIRES
-- ============================================

COMMENT ON TABLE event_notifications IS 'Table pour gérer les notifications d''événements activées par les utilisateurs';
COMMENT ON COLUMN event_notifications.event_id IS 'ID de l''événement pour lequel la notification est activée';
COMMENT ON COLUMN event_notifications.user_id IS 'ID de l''utilisateur qui a activé la notification';
COMMENT ON COLUMN event_notifications.is_enabled IS 'Indique si la notification est activée ou non';
COMMENT ON COLUMN event_notifications.notification_scheduled_at IS 'Date à laquelle la notification est programmée (1 jour avant l''événement)';

