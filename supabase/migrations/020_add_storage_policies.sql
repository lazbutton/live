-- ============================================
-- Migration 020 : Ajout des politiques RLS pour les buckets de stockage
-- Date : 2025-01-XX
-- Description : Créer les politiques RLS pour permettre aux admins d'uploader des images
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
-- BUCKET: event-images
-- ============================================

-- Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS "Admins can upload event images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update event images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete event images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view event images" ON storage.objects;

-- Politique : Les admins peuvent uploader des images d'événements
CREATE POLICY "Admins can upload event images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-images'
    AND auth.uid() IS NOT NULL
    AND is_user_admin() = true
  );

-- Politique : Les admins peuvent mettre à jour les images d'événements
CREATE POLICY "Admins can update event images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'event-images'
    AND auth.uid() IS NOT NULL
    AND is_user_admin() = true
  );

-- Politique : Les admins peuvent supprimer les images d'événements
CREATE POLICY "Admins can delete event images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'event-images'
    AND auth.uid() IS NOT NULL
    AND is_user_admin() = true
  );

-- Politique : Tout le monde peut voir les images d'événements (bucket public)
CREATE POLICY "Public can view event images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-images');

-- ============================================
-- BUCKET: locations-images
-- ============================================

-- Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS "Admins can upload location images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update location images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete location images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view location images" ON storage.objects;

-- Politique : Les admins peuvent uploader des images de lieux
CREATE POLICY "Admins can upload location images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'locations-images'
    AND auth.uid() IS NOT NULL
    AND is_user_admin() = true
  );

-- Politique : Les admins peuvent mettre à jour les images de lieux
CREATE POLICY "Admins can update location images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'locations-images'
    AND auth.uid() IS NOT NULL
    AND is_user_admin() = true
  );

-- Politique : Les admins peuvent supprimer les images de lieux
CREATE POLICY "Admins can delete location images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'locations-images'
    AND auth.uid() IS NOT NULL
    AND is_user_admin() = true
  );

-- Politique : Tout le monde peut voir les images de lieux (bucket public)
CREATE POLICY "Public can view location images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'locations-images');

-- ============================================
-- BUCKET: organizers-images
-- ============================================

-- Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS "Admins can upload organizer images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update organizer images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete organizer images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view organizer images" ON storage.objects;

-- Politique : Les admins peuvent uploader des images d'organisateurs
CREATE POLICY "Admins can upload organizer images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'organizers-images'
    AND auth.uid() IS NOT NULL
    AND is_user_admin() = true
  );

-- Politique : Les admins peuvent mettre à jour les images d'organisateurs
CREATE POLICY "Admins can update organizer images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'organizers-images'
    AND auth.uid() IS NOT NULL
    AND is_user_admin() = true
  );

-- Politique : Les admins peuvent supprimer les images d'organisateurs
CREATE POLICY "Admins can delete organizer images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'organizers-images'
    AND auth.uid() IS NOT NULL
    AND is_user_admin() = true
  );

-- Politique : Tout le monde peut voir les images d'organisateurs (bucket public)
CREATE POLICY "Public can view organizer images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'organizers-images');

