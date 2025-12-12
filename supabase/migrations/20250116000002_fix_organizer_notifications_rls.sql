-- ============================================
-- Migration 20250116000002 : Correction des politiques RLS pour organizer_notifications
-- Date : 2025-01-16
-- Description : Corrige les politiques RLS qui accèdent directement à auth.users
-- ============================================

-- Corriger la politique pour la création de notifications par les admins
DROP POLICY IF EXISTS "Admins can create notifications" ON public.organizer_notifications;
CREATE POLICY "Admins can create notifications"
ON public.organizer_notifications FOR INSERT
WITH CHECK (is_user_admin());

-- Corriger la politique pour la visualisation de toutes les notifications par les admins
DROP POLICY IF EXISTS "Admins can view all notifications" ON public.organizer_notifications;
CREATE POLICY "Admins can view all notifications"
ON public.organizer_notifications FOR SELECT
USING (is_user_admin());

