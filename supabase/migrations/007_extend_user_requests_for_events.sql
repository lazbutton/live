-- ============================================
-- Migration 007 : Extension de user_requests pour les demandes d'événements
-- Date : 2024-12-XX
-- Description : Étendre la table user_requests pour supporter les demandes de création d'événements
-- ============================================

-- Ajouter un champ pour le type de demande
ALTER TABLE user_requests 
ADD COLUMN IF NOT EXISTS request_type TEXT DEFAULT 'user_account' 
CHECK (request_type IN ('user_account', 'event_creation'));

-- Ajouter un champ JSONB pour stocker les données de l'événement
ALTER TABLE user_requests 
ADD COLUMN IF NOT EXISTS event_data JSONB;

-- Ajouter un champ pour l'ID de l'utilisateur qui fait la demande (pour les événements)
ALTER TABLE user_requests 
ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Rendre email nullable car les demandes d'événements n'ont pas besoin d'email
ALTER TABLE user_requests 
ALTER COLUMN email DROP NOT NULL;

-- Ajouter une contrainte unique sur (email, request_type) pour les demandes de compte
-- Cela permet d'avoir plusieurs demandes d'événements mais une seule demande de compte par email
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_requests_email_type 
ON user_requests(email, request_type) 
WHERE email IS NOT NULL AND request_type = 'user_account';

-- Index pour les demandes d'événements
CREATE INDEX IF NOT EXISTS idx_user_requests_event_type ON user_requests(request_type) WHERE request_type = 'event_creation';
CREATE INDEX IF NOT EXISTS idx_user_requests_requested_by ON user_requests(requested_by) WHERE requested_by IS NOT NULL;

-- Commentaires pour documenter
COMMENT ON COLUMN user_requests.request_type IS 'Type de demande: user_account ou event_creation';
COMMENT ON COLUMN user_requests.event_data IS 'Données JSON de l''événement pour les demandes de type event_creation';
COMMENT ON COLUMN user_requests.requested_by IS 'ID de l''utilisateur qui fait la demande (pour les événements)';

-- ============================================
-- MISE À JOUR DES POLITIQUES RLS
-- ============================================

-- Supprimer les anciennes politiques (de la migration 003 et 005)
DROP POLICY IF EXISTS "Only admins can view user requests" ON user_requests;
DROP POLICY IF EXISTS "Only admins can manage user requests" ON user_requests;
DROP POLICY IF EXISTS "Authenticated admins can view user requests" ON user_requests;
DROP POLICY IF EXISTS "Authenticated admins can manage user requests" ON user_requests;

-- Nouvelle politique : Les utilisateurs authentifiés peuvent créer des demandes d'événements
CREATE POLICY "Authenticated users can create event requests"
  ON user_requests FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND request_type = 'event_creation'
    AND requested_by = auth.uid()
  );

-- Nouvelle politique : Les utilisateurs peuvent voir leurs propres demandes d'événements
CREATE POLICY "Users can view their own event requests"
  ON user_requests FOR SELECT
  USING (
    (request_type = 'event_creation' AND requested_by = auth.uid())
    OR
    (auth.uid() IS NOT NULL AND is_user_admin() = true)
  );

-- Nouvelle politique : Les utilisateurs peuvent modifier/supprimer leurs propres demandes en attente
CREATE POLICY "Users can manage their own pending event requests"
  ON user_requests FOR UPDATE
  USING (
    request_type = 'event_creation' 
    AND requested_by = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    request_type = 'event_creation' 
    AND requested_by = auth.uid()
    AND status = 'pending'
  );

CREATE POLICY "Users can delete their own pending event requests"
  ON user_requests FOR DELETE
  USING (
    request_type = 'event_creation' 
    AND requested_by = auth.uid()
    AND status = 'pending'
  );

-- Nouvelle politique : Seuls les admins peuvent gérer toutes les demandes
CREATE POLICY "Admins can manage all user requests"
  ON user_requests FOR ALL
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- ============================================
-- ROLLBACK (en cas de problème)
-- ============================================

-- Pour annuler cette migration, exécuter :
-- DROP INDEX IF EXISTS idx_user_requests_email_type;
-- DROP INDEX IF EXISTS idx_user_requests_event_type;
-- DROP INDEX IF EXISTS idx_user_requests_requested_by;
-- DROP POLICY IF EXISTS "Authenticated users can create event requests" ON user_requests;
-- DROP POLICY IF EXISTS "Users can view their own event requests" ON user_requests;
-- DROP POLICY IF EXISTS "Users can manage their own pending event requests" ON user_requests;
-- DROP POLICY IF EXISTS "Users can delete their own pending event requests" ON user_requests;
-- DROP POLICY IF EXISTS "Admins can manage all user requests" ON user_requests;
-- ALTER TABLE user_requests DROP COLUMN IF EXISTS request_type;
-- ALTER TABLE user_requests DROP COLUMN IF EXISTS event_data;
-- ALTER TABLE user_requests DROP COLUMN IF EXISTS requested_by;
-- ALTER TABLE user_requests ALTER COLUMN email SET NOT NULL;

