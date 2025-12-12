-- ============================================
-- Migration 014 : Ajout des tags aux événements
-- Date : 2024-12-XX
-- Description : Ajout d'un champ tags (tableau) pour les événements
-- ============================================

-- Créer une table pour les tags si elle n'existe pas
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Créer un index sur le nom des tags pour des recherches rapides
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

-- Ajouter la colonne tags à la table events (tableau de UUID référençant tags)
ALTER TABLE events
ADD COLUMN IF NOT EXISTS tag_ids UUID[] DEFAULT '{}';

-- Activer RLS sur la table tags
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

-- Politique : Tout le monde peut voir les tags
CREATE POLICY "Tags are viewable by everyone"
  ON tags FOR SELECT
  USING (true);

-- Note: Les politiques RLS pour INSERT, UPDATE et DELETE sont créées dans la migration 016
-- Ici, on crée une politique simple pour permettre à tous les admins de gérer les tags
-- La migration 016 utilisera la fonction is_user_admin() pour une meilleure sécurité

-- Politique temporaire : Seuls les admins peuvent créer/modifier/supprimer des tags
-- Cette politique sera remplacée par la migration 016
CREATE POLICY "Only admins can manage tags"
  ON tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role')::text = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role')::text = 'admin'
    )
  );

