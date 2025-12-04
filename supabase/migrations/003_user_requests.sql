-- ============================================
-- Migration 003 : Table des demandes de création d'utilisateurs
-- Date : 2024-12-XX
-- Description : Table pour gérer les demandes de création de comptes utilisateurs
-- ============================================

-- Table des demandes de création d'utilisateurs
CREATE TABLE IF NOT EXISTS user_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les recherches
CREATE INDEX IF NOT EXISTS idx_user_requests_status ON user_requests(status);
CREATE INDEX IF NOT EXISTS idx_user_requests_email ON user_requests(email);
CREATE INDEX IF NOT EXISTS idx_user_requests_requested_at ON user_requests(requested_at DESC);

-- ROW LEVEL SECURITY
ALTER TABLE user_requests ENABLE ROW LEVEL SECURITY;

-- Seuls les admins peuvent voir et gérer les demandes
CREATE POLICY "Only admins can view user requests"
  ON user_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Only admins can manage user requests"
  ON user_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Trigger pour updated_at
CREATE TRIGGER update_user_requests_updated_at
  BEFORE UPDATE ON user_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


