-- ============================================
-- Migration 20250116000001 : Création de la table de notifications pour les organisateurs
-- Date : 2025-01-16
-- Description : Ajoute une table pour gérer les notifications destinées aux organisateurs (approbation/rejet d'événements, etc.)
-- ============================================

-- Création de la table organizer_notifications
CREATE TABLE IF NOT EXISTS public.organizer_notifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('event_approved', 'event_rejected', 'event_created', 'event_updated', 'team_invitation', 'team_role_changed')),
    title text NOT NULL,
    message text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb -- Données supplémentaires (ex: ancien statut, nouveau statut, etc.)
);

COMMENT ON TABLE public.organizer_notifications IS 'Notifications destinées aux organisateurs (approbation/rejet d''événements, etc.)';
COMMENT ON COLUMN public.organizer_notifications.user_id IS 'L''utilisateur organisateur destinataire de la notification';
COMMENT ON COLUMN public.organizer_notifications.event_id IS 'L''événement concerné par la notification (si applicable)';
COMMENT ON COLUMN public.organizer_notifications.type IS 'Type de notification (event_approved, event_rejected, etc.)';
COMMENT ON COLUMN public.organizer_notifications.title IS 'Titre de la notification';
COMMENT ON COLUMN public.organizer_notifications.message IS 'Message de la notification';
COMMENT ON COLUMN public.organizer_notifications.read IS 'Indique si la notification a été lue';
COMMENT ON COLUMN public.organizer_notifications.metadata IS 'Données supplémentaires au format JSON';

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_organizer_notifications_user_id ON public.organizer_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_organizer_notifications_event_id ON public.organizer_notifications(event_id);
CREATE INDEX IF NOT EXISTS idx_organizer_notifications_read ON public.organizer_notifications(read);
CREATE INDEX IF NOT EXISTS idx_organizer_notifications_created_at ON public.organizer_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_organizer_notifications_user_read ON public.organizer_notifications(user_id, read);

-- Politiques RLS
ALTER TABLE public.organizer_notifications ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir leurs propres notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.organizer_notifications;
CREATE POLICY "Users can view their own notifications"
ON public.organizer_notifications FOR SELECT
USING (auth.uid() = user_id);

-- Les utilisateurs peuvent marquer leurs notifications comme lues
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.organizer_notifications;
CREATE POLICY "Users can update their own notifications"
ON public.organizer_notifications FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Les admins peuvent créer des notifications pour tous les organisateurs
DROP POLICY IF EXISTS "Admins can create notifications" ON public.organizer_notifications;
CREATE POLICY "Admins can create notifications"
ON public.organizer_notifications FOR INSERT
WITH CHECK (is_user_admin());

-- Les admins peuvent voir toutes les notifications
DROP POLICY IF EXISTS "Admins can view all notifications" ON public.organizer_notifications;
CREATE POLICY "Admins can view all notifications"
ON public.organizer_notifications FOR SELECT
USING (is_user_admin());

-- ============================================
-- ROLLBACK
-- ============================================
-- DROP TABLE IF EXISTS public.organizer_notifications CASCADE;

