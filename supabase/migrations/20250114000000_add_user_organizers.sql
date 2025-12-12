--
-- Migration: Ajout du système d'organisateurs utilisateurs
-- Description: Crée la table user_organizers, ajoute les fonctions et politiques RLS nécessaires
-- Date: 2025-01-14
--

-- ============================================================================
-- 1. CRÉER LA TABLE user_organizers
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_organizers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organizer_id uuid NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    role text DEFAULT 'owner' CHECK (role IN ('owner', 'editor', 'viewer')),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(user_id, organizer_id)
);

COMMENT ON TABLE public.user_organizers IS 'Table de liaison entre utilisateurs et organisateurs avec gestion des rôles';
COMMENT ON COLUMN public.user_organizers.role IS 'Rôle de l''utilisateur: owner (propriétaire), editor (éditeur), viewer (visualiseur)';

-- ============================================================================
-- 2. AJOUTER user_id À LA TABLE organizers (optionnel)
-- ============================================================================

-- Ajouter la colonne user_id si elle n'existe pas déjà
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'organizers' 
        AND column_name = 'user_id'
    ) THEN
        ALTER TABLE organizers 
        ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
        
        COMMENT ON COLUMN organizers.user_id IS 'ID de l''utilisateur propriétaire principal de l''organisateur (optionnel)';
    END IF;
END $$;

-- ============================================================================
-- 3. CRÉER LES INDEX POUR LES PERFORMANCES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_organizers_user_id ON user_organizers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_organizers_organizer_id ON user_organizers(organizer_id);
CREATE INDEX IF NOT EXISTS idx_organizers_user_id ON organizers(user_id) WHERE user_id IS NOT NULL;

-- ============================================================================
-- 4. CRÉER LA FONCTION is_user_organizer
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_user_organizer(organizer_uuid uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  user_uuid uuid;
BEGIN
  user_uuid := auth.uid();
  IF user_uuid IS NULL THEN
    RETURN false;
  END IF;
  
  -- Si un organizer_id est fourni, vérifier si l'utilisateur est lié à cet organisateur
  IF organizer_uuid IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_organizers
      WHERE user_id = user_uuid
        AND organizer_id = organizer_uuid
    );
  END IF;
  
  -- Sinon, vérifier si l'utilisateur est lié à au moins un organisateur
  RETURN EXISTS (
    SELECT 1 FROM user_organizers
    WHERE user_id = user_uuid
  );
END;
$$;

COMMENT ON FUNCTION public.is_user_organizer(uuid) IS 'Vérifie si l''utilisateur connecté est organisateur (pour un organisateur spécifique ou en général)';

-- ============================================================================
-- 5. CRÉER UN TRIGGER POUR updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_user_organizers_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Supprimer le trigger s'il existe déjà, puis le créer
DROP TRIGGER IF EXISTS update_user_organizers_updated_at ON user_organizers;

CREATE TRIGGER update_user_organizers_updated_at
BEFORE UPDATE ON user_organizers
FOR EACH ROW
EXECUTE FUNCTION update_user_organizers_updated_at();

-- ============================================================================
-- 6. POLITIQUES RLS POUR user_organizers
-- ============================================================================

-- Activer RLS sur la table
ALTER TABLE user_organizers ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir leurs propres associations
DROP POLICY IF EXISTS "Users can view their own organizer associations" ON user_organizers;
CREATE POLICY "Users can view their own organizer associations"
ON user_organizers FOR SELECT
USING (auth.uid() = user_id);

-- Les admins peuvent tout voir
DROP POLICY IF EXISTS "Admins can view all organizer associations" ON user_organizers;
CREATE POLICY "Admins can view all organizer associations"
ON user_organizers FOR SELECT
USING (is_user_admin());

-- Seuls les admins peuvent créer/modifier/supprimer
DROP POLICY IF EXISTS "Admins can manage organizer associations" ON user_organizers;
CREATE POLICY "Admins can manage organizer associations"
ON user_organizers FOR ALL
USING (is_user_admin())
WITH CHECK (is_user_admin());

-- ============================================================================
-- 7. METTRE À JOUR LES POLITIQUES RLS DES ÉVÉNEMENTS
-- ============================================================================

-- Politique pour permettre aux organisateurs de voir leurs événements
DROP POLICY IF EXISTS "Organizers can view their events" ON events;
CREATE POLICY "Organizers can view their events"
ON events FOR SELECT
USING (
  is_user_admin() OR
  EXISTS (
    SELECT 1 FROM event_organizers eo
    JOIN user_organizers uo ON (
      (eo.organizer_id = uo.organizer_id) OR
      (eo.location_id IN (
        SELECT id FROM locations 
        WHERE is_organizer = true 
        AND id IN (
          SELECT organizer_id FROM user_organizers WHERE user_id = auth.uid()
        )
      ))
    )
    WHERE eo.event_id = events.id
    AND uo.user_id = auth.uid()
  )
);

