-- ============================================
-- Migration 018 : Ajout du champ end_date à la table events
-- Date : 2025-01-XX
-- Description : Ajout du champ end_date pour stocker la date/heure de fin des événements
-- ============================================

-- Ajouter la colonne end_date à la table events
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE;

-- Commentaire pour documenter la colonne
COMMENT ON COLUMN events.end_date IS 'Date et heure de fin de l''événement (TIMESTAMP WITH TIME ZONE)';

-- Index pour améliorer les performances des requêtes par date de fin
CREATE INDEX IF NOT EXISTS idx_events_end_date ON events(end_date) WHERE end_date IS NOT NULL;

-- ============================================
-- ROLLBACK (en cas de problème)
-- ============================================

-- Pour annuler cette migration, exécuter :
-- DROP INDEX IF EXISTS idx_events_end_date;
-- ALTER TABLE events DROP COLUMN IF EXISTS end_date;

