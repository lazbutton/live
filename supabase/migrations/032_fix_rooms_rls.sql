-- ============================================
-- Migration 032 : Correction des politiques RLS pour les salles
-- Date : 2025-01-XX
-- Description : Corriger les politiques RLS pour utiliser is_user_admin() au lieu d'accès direct à auth.users
-- ============================================

-- Supprimer l'ancienne politique qui utilise un accès direct à auth.users
DROP POLICY IF EXISTS "Only admins can manage rooms" ON rooms;

-- Créer la nouvelle politique utilisant is_user_admin()
-- Note: Cette fonction doit être créée par la migration 005
CREATE POLICY "Only admins can manage rooms"
  ON rooms FOR ALL
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

