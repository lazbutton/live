-- ============================================
-- Migration 017 : Correction des conflits de politiques RLS pour user_requests
-- Date : 2025-01-XX
-- Description : S'assurer que les admins peuvent bien mettre à jour les user_requests
-- ============================================

-- S'assurer que la fonction is_user_admin() existe
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

-- Supprimer toutes les anciennes politiques qui peuvent entrer en conflit
DROP POLICY IF EXISTS "Authenticated admins can manage user requests" ON user_requests;
DROP POLICY IF EXISTS "Admins can manage all user requests" ON user_requests;

-- Créer des politiques distinctes pour chaque opération pour les admins

-- Politique SELECT pour les admins
DROP POLICY IF EXISTS "Authenticated admins can view user requests" ON user_requests;
CREATE POLICY "Authenticated admins can view user requests"
  ON user_requests FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Politique INSERT pour les admins
CREATE POLICY "Authenticated admins can insert user requests"
  ON user_requests FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Politique UPDATE pour les admins (prioritaire)
CREATE POLICY "Authenticated admins can update user requests"
  ON user_requests FOR UPDATE
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Politique DELETE pour les admins
CREATE POLICY "Authenticated admins can delete user requests"
  ON user_requests FOR DELETE
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Les autres politiques (pour les utilisateurs normaux) restent en place
-- car elles utilisent des conditions différentes (requested_by = auth.uid() AND status = 'pending')

