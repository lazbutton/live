-- ============================================
-- Migration 052 : Table des événements masqués par utilisateur
-- Date : 2025-01-XX
-- Description : Création de la table pour gérer les événements masqués par utilisateur
-- ============================================

-- Table des événements masqués
CREATE TABLE IF NOT EXISTS user_hidden_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, user_id) -- Un utilisateur ne peut masquer qu'une fois un événement
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_user_hidden_events_event_id ON user_hidden_events(event_id);
CREATE INDEX IF NOT EXISTS idx_user_hidden_events_user_id ON user_hidden_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_hidden_events_created_at ON user_hidden_events(created_at DESC);

-- ============================================
-- RLS (Row Level Security)
-- ============================================

-- Activer RLS
ALTER TABLE user_hidden_events ENABLE ROW LEVEL SECURITY;

-- Supprimer les politiques existantes si elles existent (pour permettre la réexécution)
DROP POLICY IF EXISTS "Users can view their own hidden events" ON user_hidden_events;
DROP POLICY IF EXISTS "Users can create their own hidden events" ON user_hidden_events;
DROP POLICY IF EXISTS "Users can delete their own hidden events" ON user_hidden_events;

-- Politique : Les utilisateurs peuvent voir leurs propres événements masqués
CREATE POLICY "Users can view their own hidden events"
  ON user_hidden_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent créer leurs propres événements masqués
CREATE POLICY "Users can create their own hidden events"
  ON user_hidden_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent supprimer leurs propres événements masqués
CREATE POLICY "Users can delete their own hidden events"
  ON user_hidden_events
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- COMMENTAIRES
-- ============================================

COMMENT ON TABLE user_hidden_events IS 'Table pour gérer les événements masqués par utilisateur';
COMMENT ON COLUMN user_hidden_events.event_id IS 'ID de l''événement masqué';
COMMENT ON COLUMN user_hidden_events.user_id IS 'ID de l''utilisateur qui a masqué l''événement';

