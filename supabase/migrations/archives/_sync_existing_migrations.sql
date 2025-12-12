-- Script pour marquer les migrations existantes comme appliquées
-- Exécutez ce script dans Supabase SQL Editor APRÈS avoir lié votre projet avec supabase link
-- 
-- Ce script insère les migrations existantes dans la table schema_migrations
-- pour que Supabase CLI reconnaisse qu'elles ont déjà été appliquées

-- ⚠️ IMPORTANT : 
-- - Exécutez ce script UNE SEULE FOIS
-- - Ne l'exécutez que si toutes ces migrations ont déjà été appliquées manuellement
-- - Vérifiez d'abord quelles migrations sont déjà dans schema_migrations

-- Vérifier les migrations déjà enregistrées (exécutez d'abord cette requête)
-- SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC;

-- Marquer les migrations comme appliquées
-- Le timestamp (version) doit être unique et croissant
-- Format: YYYYMMDDHHMMSS (année, mois, jour, heure, minute, seconde)

-- Migration 001
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000001', '001_initial_schema')
ON CONFLICT (version) DO NOTHING;

-- Migration 002
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000002', '002_fix_rls_policies')
ON CONFLICT (version) DO NOTHING;

-- Migration 003
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000003', '003_user_requests')
ON CONFLICT (version) DO NOTHING;

-- Migration 004
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000004', '004_create_admin_function')
ON CONFLICT (version) DO NOTHING;

-- Migration 005
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000005', '005_fix_user_requests_rls')
ON CONFLICT (version) DO NOTHING;

-- Migration 006
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000006', '006_add_end_time_to_events')
ON CONFLICT (version) DO NOTHING;

-- Migration 007
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000007', '007_extend_user_requests_for_events')
ON CONFLICT (version) DO NOTHING;

-- Migration 008
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000008', '008_allow_users_update_own_requests')
ON CONFLICT (version) DO NOTHING;

-- Migration 009
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000009', '009_create_categories_table')
ON CONFLICT (version) DO NOTHING;

-- Migration 010
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000010', '010_add_icon_svg_to_categories')
ON CONFLICT (version) DO NOTHING;

-- Migration 011
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000011', '011_add_convert_event_request_function')
ON CONFLICT (version) DO NOTHING;

-- Migration 012
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000012', '012_add_location_fields')
ON CONFLICT (version) DO NOTHING;

-- Migration 013
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000013', '013_make_location_address_required')
ON CONFLICT (version) DO NOTHING;

-- Migration 014
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000014', '014_add_tags_to_events')
ON CONFLICT (version) DO NOTHING;

-- Migration 015
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000015', '015_create_storage_buckets')
ON CONFLICT (version) DO NOTHING;

-- Migration 016
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000016', '016_fix_tags_rls_policies')
ON CONFLICT (version) DO NOTHING;

-- Migration 017
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000017', '017_fix_user_requests_rls_conflicts')
ON CONFLICT (version) DO NOTHING;

-- Migration 018
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000018', '018_add_end_date_to_events')
ON CONFLICT (version) DO NOTHING;

-- Migration 019
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000019', '019_ensure_admin_can_update_user_requests')
ON CONFLICT (version) DO NOTHING;

-- Migration 020
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000020', '020_add_storage_policies')
ON CONFLICT (version) DO NOTHING;

-- Migration 021
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000021', '021_fix_events_rls_for_admins')
ON CONFLICT (version) DO NOTHING;

-- Migration 022
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000022', '022_create_feedback_tables')
ON CONFLICT (version) DO NOTHING;

-- Migration 023
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000023', '023_add_social_media_to_organizers')
ON CONFLICT (version) DO NOTHING;

-- Migration 024
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20240101000024', '024_add_external_url_label_to_events')
ON CONFLICT (version) DO NOTHING;

-- Migration avec timestamp (si applicable)
-- Remplacez le timestamp par celui du fichier 20251206102919_new-migration.sql
INSERT INTO supabase_migrations.schema_migrations (version, name) 
VALUES ('20251206102919', '20251206102919_new-migration')
ON CONFLICT (version) DO NOTHING;

-- Vérifier que toutes les migrations ont été insérées
SELECT version, name 
FROM supabase_migrations.schema_migrations 
ORDER BY version DESC;

