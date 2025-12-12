-- ============================================
-- Migration 057 : Ajout du champ is_full aux événements
-- Date : 2025-01-XX
-- Description : Ajouter un champ pour indiquer si un événement est complet (sold out)
-- ============================================

-- Ajouter la colonne is_full aux événements
ALTER TABLE events
ADD COLUMN IF NOT EXISTS is_full BOOLEAN DEFAULT false;

-- Index pour améliorer les recherches d'événements non complets
CREATE INDEX IF NOT EXISTS idx_events_is_full ON events(is_full) WHERE is_full = false;

-- Index composite pour les requêtes fréquentes (status + is_full + date)
CREATE INDEX IF NOT EXISTS idx_events_status_is_full_date 
ON events(status, is_full, date) 
WHERE status = 'approved' AND is_full = false;

-- Commentaire
COMMENT ON COLUMN events.is_full IS 'Indique si l''événement est complet (sold out). Par défaut false.';



