-- ============================================
-- Migration 030 : Permettre aux lieux d'être aussi des organisateurs
-- Date : 2025-01-XX
-- Description : Ajouter le champ is_organizer aux lieux et modifier event_organizers pour accepter les lieux
-- ============================================

-- Ajouter le champ is_organizer aux lieux
ALTER TABLE locations
ADD COLUMN IF NOT EXISTS is_organizer BOOLEAN DEFAULT false;

-- Modifier la table event_organizers pour accepter location_id en plus de organizer_id
ALTER TABLE event_organizers
ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE CASCADE;

-- Ajouter une contrainte pour s'assurer qu'un événement-organisateur a soit un organizer_id, soit un location_id, mais pas les deux
ALTER TABLE event_organizers
ADD CONSTRAINT event_organizers_exactly_one_organizer 
  CHECK (
    (organizer_id IS NOT NULL AND location_id IS NULL) OR 
    (organizer_id IS NULL AND location_id IS NOT NULL)
  );

-- Supprimer la contrainte PRIMARY KEY existante si elle existe
ALTER TABLE event_organizers
DROP CONSTRAINT IF EXISTS event_organizers_pkey;

-- Créer une nouvelle clé primaire composite qui inclut event_id, organizer_id et location_id (avec NULL)
-- Note: PostgreSQL ne permet pas directement une PK avec NULL, donc on utilise un index unique
CREATE UNIQUE INDEX IF NOT EXISTS event_organizers_unique_event_organizer 
  ON event_organizers(event_id, organizer_id) 
  WHERE organizer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_organizers_unique_event_location 
  ON event_organizers(event_id, location_id) 
  WHERE location_id IS NOT NULL;

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_event_organizers_location ON event_organizers(location_id) WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_locations_is_organizer ON locations(is_organizer) WHERE is_organizer = true;

-- Commentaires
COMMENT ON COLUMN locations.is_organizer IS 'Indique si ce lieu peut aussi être utilisé comme organisateur';
COMMENT ON COLUMN event_organizers.location_id IS 'ID du lieu utilisé comme organisateur (mutuellement exclusif avec organizer_id)';

