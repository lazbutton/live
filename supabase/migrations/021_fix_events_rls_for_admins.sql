-- ============================================
-- Migration 021 : Correction des politiques RLS pour events pour permettre aux admins de créer des événements
-- Date : 2025-01-XX
-- Description : S'assurer que les admins peuvent créer et gérer tous les événements
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

-- Supprimer l'ancienne politique pour les admins si elle existe
DROP POLICY IF EXISTS "Admins can manage all events" ON events;

-- Créer des politiques distinctes pour chaque opération pour les admins

-- Politique SELECT pour les admins (voir tous les événements)
CREATE POLICY "Admins can view all events"
  ON events FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Politique INSERT pour les admins (créer des événements)
CREATE POLICY "Admins can create events"
  ON events FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Politique UPDATE pour les admins (modifier tous les événements)
CREATE POLICY "Admins can update all events"
  ON events FOR UPDATE
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Politique DELETE pour les admins (supprimer tous les événements)
CREATE POLICY "Admins can delete all events"
  ON events FOR DELETE
  USING (
    auth.uid() IS NOT NULL 
    AND is_user_admin() = true
  );

-- Note: Les autres politiques (pour les utilisateurs normaux) restent en place
-- car elles utilisent des conditions différentes (created_by = auth.uid() AND status = 'pending')

