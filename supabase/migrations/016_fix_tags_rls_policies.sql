-- ============================================
-- Migration 016 : Correction des politiques RLS pour les tags
-- Date : 2025-01-XX
-- Description : Utilisation de la fonction is_user_admin() pour les politiques RLS des tags
-- ============================================

-- S'assurer que la fonction is_user_admin() existe (créée dans la migration 005)
-- Si elle n'existe pas, la créer
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

-- Supprimer l'ancienne politique si elle existe
DROP POLICY IF EXISTS "Only admins can manage tags" ON tags;
DROP POLICY IF EXISTS "Only admins can insert tags" ON tags;
DROP POLICY IF EXISTS "Only admins can update tags" ON tags;
DROP POLICY IF EXISTS "Only admins can delete tags" ON tags;

-- Politique : Seuls les admins peuvent créer des tags
CREATE POLICY "Only admins can insert tags"
  ON tags FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Politique : Seuls les admins peuvent modifier des tags
CREATE POLICY "Only admins can update tags"
  ON tags FOR UPDATE
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Politique : Seuls les admins peuvent supprimer des tags
CREATE POLICY "Only admins can delete tags"
  ON tags FOR DELETE
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

