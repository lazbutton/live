-- ============================================
-- Migration 005 : Correction des politiques RLS pour user_requests
-- Date : 2024-12-XX
-- Description : Simplification des politiques RLS pour user_requests
-- ============================================

-- Supprimer les anciennes politiques qui utilisent auth.users
DROP POLICY IF EXISTS "Only admins can view user requests" ON user_requests;
DROP POLICY IF EXISTS "Only admins can manage user requests" ON user_requests;

-- Créer une fonction helper pour vérifier si l'utilisateur est admin
-- Cette fonction vérifie dans les métadonnées utilisateur de manière sécurisée
CREATE OR REPLACE FUNCTION is_user_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Récupérer le rôle de l'utilisateur connecté
  SELECT raw_user_meta_data->>'role' INTO user_role
  FROM auth.users
  WHERE id = auth.uid();
  
  -- Retourner true si le rôle est 'admin'
  RETURN COALESCE(user_role = 'admin', false);
END;
$$;

-- Nouvelle politique simplifiée pour SELECT (lecture)
CREATE POLICY "Authenticated admins can view user requests"
  ON user_requests FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Nouvelle politique simplifiée pour INSERT, UPDATE, DELETE
CREATE POLICY "Authenticated admins can manage user requests"
  ON user_requests FOR ALL
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

