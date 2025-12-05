-- ============================================
-- Migration 012 : Ajout de champs aux lieux
-- Date : 2024-12-XX
-- Description : Ajout de champs description, capacité et directions aux lieux
-- ============================================

ALTER TABLE locations
ADD COLUMN IF NOT EXISTS short_description TEXT,
ADD COLUMN IF NOT EXISTS capacity INTEGER,
ADD COLUMN IF NOT EXISTS directions TEXT;

