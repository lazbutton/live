-- ============================================
-- Migration 024 : Ajout du champ external_url_label à la table events
-- Date : 2025-01-XX
-- Description : Ajout du champ external_url_label pour permettre un label personnalisé pour le lien externe
-- ============================================

-- Ajouter la colonne external_url_label à la table events
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS external_url_label TEXT;

-- Commentaire pour documenter la colonne
COMMENT ON COLUMN events.external_url_label IS 'Label personnalisé pour le lien externe de l''événement. Si vide, l''URL sera affichée.';

-- ============================================
-- ROLLBACK (en cas de problème)
-- ============================================

-- Pour annuler cette migration, exécuter :
-- ALTER TABLE events DROP COLUMN IF EXISTS external_url_label;


