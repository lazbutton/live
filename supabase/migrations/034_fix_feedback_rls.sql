-- ============================================
-- Migration 034 : Correction des politiques RLS pour feedback_objects et feedbacks
-- Date : 2025-01-XX
-- Description : Remplacer l'accès direct à auth.users par la fonction is_user_admin()
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

-- ============================================
-- CORRECTION DES POLITIQUES POUR feedback_objects
-- ============================================

-- Supprimer les anciennes politiques
DROP POLICY IF EXISTS "Anyone can view active feedback objects" ON feedback_objects;
DROP POLICY IF EXISTS "Admins can manage feedback objects" ON feedback_objects;

-- Créer les nouvelles politiques utilisant is_user_admin()
CREATE POLICY "Anyone can view active feedback objects"
  ON feedback_objects FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage feedback objects"
  ON feedback_objects FOR ALL
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- ============================================
-- CORRECTION DES POLITIQUES POUR feedbacks
-- ============================================

-- Supprimer les anciennes politiques
DROP POLICY IF EXISTS "Authenticated users can create feedbacks" ON feedbacks;
DROP POLICY IF EXISTS "Users can view their own feedbacks" ON feedbacks;
DROP POLICY IF EXISTS "Users can update their own pending feedbacks" ON feedbacks;
DROP POLICY IF EXISTS "Admins can manage all feedbacks" ON feedbacks;

-- Créer les nouvelles politiques utilisant is_user_admin()
CREATE POLICY "Authenticated users can create feedbacks"
  ON feedbacks FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
  );

CREATE POLICY "Users can view their own feedbacks"
  ON feedbacks FOR SELECT
  USING (
    auth.uid() = user_id
    OR is_user_admin() = true
  );

CREATE POLICY "Users can update their own pending feedbacks"
  ON feedbacks FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status = 'pending'
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
  );

CREATE POLICY "Admins can manage all feedbacks"
  ON feedbacks FOR ALL
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

