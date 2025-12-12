-- ============================================
-- Migration 051 : Table des likes d'événements
-- Date : 2024-12-10
-- Description : Création de la table pour gérer les likes d'événements par utilisateur
-- ============================================

-- Table des likes d'événements
CREATE TABLE IF NOT EXISTS event_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, user_id) -- Un utilisateur ne peut liker qu'une fois un événement
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_event_likes_event_id ON event_likes(event_id);
CREATE INDEX IF NOT EXISTS idx_event_likes_user_id ON event_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_event_likes_created_at ON event_likes(created_at DESC);

-- Trigger pour mettre à jour updated_at automatiquement (utilise la fonction générique)
DROP TRIGGER IF EXISTS update_event_likes_updated_at ON event_likes;

-- ============================================
-- RLS (Row Level Security)
-- ============================================

-- Activer RLS
ALTER TABLE event_likes ENABLE ROW LEVEL SECURITY;

-- Supprimer les politiques existantes si elles existent (pour permettre la réexécution)
DROP POLICY IF EXISTS "Users can view all event likes" ON event_likes;
DROP POLICY IF EXISTS "Users can create their own event likes" ON event_likes;
DROP POLICY IF EXISTS "Users can delete their own event likes" ON event_likes;

-- Politique : Tout le monde peut voir les likes (pour afficher les compteurs)
CREATE POLICY "Users can view all event likes"
  ON event_likes
  FOR SELECT
  USING (true);

-- Politique : Les utilisateurs peuvent créer leurs propres likes
CREATE POLICY "Users can create their own event likes"
  ON event_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent supprimer leurs propres likes
CREATE POLICY "Users can delete their own event likes"
  ON event_likes
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- COMMENTAIRES
-- ============================================

COMMENT ON TABLE event_likes IS 'Table pour gérer les likes d''événements par utilisateur';
COMMENT ON COLUMN event_likes.event_id IS 'ID de l''événement liké';
COMMENT ON COLUMN event_likes.user_id IS 'ID de l''utilisateur qui a liké';

