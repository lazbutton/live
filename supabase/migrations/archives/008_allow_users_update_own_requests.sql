-- ============================================
-- Migration 008 : Permettre aux utilisateurs de modifier leurs demandes
-- Date : 2024-12-XX
-- Description : Ajouter des politiques pour permettre aux utilisateurs de modifier/supprimer leurs propres demandes en attente
-- ============================================

-- Les politiques ont déjà été ajoutées dans la migration 007, mais si elles n'existent pas, les créer

-- Politique pour permettre aux utilisateurs de modifier leurs propres demandes en attente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_requests' 
    AND policyname = 'Users can manage their own pending event requests'
  ) THEN
    CREATE POLICY "Users can manage their own pending event requests"
      ON user_requests FOR UPDATE
      USING (
        request_type = 'event_creation' 
        AND requested_by = auth.uid()
        AND status = 'pending'
      )
      WITH CHECK (
        request_type = 'event_creation' 
        AND requested_by = auth.uid()
        AND status = 'pending'
      );
  END IF;
END $$;

-- Politique pour permettre aux utilisateurs de supprimer leurs propres demandes en attente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_requests' 
    AND policyname = 'Users can delete their own pending event requests'
  ) THEN
    CREATE POLICY "Users can delete their own pending event requests"
      ON user_requests FOR DELETE
      USING (
        request_type = 'event_creation' 
        AND requested_by = auth.uid()
        AND status = 'pending'
      );
  END IF;
END $$;



