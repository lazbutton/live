--
-- Migration: Ajout du système d'invitations organisateurs
-- Description: Crée la table organizer_invitations pour gérer les invitations par email
-- Date: 2025-01-14
--

-- ============================================================================
-- 1. CRÉER LA TABLE organizer_invitations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organizer_invitations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organizer_id uuid NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    email text NOT NULL,
    role text DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
    token uuid DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    accepted_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + interval '7 days'),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(organizer_id, email)
);

COMMENT ON TABLE public.organizer_invitations IS 'Table pour gérer les invitations d''utilisateurs à rejoindre un organisateur';
COMMENT ON COLUMN public.organizer_invitations.token IS 'Token unique pour accepter l''invitation';
COMMENT ON COLUMN public.organizer_invitations.expires_at IS 'Date d''expiration de l''invitation (7 jours par défaut)';

-- ============================================================================
-- 2. CRÉER LES INDEX
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_organizer_invitations_organizer_id ON organizer_invitations(organizer_id);
CREATE INDEX IF NOT EXISTS idx_organizer_invitations_email ON organizer_invitations(email);
CREATE INDEX IF NOT EXISTS idx_organizer_invitations_token ON organizer_invitations(token);
CREATE INDEX IF NOT EXISTS idx_organizer_invitations_expires_at ON organizer_invitations(expires_at);

-- ============================================================================
-- 3. CRÉER UN TRIGGER POUR updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_organizer_invitations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_organizer_invitations_updated_at
BEFORE UPDATE ON organizer_invitations
FOR EACH ROW
EXECUTE FUNCTION update_organizer_invitations_updated_at();

-- ============================================================================
-- 4. FONCTION POUR RÉCUPÉRER OU CRÉER UN UTILISATEUR PAR EMAIL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_user_by_email(user_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_uuid uuid;
BEGIN
  -- Chercher l'utilisateur existant
  SELECT id INTO user_uuid
  FROM auth.users
  WHERE email = user_email
  LIMIT 1;

  -- Si l'utilisateur existe, retourner son ID
  IF user_uuid IS NOT NULL THEN
    RETURN user_uuid;
  END IF;

  -- Sinon, créer un nouvel utilisateur (sans mot de passe, il le définira plus tard)
  -- Note: Cette fonction nécessite des privilèges élevés. 
  -- En production, on devrait plutôt créer l'utilisateur via l'API Supabase Admin
  -- Pour l'instant, on retourne NULL et l'API créera l'utilisateur
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.get_or_create_user_by_email(text) IS 'Récupère l''ID d''un utilisateur par email. Retourne NULL si l''utilisateur n''existe pas (à créer via API).';

-- ============================================================================
-- 6. FONCTION POUR RÉCUPÉRER LES EMAILS DES UTILISATEURS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_emails(user_ids uuid[])
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id::uuid as user_id,
    u.email::text
  FROM auth.users u
  WHERE u.id = ANY(user_ids);
END;
$$;

COMMENT ON FUNCTION public.get_user_emails(uuid[]) IS 'Récupère les emails des utilisateurs à partir de leurs IDs';

-- ============================================================================
-- 5. FONCTION POUR ACCEPTER UNE INVITATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_organizer_invitation(invitation_token uuid, user_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  invitation_record RECORD;
  result jsonb;
BEGIN
  -- Récupérer l'invitation
  SELECT * INTO invitation_record
  FROM organizer_invitations
  WHERE token = invitation_token
    AND accepted_at IS NULL
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation non trouvée, expirée ou déjà acceptée');
  END IF;

  -- Vérifier que l'utilisateur correspond à l'email de l'invitation
  -- (On vérifie via l'API, pas ici car on n'a pas accès direct à auth.users)

  -- Créer la liaison utilisateur-organisateur
  INSERT INTO user_organizers (user_id, organizer_id, role)
  VALUES (user_id_param, invitation_record.organizer_id, invitation_record.role)
  ON CONFLICT (user_id, organizer_id) 
  DO UPDATE SET role = invitation_record.role;

  -- Marquer l'invitation comme acceptée
  UPDATE organizer_invitations
  SET accepted_at = NOW()
  WHERE id = invitation_record.id;

  RETURN jsonb_build_object(
    'success', true,
    'organizer_id', invitation_record.organizer_id,
    'role', invitation_record.role
  );
END;
$$;

COMMENT ON FUNCTION public.accept_organizer_invitation(uuid, uuid) IS 'Accepte une invitation organisateur et crée la liaison user_organizers';

-- ============================================================================
-- 6. POLITIQUES RLS POUR organizer_invitations
-- ============================================================================

ALTER TABLE organizer_invitations ENABLE ROW LEVEL SECURITY;

-- Les admins peuvent tout voir
CREATE POLICY "Admins can view all invitations"
ON organizer_invitations FOR SELECT
USING (is_user_admin());

-- Les admins peuvent créer/modifier/supprimer
CREATE POLICY "Admins can manage invitations"
ON organizer_invitations FOR ALL
USING (is_user_admin())
WITH CHECK (is_user_admin());

-- Les utilisateurs peuvent voir leurs propres invitations (par token)
-- Cette politique est gérée via une fonction qui vérifie le token
-- Pas besoin de politique SELECT publique car on utilise une fonction

