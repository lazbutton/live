-- ============================================
-- Migration 035 : S'assurer que facebook_url et instagram_url existent dans events
-- Date : 2025-01-XX
-- Description : Migration corrective pour garantir que les colonnes facebook_url et instagram_url existent
-- ============================================

-- Vérifier et ajouter les colonnes si elles n'existent pas
DO $$
BEGIN
    -- Vérifier et ajouter instagram_url
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'events' 
        AND column_name = 'instagram_url'
    ) THEN
        ALTER TABLE events ADD COLUMN instagram_url TEXT;
        COMMENT ON COLUMN events.instagram_url IS 'URL du profil Instagram de l''événement';
    END IF;

    -- Vérifier et ajouter facebook_url
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'events' 
        AND column_name = 'facebook_url'
    ) THEN
        ALTER TABLE events ADD COLUMN facebook_url TEXT;
        COMMENT ON COLUMN events.facebook_url IS 'URL du profil Facebook de l''événement';
    END IF;
END $$;

-- Créer les index s'ils n'existent pas
CREATE INDEX IF NOT EXISTS idx_events_instagram ON events(instagram_url) WHERE instagram_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_facebook ON events(facebook_url) WHERE facebook_url IS NOT NULL;

-- ============================================
-- ROLLBACK (en cas de problème)
-- ============================================

-- Pour annuler cette migration, exécuter :
-- DROP INDEX IF EXISTS idx_events_instagram;
-- DROP INDEX IF EXISTS idx_events_facebook;
-- ALTER TABLE events DROP COLUMN IF EXISTS instagram_url;
-- ALTER TABLE events DROP COLUMN IF EXISTS facebook_url;


