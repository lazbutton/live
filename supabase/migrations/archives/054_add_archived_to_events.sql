-- Migration: Ajout du champ archived aux événements
-- Date: 2025-12-11
-- Description: Ajout d'un champ archived pour marquer les événements passés comme archivés
--              Un cron pourra ensuite archiver automatiquement les événements passés

-- Ajouter la colonne archived (boolean, default false)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false NOT NULL;

-- Créer un index pour optimiser les requêtes filtrant les événements non archivés
CREATE INDEX IF NOT EXISTS idx_events_archived_status 
ON events(archived, status) 
WHERE archived = false AND status = 'approved';

-- Index composite pour les requêtes fréquentes (archived + status + date)
CREATE INDEX IF NOT EXISTS idx_events_archived_status_date 
ON events(archived, status, date) 
WHERE archived = false AND status = 'approved';

-- Commentaire pour documentation
COMMENT ON COLUMN events.archived IS 'Indique si l evenement est archive (true) ou actif (false). Les evenements archives ne sont plus affiches dans l application.';

