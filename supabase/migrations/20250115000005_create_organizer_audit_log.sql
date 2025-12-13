-- Migration : Création de la table organizer_audit_log pour l'historique des actions
-- Description : Enregistre toutes les actions liées à la gestion d'équipe d'un organisateur

-- Créer la table organizer_audit_log
CREATE TABLE IF NOT EXISTS public.organizer_audit_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organizer_id uuid NOT NULL,
    action text NOT NULL CHECK (action IN (
        'user_added',
        'user_removed',
        'role_changed',
        'invitation_sent',
        'invitation_accepted',
        'invitation_rejected',
        'invitation_expired'
    )),
    performed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    target_user_email text,
    old_value text, -- Ancienne valeur (ex: ancien rôle)
    new_value text, -- Nouvelle valeur (ex: nouveau rôle)
    metadata jsonb, -- Données supplémentaires (ex: invitation token, etc.)
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_organizer_audit_log_organizer_id ON public.organizer_audit_log(organizer_id);
CREATE INDEX IF NOT EXISTS idx_organizer_audit_log_performed_by ON public.organizer_audit_log(performed_by);
CREATE INDEX IF NOT EXISTS idx_organizer_audit_log_target_user_id ON public.organizer_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_organizer_audit_log_created_at ON public.organizer_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_organizer_audit_log_action ON public.organizer_audit_log(action);

-- RLS Policies
ALTER TABLE public.organizer_audit_log ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir l'historique de leurs organisateurs
DROP POLICY IF EXISTS "Users can view audit log of their organizers" ON public.organizer_audit_log;
CREATE POLICY "Users can view audit log of their organizers"
ON public.organizer_audit_log
FOR SELECT
USING (
    -- Admins peuvent tout voir
    EXISTS (
        SELECT 1 FROM auth.users
        WHERE auth.users.id = auth.uid()
        AND (auth.users.raw_user_meta_data->>'role')::text = 'admin'
    )
    OR
    -- Utilisateurs associés à l'organisateur peuvent voir l'historique
    EXISTS (
        SELECT 1 FROM public.user_organizers
        WHERE user_organizers.organizer_id = organizer_audit_log.organizer_id
        AND user_organizers.user_id = auth.uid()
    )
);

-- Seuls les admins et le système peuvent insérer dans l'audit log
-- (via service role key dans les API routes)
DROP POLICY IF EXISTS "Only system can insert audit log" ON public.organizer_audit_log;
CREATE POLICY "Only system can insert audit log"
ON public.organizer_audit_log
FOR INSERT
WITH CHECK (false); -- Désactivé par défaut, utilisation du service role key

-- Commentaires
COMMENT ON TABLE public.organizer_audit_log IS 'Historique des actions liées à la gestion d''équipe des organisateurs';
COMMENT ON COLUMN public.organizer_audit_log.organizer_id IS 'ID de l''organisateur concerné';
COMMENT ON COLUMN public.organizer_audit_log.action IS 'Type d''action effectuée';
COMMENT ON COLUMN public.organizer_audit_log.performed_by IS 'ID de l''utilisateur qui a effectué l''action';
COMMENT ON COLUMN public.organizer_audit_log.target_user_id IS 'ID de l''utilisateur cible (si applicable)';
COMMENT ON COLUMN public.organizer_audit_log.target_user_email IS 'Email de l''utilisateur cible (pour les invitations)';
COMMENT ON COLUMN public.organizer_audit_log.old_value IS 'Ancienne valeur (ex: ancien rôle)';
COMMENT ON COLUMN public.organizer_audit_log.new_value IS 'Nouvelle valeur (ex: nouveau rôle)';
COMMENT ON COLUMN public.organizer_audit_log.metadata IS 'Données supplémentaires au format JSON';



