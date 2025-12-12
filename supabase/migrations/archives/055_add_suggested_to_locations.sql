-- Migration: Ajout du champ suggested aux lieux
-- Date: 2025-12-11
-- Description: Ajout d'un champ suggested pour marquer les lieux à suggérer à l'utilisateur
--              Maximum 6 lieux suggérés affichés au-dessus de la section collapsible

-- Ajouter la colonne suggested (boolean, default false)
ALTER TABLE locations 
ADD COLUMN IF NOT EXISTS suggested BOOLEAN DEFAULT false NOT NULL;

-- Créer un index pour optimiser les requêtes de lieux suggérés
CREATE INDEX IF NOT EXISTS idx_locations_suggested 
ON locations(suggested) 
WHERE suggested = true;

-- Créer une contrainte pour limiter à 6 lieux suggérés maximum
-- Note: Cette contrainte sera gérée au niveau applicatif, mais on peut ajouter un commentaire
COMMENT ON COLUMN locations.suggested IS 'Indique si le lieu est suggere (true) ou non (false). Maximum 6 lieux suggeres affiches dans la recherche.';

