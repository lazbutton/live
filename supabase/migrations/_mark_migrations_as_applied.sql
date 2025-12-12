-- ============================================
-- Script : Marquer les migrations comme déjà appliquées
-- Date : 2025-01-15
-- Description : Ce script marque toutes les migrations existantes comme déjà appliquées
--               dans la table supabase_migrations.schema_migrations.
--               À utiliser après avoir appliqué manuellement les migrations via SQL Editor.
-- ============================================
--
-- ⚠️ IMPORTANT : Exécutez ce script UNE SEULE FOIS après avoir appliqué toutes les migrations
--    manuellement via le SQL Editor. Cela permettra à `supabase db push` de savoir que
--    ces migrations ont déjà été appliquées.
--
-- ============================================
-- CODE SQL
-- ============================================

-- Créer la table de tracking des migrations si elle n'existe pas
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version TEXT PRIMARY KEY,
    statements TEXT[],
    name TEXT
);

-- Insérer toutes les migrations existantes comme déjà appliquées
-- Seules les migrations dans le dossier supabase/migrations/ (pas archives/)
-- Le format de Supabase CLI utilise le timestamp comme version
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES 
    ('20251212120000', ARRAY[]::TEXT[], 'baseline'),
    ('20250114000000', ARRAY[]::TEXT[], 'add_user_organizers'),
    ('20250114000001', ARRAY[]::TEXT[], 'add_organizer_invitations'),
    ('20250115000000', ARRAY[]::TEXT[], 'add_draft_status_to_events'),
    ('20250115000001', ARRAY[]::TEXT[], 'link_existing_organizers_to_users'),
    ('20250115000002', ARRAY[]::TEXT[], 'allow_location_organizers_in_user_organizers'),
    ('20250115000003', ARRAY[]::TEXT[], 'allow_location_organizers_in_invitations')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

-- Vérification : Afficher les migrations enregistrées
SELECT version, name
FROM supabase_migrations.schema_migrations 
ORDER BY version;

