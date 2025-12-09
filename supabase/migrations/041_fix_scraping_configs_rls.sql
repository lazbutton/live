-- ============================================
-- Migration 041 : Correction des politiques RLS pour organizer_scraping_configs
-- Date : 2025-12-XX
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

-- Supprimer l'ancienne politique qui utilise un accès direct à auth.users
DROP POLICY IF EXISTS "Only admins can manage scraping configs" ON organizer_scraping_configs;

-- Créer la nouvelle politique utilisant is_user_admin()
CREATE POLICY "Authenticated admins can manage scraping configs"
  ON organizer_scraping_configs FOR ALL
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- La politique SELECT existe déjà et permet à tout le monde de voir
-- On peut la garder ou la modifier selon les besoins
-- Pour l'instant, on la garde comme elle est




