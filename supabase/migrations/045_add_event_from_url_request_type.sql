-- ============================================
-- Migration 045 : Ajout du type de demande event_from_url et suppression de user_account
-- Date : 2025-01-XX
-- Description : Ajouter un nouveau type de demande pour les événements depuis URL avec lieu, type et URL
--               Supprimer complètement la fonctionnalité de demande de création de compte (user_account)
--               Ajouter le type de demande dans event_data pour les demandes complètes
-- ============================================

-- Supprimer les anciennes données de type 'user_account' si elles existent
DELETE FROM user_requests WHERE request_type = 'user_account';

-- Supprimer l'ancienne contrainte CHECK sur request_type
ALTER TABLE user_requests 
DROP CONSTRAINT IF EXISTS user_requests_request_type_check;

-- Ajouter la nouvelle contrainte CHECK sans 'user_account'
ALTER TABLE user_requests 
ADD CONSTRAINT user_requests_request_type_check 
CHECK (request_type IN ('event_creation', 'event_from_url'));

-- Supprimer les colonnes liées aux demandes de compte (email, name)
-- Ces colonnes ne sont plus nécessaires car on ne gère plus les demandes de création de compte
ALTER TABLE user_requests 
DROP COLUMN IF EXISTS email;

ALTER TABLE user_requests 
DROP COLUMN IF EXISTS name;

-- Supprimer les index liés aux demandes de compte
DROP INDEX IF EXISTS idx_user_requests_email;
DROP INDEX IF EXISTS idx_user_requests_email_type;

-- Ajouter des colonnes pour stocker directement le lieu, le type et l'URL pour les demandes depuis URL
-- Ces colonnes seront utilisées pour le type 'event_from_url'
ALTER TABLE user_requests 
ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

ALTER TABLE user_requests 
ADD COLUMN IF NOT EXISTS location_name TEXT;

ALTER TABLE user_requests 
ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Index pour les demandes depuis URL
CREATE INDEX IF NOT EXISTS idx_user_requests_from_url_type 
ON user_requests(request_type) 
WHERE request_type = 'event_from_url';

CREATE INDEX IF NOT EXISTS idx_user_requests_location_id 
ON user_requests(location_id) 
WHERE location_id IS NOT NULL;

-- Commentaires pour documenter
COMMENT ON COLUMN user_requests.request_type IS 'Type de demande: event_creation (demande complète) ou event_from_url (demande depuis URL)';
COMMENT ON COLUMN user_requests.location_id IS 'ID du lieu (pour les demandes event_from_url)';
COMMENT ON COLUMN user_requests.location_name IS 'Nom du lieu (pour les demandes event_from_url ou event_creation)';
COMMENT ON COLUMN user_requests.source_url IS 'URL source de l''événement (pour les demandes event_from_url)';

-- ============================================
-- MISE À JOUR DES POLITIQUES RLS
-- ============================================

-- Nouvelle politique : Les utilisateurs authentifiés peuvent créer des demandes depuis URL
CREATE POLICY "Authenticated users can create event from url requests"
  ON user_requests FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND request_type = 'event_from_url'
    AND requested_by = auth.uid()
  );

-- Mettre à jour la politique existante pour inclure event_from_url
DROP POLICY IF EXISTS "Users can view their own event requests" ON user_requests;
CREATE POLICY "Users can view their own event requests"
  ON user_requests FOR SELECT
  USING (
    ((request_type = 'event_creation' OR request_type = 'event_from_url') AND requested_by = auth.uid())
    OR
    (auth.uid() IS NOT NULL AND is_user_admin() = true)
  );

-- Mettre à jour la politique de modification pour inclure event_from_url
DROP POLICY IF EXISTS "Users can manage their own pending event requests" ON user_requests;
CREATE POLICY "Users can manage their own pending event requests"
  ON user_requests FOR UPDATE
  USING (
    (request_type = 'event_creation' OR request_type = 'event_from_url')
    AND requested_by = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    (request_type = 'event_creation' OR request_type = 'event_from_url')
    AND requested_by = auth.uid()
    AND status = 'pending'
  );

-- Mettre à jour la politique de suppression pour inclure event_from_url
DROP POLICY IF EXISTS "Users can delete their own pending event requests" ON user_requests;
CREATE POLICY "Users can delete their own pending event requests"
  ON user_requests FOR DELETE
  USING (
    (request_type = 'event_creation' OR request_type = 'event_from_url')
    AND requested_by = auth.uid()
    AND status = 'pending'
  );

