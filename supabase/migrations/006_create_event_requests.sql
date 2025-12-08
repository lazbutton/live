-- ============================================
-- Migration 006 : Table des demandes d'événements
-- Date : 2024-12-XX
-- Description : Table pour gérer les demandes de création d'événements
-- ============================================

-- Table des demandes d'événements
CREATE TABLE IF NOT EXISTS event_requests (
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
  organizer_id UUID REFERENCES organizers(id) ON DELETE SET NULL,
  requested_by_email TEXT NOT NULL,
  requested_by_name TEXT,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'converted')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  converted_to_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les recherches
CREATE INDEX IF NOT EXISTS idx_event_requests_status ON event_requests(status);
CREATE INDEX IF NOT EXISTS idx_event_requests_category ON event_requests(category);
CREATE INDEX IF NOT EXISTS idx_event_requests_requested_at ON event_requests(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_requests_requested_by_email ON event_requests(requested_by_email);

-- ROW LEVEL SECURITY
ALTER TABLE event_requests ENABLE ROW LEVEL SECURITY;

-- Seuls les admins peuvent voir et gérer les demandes d'événements
CREATE POLICY "Admins can view event requests"
  ON event_requests FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

CREATE POLICY "Admins can manage event requests"
  ON event_requests FOR ALL
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Trigger pour updated_at
CREATE TRIGGER update_event_requests_updated_at
  BEFORE UPDATE ON event_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();






