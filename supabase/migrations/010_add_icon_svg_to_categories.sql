-- ============================================
-- Migration 010 : Ajout du champ icon_svg à la table categories
-- Date : 2024-12-XX
-- Description : Ajouter un champ icon_svg pour stocker les icônes SVG des catégories
-- ============================================

-- Ajouter la colonne icon_svg à la table categories
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS icon_svg TEXT;

-- Commentaire pour documenter
COMMENT ON COLUMN categories.icon_svg IS 'Icône SVG de la catégorie (format SVG en texte)';

-- ============================================
-- ROLLBACK (en cas de problème)
-- ============================================

-- Pour annuler cette migration, exécuter :
-- ALTER TABLE categories DROP COLUMN IF EXISTS icon_svg;

