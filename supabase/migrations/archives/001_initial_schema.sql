-- ============================================
-- Migration 001 : Schéma initial
-- Date : 2024-12-XX
-- Description : Création du schéma de base de données initial
-- ============================================

-- ============================================
-- TABLES
-- ============================================

-- Table des lieux
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des organisateurs
CREATE TABLE IF NOT EXISTS organizers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  logo_url TEXT,
  icon_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des événements
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  image_url TEXT,
  category TEXT NOT NULL,
  price DECIMAL(10, 2),
  address TEXT,
  capacity INTEGER,
  door_opening_time TEXT,
  external_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table de liaison événements-organisateurs
CREATE TABLE IF NOT EXISTS event_organizers (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  organizer_id UUID REFERENCES organizers(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, organizer_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(name);
CREATE INDEX IF NOT EXISTS idx_organizers_name ON organizers(name);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_location ON events(location_id);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_event_organizers_event ON event_organizers(event_id);
CREATE INDEX IF NOT EXISTS idx_event_organizers_organizer ON event_organizers(organizer_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_organizers ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLITIQUES DE SÉCURITÉ
-- ============================================

-- Locations : Tout le monde peut voir, seuls les admins peuvent modifier
CREATE POLICY "Locations are viewable by everyone"
  ON locations FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage locations"
  ON locations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Organizers : Tout le monde peut voir, seuls les admins peuvent modifier
CREATE POLICY "Organizers are viewable by everyone"
  ON organizers FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage organizers"
  ON organizers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Events : Tout le monde peut voir les approuvés, utilisateurs peuvent créer
CREATE POLICY "Approved events are viewable by everyone"
  ON events FOR SELECT
  USING (status = 'approved');

CREATE POLICY "Users can view their own events"
  ON events FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Authenticated users can create events"
  ON events FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own pending events"
  ON events FOR UPDATE
  USING (
    auth.uid() = created_by 
    AND status = 'pending'
  )
  WITH CHECK (
    auth.uid() = created_by 
    AND status = 'pending'
  );

CREATE POLICY "Users can delete their own pending events"
  ON events FOR DELETE
  USING (
    auth.uid() = created_by 
    AND status = 'pending'
  );

CREATE POLICY "Admins can manage all events"
  ON events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Event organizers : Tout le monde peut voir, seuls les admins peuvent modifier
CREATE POLICY "Event organizers are viewable by everyone"
  ON event_organizers FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage event organizers"
  ON event_organizers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- ============================================
-- TRIGGERS
-- ============================================

-- Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour toutes les tables
CREATE TRIGGER update_locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizers_updated_at
  BEFORE UPDATE ON organizers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROLLBACK (en cas de problème)
-- ============================================

-- Pour annuler cette migration, exécuter :
-- DROP TABLE IF EXISTS event_organizers CASCADE;
-- DROP TABLE IF EXISTS events CASCADE;
-- DROP TABLE IF EXISTS organizers CASCADE;
-- DROP TABLE IF EXISTS locations CASCADE;
-- DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

