-- Migration: Réinitialiser les suggestions de lieux
-- Date: 2025-01-XX
-- Description: Mettre le champ suggested à false pour tous les lieux

UPDATE locations 
SET suggested = false;

COMMENT ON COLUMN locations.suggested IS 'Indique si le lieu est suggere (true) ou non (false). Maximum 6 lieux suggeres affiches dans la recherche.';
