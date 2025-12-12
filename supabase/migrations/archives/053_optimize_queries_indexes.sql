-- Migration: Optimisation des requêtes avec index
-- Date: 2025-12-11
-- Description: Ajout d'index pour optimiser les requêtes fréquentes

-- Index pour les requêtes d'événements par statut et date
-- Utilisé dans EventService.getApprovedEvents()
CREATE INDEX IF NOT EXISTS idx_events_status_date 
ON events(status, date) 
WHERE status = 'approved';

-- Index pour les événements en cours (avec end_date)
-- Utilisé pour filtrer les événements multi-jours
CREATE INDEX IF NOT EXISTS idx_events_status_end_date 
ON events(status, end_date) 
WHERE status = 'approved' AND end_date IS NOT NULL;

-- Index composite pour les catégories actives triées
-- Utilisé dans CategoryService.getActiveCategories()
CREATE INDEX IF NOT EXISTS idx_categories_active_order 
ON categories(is_active, display_order) 
WHERE is_active = true;

-- Index pour les événements par catégorie (si utilisé dans des requêtes)
-- Note: La colonne s'appelle 'category' (TEXT), pas 'category_id'
CREATE INDEX IF NOT EXISTS idx_events_category_status 
ON events(category, status) 
WHERE status = 'approved';

-- Index pour les événements par lieu (si utilisé dans des requêtes)
CREATE INDEX IF NOT EXISTS idx_events_location_status 
ON events(location_id, status) 
WHERE status = 'approved';

-- Index pour les tokens push par utilisateur
-- Utilisé dans les requêtes de notifications
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id 
ON user_push_tokens(user_id);

-- Index pour les préférences de notifications par utilisateur
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id 
ON user_notification_preferences(user_id);

-- Index pour les événements cachés par utilisateur
CREATE INDEX IF NOT EXISTS idx_user_hidden_events_user_id 
ON user_hidden_events(user_id);

-- Index pour les likes d'événements par utilisateur
CREATE INDEX IF NOT EXISTS idx_event_likes_user_id 
ON event_likes(user_id);

-- Index pour les notifications d'événements par utilisateur
CREATE INDEX IF NOT EXISTS idx_event_notifications_user_id 
ON event_notifications(user_id);

-- Commentaires pour documentation (sans accents pour eviter les problemes d'encodage)
COMMENT ON INDEX idx_events_status_date IS 'Optimise les requetes devenements approuves tries par date';
COMMENT ON INDEX idx_events_status_end_date IS 'Optimise les requetes devenements en cours (multi-jours)';
COMMENT ON INDEX idx_categories_active_order IS 'Optimise les requetes de categories actives triees';
COMMENT ON INDEX idx_events_category_status IS 'Optimise les filtres par categorie';
COMMENT ON INDEX idx_events_location_status IS 'Optimise les filtres par lieu';

