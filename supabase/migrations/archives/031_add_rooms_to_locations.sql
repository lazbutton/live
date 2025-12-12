-- ============================================
-- Migration 031 : Ajout des salles aux lieux
-- Date : 2025-01-XX
-- Description : Permettre aux lieux d'avoir plusieurs salles/scènes
-- ============================================

-- Table des salles (salles et scènes)
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ajouter room_id à la table events
ALTER TABLE events
ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(id) ON DELETE SET NULL;

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_rooms_location ON rooms(location_id);
CREATE INDEX IF NOT EXISTS idx_rooms_name ON rooms(name);
CREATE INDEX IF NOT EXISTS idx_events_room ON events(room_id);

-- ROW LEVEL SECURITY
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour les salles
-- Tout le monde peut voir les salles
CREATE POLICY "Rooms are viewable by everyone"
  ON rooms FOR SELECT
  USING (true);

-- Seuls les admins peuvent gérer les salles
-- Utiliser la fonction is_user_admin() définie dans la migration 005
CREATE POLICY "Only admins can manage rooms"
  ON rooms FOR ALL
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Trigger pour updated_at
CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Commentaires
COMMENT ON TABLE rooms IS 'Salles et scènes appartenant aux lieux';
COMMENT ON COLUMN rooms.location_id IS 'ID du lieu auquel appartient cette salle';
COMMENT ON COLUMN rooms.name IS 'Nom de la salle ou scène (ex: "Grande salle", "Scène principale", etc.)';
COMMENT ON COLUMN rooms.capacity IS 'Capacité de la salle (optionnel)';
COMMENT ON COLUMN events.room_id IS 'ID de la salle où se déroule l''événement (optionnel)';

