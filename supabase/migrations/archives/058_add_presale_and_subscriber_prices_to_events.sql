-- ============================================
-- Migration 058 : Ajout des tarifs prévente et abonnés aux événements
-- Date : 2025-01-XX
-- Description : Ajouter des champs pour les tarifs prévente et abonnés
-- ============================================

-- Ajouter les colonnes pour les tarifs prévente et abonnés
ALTER TABLE events
ADD COLUMN IF NOT EXISTS presale_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS subscriber_price DECIMAL(10, 2);

-- Commentaires
COMMENT ON COLUMN events.presale_price IS 'Tarif prévente de l''événement (optionnel)';
COMMENT ON COLUMN events.subscriber_price IS 'Tarif pour les abonnés (optionnel)';



