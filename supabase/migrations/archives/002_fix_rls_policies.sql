-- ============================================
-- Migration 002 : Correction des politiques RLS
-- Date : 2024-12-XX
-- Description : Correction des politiques RLS qui tentent d'accéder à auth.users
-- ============================================

-- ============================================
-- SUPPRIMER LES ANCIENNES POLITIQUES PROBLÉMATIQUES
-- ============================================

-- Supprimer les politiques qui tentent d'accéder à auth.users
DROP POLICY IF EXISTS "Only admins can manage locations" ON locations;
DROP POLICY IF EXISTS "Only admins can manage organizers" ON organizers;
DROP POLICY IF EXISTS "Admins can manage all events" ON events;
DROP POLICY IF EXISTS "Only admins can manage event organizers" ON event_organizers;

-- ============================================
-- CRÉER UNE FONCTION POUR VÉRIFIER LE RÔLE ADMIN
-- ============================================

-- Fonction pour vérifier si l'utilisateur est admin
-- Note: Pour l'instant, on simplifie en permettant à tous les utilisateurs authentifiés
-- de gérer les ressources. Vous pourrez ajouter un système de rôles plus tard.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Pour l'instant, retourner false (pas de système admin)
  -- Vous pouvez modifier cette fonction plus tard pour vérifier un rôle
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- NOUVELLES POLITIQUES SIMPLIFIÉES
-- ============================================

-- Locations : La politique SELECT existe déjà, on ajoute juste la politique pour les modifications
CREATE POLICY "Authenticated users can manage locations"
  ON locations FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Organizers : La politique SELECT existe déjà, on ajoute juste la politique pour les modifications
CREATE POLICY "Authenticated users can manage organizers"
  ON organizers FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Events : Les politiques existantes sont correctes, on ajoute juste une pour les admins (vide pour l'instant)
-- Les politiques existantes restent :
-- - "Approved events are viewable by everyone"
-- - "Users can view their own events"
-- - "Authenticated users can create events"
-- - "Users can update their own pending events"
-- - "Users can delete their own pending events"

-- Event organizers : La politique SELECT existe déjà, on ajoute juste la politique pour les modifications
CREATE POLICY "Authenticated users can manage event organizers"
  ON event_organizers FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

