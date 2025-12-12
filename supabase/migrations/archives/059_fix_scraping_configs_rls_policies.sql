-- ============================================
-- Migration 059 : Correction des politiques RLS pour organizer_scraping_configs
-- Date : 2025-01-XX
-- Description : S'assurer que les politiques RLS existent correctement sans erreur
-- ============================================

-- Supprimer toutes les politiques existantes possibles (idempotent)
DROP POLICY IF EXISTS "Scraping configs are viewable by everyone" ON organizer_scraping_configs;
DROP POLICY IF EXISTS "Only admins can manage scraping configs" ON organizer_scraping_configs;
DROP POLICY IF EXISTS "Authenticated admins can manage scraping configs" ON organizer_scraping_configs;

-- S'assurer que la fonction is_user_admin() existe (déjà créée par la migration 041)
-- Si elle n'existe pas, on la crée
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

-- Recréer les politiques avec la bonne logique
-- Politique : tout le monde peut voir
CREATE POLICY "Scraping configs are viewable by everyone"
  ON organizer_scraping_configs FOR SELECT
  USING (true);

-- Politique : seuls les admins authentifiés peuvent modifier
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

