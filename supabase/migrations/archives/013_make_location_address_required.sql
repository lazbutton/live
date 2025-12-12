-- ============================================
-- Migration 013 : Adresse obligatoire pour les lieux
-- Date : 2024-12-XX
-- Description : Rend l'adresse obligatoire pour les lieux
-- ============================================

-- D'abord, mettre à jour les lieux existants sans adresse
UPDATE locations
SET address = 'Adresse non renseignée'
WHERE address IS NULL OR address = '';

-- Ensuite, rendre la colonne NOT NULL
ALTER TABLE locations
ALTER COLUMN address SET NOT NULL;

