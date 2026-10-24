-- ============================================
-- Migration : la table event_notifications supprimée (anciens rappels par événement)
-- Date : 2026-10-24
-- Description : event_notifications gardait les rappels individuels de l'ancien système (« 1 jour,
--   3 heures ou 1 heure avant » un événement), abandonné en mars 2026 (docs/NOTIFICATION_TYPES_ADMIN.md,
--   « Cas legacy »). Les rappels de l'app (U7) vivent sur le téléphone, sans table. Suppression voulue
--   par l'utilisateur le 2026-10-24 (../live/docs/FEUILLE_DE_ROUTE.md).
--
--   Relevé en prod le 2026-10-24 (lecture seule) : 0 ligne ; aucune vue, aucune policy d'une autre
--   table, clé étrangère, publication ni tâche pg_cron ne la cite ; aucune fonction non plus, hors son
--   déclencheur calculate_notification_scheduled_at() et check_rls_policies() (le nom dans une liste) ;
--   l'Edge Function delete-user n'y touche pas.
--   Qui s'en servait encore :
--   - le back-office : plus depuis mars 2026 (crons de rappels et /api/events/[id]/notifications) ;
--   - l'app de main : plus depuis le 2026-10-21 (live-app 92aa71a, « Rappels (U7) ») ;
--   - l'app publiée, 1.0.6 (avril 2026, live-app 7c3f3a2), comme la 1.0.4 et la 1.0.5 : au lancement
--     et quand elle réenregistre le jeton de notification, un UPDATE qui désactive les anciens rappels
--     du compte (aucune ligne touchée), dans un try/catch. Sans la table, PostgREST répond 404
--     (PGRST205) : l'erreur est attrapée et journalisée par l'app, sans autre effet ;
--   - la 1.0.3 (décembre 2025) avait encore l'écran des rappels : sans la table, un rappel ne s'active
--     plus (message d'erreur) et la liste des rappels reste vide.
--
--   Retirés : la table, avec ses index, contraintes, 4 policies et 2 déclencheurs ;
--   calculate_notification_scheduled_at() (son seul usage : le déclencheur de la table) ;
--   update_event_notifications_updated_at(), qui ne servait à rien (le déclencheur du même nom appelle
--   update_notification_preferences_updated_at(), qui reste : trois autres tables l'utilisent).
--   check_rls_policies() garde le nom dans sa liste de tables : du texte, sans dépendance (elle
--   échoue de toute façon, en prod aussi, sur p.polrelid, absent de la vue pg_policies).
--
--   Contenu et définition sauvegardés juste avant (vide, 2026-10-24 à 02:30 UTC) :
--   ~/Documents/Backups/outlive/event-notifications-2026-10-24/ sur la machine de l'utilisateur, hors
--   dépôt (README.txt : comment restaurer).
--
--   Sans CASCADE : si un objet inconnu dépend encore de l'un d'eux, la migration échoue au lieu de le
--   supprimer en silence. La table d'abord (ses déclencheurs tiennent les fonctions). Rejouable :
--   IF EXISTS partout.

-- ============================================
-- CODE SQL
-- ============================================

DROP TABLE IF EXISTS public.event_notifications;
DROP FUNCTION IF EXISTS public.calculate_notification_scheduled_at();
DROP FUNCTION IF EXISTS public.update_event_notifications_updated_at();

-- ============================================
-- ROLLBACK (référence)
-- ============================================

-- Recréer la table vide, telle qu'elle était en prod : le schema.sql de la sauvegarde (psql, rôle
-- postgres), puis, s'il y a des lignes : \copy public.event_notifications FROM 'event_notifications.csv'
-- WITH (FORMAT csv, HEADER true). Sur une base neuve, ces migrations la recréent aussi :
-- 20251212120000_baseline.sql (table, index, policies, déclencheur updated_at),
-- 20250116000003_add_reminder_timing_to_event_notifications.sql (reminder_timing et son déclencheur),
-- 20251216000001_audit_and_reinforce_rls_policies.sql (commentaire de la table).