-- Politique pour permettre aux organisateurs de créer des événements
-- Note: Cette politique utilise une approche différente car event_organizers
-- est créé après l'événement. On vérifie que l'utilisateur peut créer pour
-- au moins un de ses organisateurs.
DROP POLICY IF EXISTS "Organizers can create events for their organizers" ON events;
CREATE POLICY "Organizers can create events for their organizers"
ON events FOR INSERT
WITH CHECK (
  is_user_admin() OR
  (
    auth.uid() = created_by 
    AND status IN ('pending', 'draft')
    AND EXISTS (
      SELECT 1 FROM user_organizers
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'editor')
    )
  )
);

-- Politique pour permettre aux organisateurs d'éditer leurs événements
DROP POLICY IF EXISTS "Organizers can update their events" ON events;
CREATE POLICY "Organizers can update their events"
ON events FOR UPDATE
USING (
  is_user_admin() OR
  (
    status IN ('draft', 'pending', 'approved') AND
    EXISTS (
      SELECT 1 FROM event_organizers eo
      JOIN user_organizers uo ON (
        eo.organizer_id = uo.organizer_id OR
        eo.location_id IN (
          SELECT id FROM locations 
          WHERE is_organizer = true 
          AND id IN (
            SELECT organizer_id FROM user_organizers WHERE user_id = auth.uid()
          )
        )
      )
      WHERE eo.event_id = events.id
      AND uo.user_id = auth.uid()
      AND uo.role IN ('owner', 'editor')
    )
  )
)
WITH CHECK (
  is_user_admin() OR
  (
    status IN ('draft', 'pending', 'approved') AND
    EXISTS (
      SELECT 1 FROM event_organizers eo
      JOIN user_organizers uo ON (
        eo.organizer_id = uo.organizer_id OR
        eo.location_id IN (
          SELECT id FROM locations 
          WHERE is_organizer = true 
          AND id IN (
            SELECT organizer_id FROM user_organizers WHERE user_id = auth.uid()
          )
        )
      )
      WHERE eo.event_id = events.id
      AND uo.user_id = auth.uid()
      AND uo.role IN ('owner', 'editor')
    )
  )
);

-- Politique pour permettre aux organisateurs de supprimer leurs événements en attente
DROP POLICY IF EXISTS "Organizers can delete their pending events" ON events;
CREATE POLICY "Organizers can delete their pending events"
ON events FOR DELETE
USING (
  is_user_admin() OR
  (
    status IN ('draft', 'pending') AND
    EXISTS (
      SELECT 1 FROM event_organizers eo
      JOIN user_organizers uo ON (
        eo.organizer_id = uo.organizer_id OR
        eo.location_id IN (
          SELECT id FROM locations 
          WHERE is_organizer = true 
          AND id IN (
            SELECT organizer_id FROM user_organizers WHERE user_id = auth.uid()
          )
        )
      )
      WHERE eo.event_id = events.id
      AND uo.user_id = auth.uid()
      AND uo.role = 'owner'
    )
  )
);

-- ============================================================================
-- 8. METTRE À JOUR LES POLITIQUES RLS DES ORGANISATEURS
-- ============================================================================

-- Politique pour permettre aux organisateurs de voir leurs organisateurs
DROP POLICY IF EXISTS "Organizers can view their organizers" ON organizers;
CREATE POLICY "Organizers can view their organizers"
ON organizers FOR SELECT
USING (
  is_user_admin() OR
  EXISTS (
    SELECT 1 FROM user_organizers
    WHERE organizer_id = organizers.id
    AND user_id = auth.uid()
  )
);

-- Politique pour permettre aux organisateurs propriétaires d'éditer leurs organisateurs
DROP POLICY IF EXISTS "Organizers owners can update their organizers" ON organizers;
CREATE POLICY "Organizers owners can update their organizers"
ON organizers FOR UPDATE
USING (
  is_user_admin() OR
  EXISTS (
    SELECT 1 FROM user_organizers
    WHERE organizer_id = organizers.id
    AND user_id = auth.uid()
    AND role = 'owner'
  )
)
WITH CHECK (
  is_user_admin() OR
  EXISTS (
    SELECT 1 FROM user_organizers
    WHERE organizer_id = organizers.id
    AND user_id = auth.uid()
    AND role = 'owner'
  )
);

