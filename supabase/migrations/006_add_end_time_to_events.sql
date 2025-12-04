-- ============================================
-- Migration 006 : Ajout du champ end_time à la table events
-- Date : 2024-12-XX
-- Description : Ajout du champ end_time pour stocker l'heure de fin des événements
-- ============================================

-- Ajouter la colonne end_time à la table events
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS end_time TEXT;

-- Commentaire pour documenter la colonne
COMMENT ON COLUMN events.end_time IS 'Heure de fin de l''événement au format HH:MM (ex: 23:30)';

-- ============================================
-- ROLLBACK (en cas de problème)
-- ============================================

-- Pour annuler cette migration, exécuter :
-- ALTER TABLE events DROP COLUMN IF EXISTS end_time;



