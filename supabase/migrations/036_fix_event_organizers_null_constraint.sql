-- ============================================
-- Migration 036 : Permettre NULL sur organizer_id dans event_organizers
-- Date : 2025-01-XX
-- Description : Corriger la contrainte NOT NULL sur organizer_id pour permettre les lieux comme organisateurs
-- ============================================

-- Permettre NULL sur organizer_id car un organisateur peut être soit un organizer_id, soit un location_id
ALTER TABLE event_organizers
ALTER COLUMN organizer_id DROP NOT NULL;

-- S'assurer que la contrainte CHECK existe pour garantir qu'au moins un des deux est non NULL
DO $$
BEGIN
    -- Vérifier si la contrainte existe déjà
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'event_organizers_exactly_one_organizer'
    ) THEN
        ALTER TABLE event_organizers
        ADD CONSTRAINT event_organizers_exactly_one_organizer 
          CHECK (
            (organizer_id IS NOT NULL AND location_id IS NULL) OR 
            (organizer_id IS NULL AND location_id IS NOT NULL)
          );
    END IF;
END $$;

-- ============================================
-- ROLLBACK (en cas de problème)
-- ============================================

-- Pour annuler cette migration, exécuter :
-- ALTER TABLE event_organizers DROP CONSTRAINT IF EXISTS event_organizers_exactly_one_organizer;
-- ALTER TABLE event_organizers ALTER COLUMN organizer_id SET NOT NULL;



