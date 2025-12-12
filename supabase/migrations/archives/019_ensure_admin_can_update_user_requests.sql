-- ============================================
-- Migration 019 : S'assurer que les admins peuvent mettre à jour les user_requests
-- Date : 2025-01-XX
-- Description : Corriger définitivement les politiques RLS pour permettre aux admins de mettre à jour les demandes
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

-- Supprimer TOUTES les politiques qui pourraient entrer en conflit
DROP POLICY IF EXISTS "Authenticated admins can manage user requests" ON user_requests;
DROP POLICY IF EXISTS "Admins can manage all user requests" ON user_requests;
DROP POLICY IF EXISTS "Authenticated admins can view user requests" ON user_requests;
DROP POLICY IF EXISTS "Authenticated admins can insert user requests" ON user_requests;
DROP POLICY IF EXISTS "Authenticated admins can update user requests" ON user_requests;
DROP POLICY IF EXISTS "Authenticated admins can delete user requests" ON user_requests;

-- Recréer les politiques pour les admins dans le bon ordre
-- IMPORTANT: Les politiques UPDATE doivent être créées avant les politiques utilisateur
-- pour qu'elles prennent priorité

-- Politique SELECT pour les admins
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

-- Politique UPDATE pour les admins - PRIORITAIRE
-- Cette politique doit permettre aux admins de mettre à jour n'importe quelle demande
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

-- Vérifier que les politiques utilisateur existent toujours (elles ne doivent pas être supprimées)
-- Ces politiques permettent aux utilisateurs de gérer leurs propres demandes en attente
-- Elles coexistent avec les politiques admin car elles ont des conditions différentes

-- Note: Les politiques suivantes doivent exister (créées dans les migrations 007 et 008):
-- - "Authenticated users can create event requests" (INSERT)
-- - "Users can view their own event requests" (SELECT)
-- - "Users can manage their own pending event requests" (UPDATE)
-- - "Users can delete their own pending event requests" (DELETE)

-- Si elles n'existent pas, elles seront créées automatiquement par leurs migrations respectives

