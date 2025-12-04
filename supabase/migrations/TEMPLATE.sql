-- ============================================
-- Migration XXX : [Titre de la migration]
-- Date : YYYY-MM-DD
-- Auteur : [Votre nom]
-- Description : [Description détaillée]
-- ============================================

-- ============================================
-- CHANGEMENTS
-- ============================================

-- [Décrire ce qui change]
-- Exemple :
-- - Ajout de la colonne "views_count" à "events"
-- - Création de l'index "idx_events_views_count"

-- ============================================
-- CODE SQL
-- ============================================

-- Votre code SQL ici
-- Exemple :
-- ALTER TABLE events ADD COLUMN views_count INTEGER DEFAULT 0;
-- CREATE INDEX idx_events_views_count ON events(views_count);

-- ============================================
-- ROLLBACK (optionnel)
-- ============================================

-- En cas de problème, comment annuler cette migration
-- Exemple :
-- ALTER TABLE events DROP COLUMN views_count;
-- DROP INDEX IF EXISTS idx_events_views_count;

