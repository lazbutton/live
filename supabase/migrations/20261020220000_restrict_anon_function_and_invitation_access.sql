-- U39 (suite d'event_likes) — ce que la clé publique (anon) laisse lire/appeler.
--
-- Supabase accorde EXECUTE à PUBLIC (donc anon et authenticated) sur chaque fonction `public` par défaut.
-- Plusieurs fonctions SECURITY DEFINER n'ont aucun contrôle de l'appelant et tournent donc avec les droits
-- du propriétaire (postgres) quand la clé publique les appelle. Avec la seule clé anon on pouvait :
--   • make_user_admin(email) : se donner (ou donner à n'importe qui) le rôle admin — escalade de privilèges ;
--   • get_user_emails(uuid[]) : résoudre n'importe quel identifiant d'utilisateur en e-mail. Combiné à
--     events.created_by (public, nécessaire au blocage/signalement d'auteur côté app), cela reliait un
--     événement communautaire à l'e-mail de son auteur ;
--   • get_or_create_user_by_email(email) : savoir si un e-mail a un compte (énumération) ;
--   • get_invitation_by_token(token) : lire l'e-mail d'une invitation ;
--   • convert_event_request_to_event_service, cleanup_free_tier_technical_data, enqueue/claim_notion_sync_job,
--     upsert_city, refresh_city_center, resolve_city_id_from_address, check_rls_policies, accept_organizer_invitation :
--     écritures/diagnostics réservés au service role, aux triggers ou aux admins, mais appelables par anon.
-- Et la table organizer_invitations se lisait entièrement (policy SELECT `USING (true)`) : e-mail invité +
-- token (le secret qui permet de rejoindre l'équipe d'un organisateur) de toutes les invitations.
--
-- Rejouable (IF EXISTS / CREATE OR REPLACE / REVOKE idempotents). Ne touche aucune fonction app_* ni
-- event_like_counts ni copy_guest_data : l'app n'est pas affectée (vérifié par grep des deux dépôts).

-- ───────────────────────────────────────────────────────────────────────────
-- 1. organizer_invitations : plus de lecture publique de l'e-mail et du token
-- ───────────────────────────────────────────────────────────────────────────
-- Avant : « Anyone can view invitation by token » `USING (true)` → anon listait e-mail + token de toutes
-- les invitations. Après : l'admin (policy conservée), le propriétaire de l'organisateur concerné, et
-- l'utilisateur connecté dont l'e-mail est celui de l'invitation (flux d'acceptation : il doit être connecté,
-- `app/api/organizer/invite/accept`). La vérification par lien (`app/api/organizer/invite/verify`) lit déjà
-- la table avec la clé service role (ignore la RLS), donc elle n'a pas besoin d'un accès anon.
DROP POLICY IF EXISTS "Anyone can view invitation by token" ON public.organizer_invitations;

DROP POLICY IF EXISTS "Organizer owners can view their invitations" ON public.organizer_invitations;
CREATE POLICY "Organizer owners can view their invitations"
  ON public.organizer_invitations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizers uo
      WHERE uo.organizer_id = organizer_invitations.organizer_id
        AND uo.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Invited users can view their invitation" ON public.organizer_invitations;
CREATE POLICY "Invited users can view their invitation"
  ON public.organizer_invitations
  FOR SELECT
  TO authenticated
  USING (lower(email) = lower(auth.jwt() ->> 'email'));

-- ───────────────────────────────────────────────────────────────────────────
-- 2. accept_organizer_invitation : on ne peut lier que soi-même
-- ───────────────────────────────────────────────────────────────────────────
-- Avant : anon pouvait, avec un token lisible en clair (cf. point 1), lier un identifiant d'utilisateur
-- arbitraire à un organisateur. Après : l'appelant doit être connecté et user_id_param doit être le sien.
CREATE OR REPLACE FUNCTION public.accept_organizer_invitation(invitation_token uuid, user_id_param uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  invitation_record RECORD;
BEGIN
  IF auth.uid() IS NULL OR user_id_param IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur non autorisé');
  END IF;

  SELECT * INTO invitation_record
  FROM organizer_invitations
  WHERE token = invitation_token
    AND accepted_at IS NULL
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation non trouvée, expirée ou déjà acceptée');
  END IF;

  INSERT INTO user_organizers (user_id, organizer_id, role)
  VALUES (user_id_param, invitation_record.organizer_id, invitation_record.role)
  ON CONFLICT (user_id, organizer_id)
  DO UPDATE SET role = invitation_record.role;

  UPDATE organizer_invitations
  SET accepted_at = NOW()
  WHERE id = invitation_record.id;

  RETURN jsonb_build_object(
    'success', true,
    'organizer_id', invitation_record.organizer_id,
    'role', invitation_record.role
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_organizer_invitation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_organizer_invitation(uuid, uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. get_user_emails : réservé aux admins et aux propriétaires d'organisateur
-- ───────────────────────────────────────────────────────────────────────────
-- Appelée par le back-office (route admin, client admin) et la page équipe d'un organisateur (propriétaire
-- connecté). Elle ne doit pas résoudre uuid → e-mail pour le grand public ni pour un simple utilisateur de
-- l'app. Garde interne (SECURITY DEFINER) : l'appelant doit être admin ou propriétaire d'au moins un
-- organisateur ; sinon aucune ligne.
CREATE OR REPLACE FUNCTION public.get_user_emails(user_ids uuid[])
 RETURNS TABLE(user_id uuid, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, auth
AS $function$
BEGIN
  IF NOT (public.is_user_admin() OR public.is_user_organizer()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id::uuid AS user_id, u.email::text
  FROM auth.users u
  WHERE u.id = ANY(user_ids);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_user_emails(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_emails(uuid[]) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Fonctions à retirer complètement de la clé publique
-- ───────────────────────────────────────────────────────────────────────────
-- Aucun appelant via PostgREST (grep des deux dépôts) ; usage manuel (SQL Editor, rôle postgres) ou nul.
REVOKE ALL ON FUNCTION public.make_user_admin(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_or_create_user_by_email(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_invitation_by_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_rls_policies() FROM PUBLIC, anon, authenticated;

-- Écritures réservées au service role (cron / files Notion / conversion service) ; triggers non concernés
-- (ils s'exécutent avec les droits du propriétaire, pas de l'appelant).
REVOKE ALL ON FUNCTION public.cleanup_free_tier_technical_data(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_free_tier_technical_data(integer) TO service_role;

-- Fonctions de la synchro Notion, retirées par 20261020235000_remove_notion_sync, qui peut passer avant
-- celle-ci en prod : seulement si elles existent encore.
DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.convert_event_request_to_event_service(uuid, uuid)',
    'public.enqueue_notion_sync_job(text, uuid, text, text, text, jsonb, text)',
    'public.claim_notion_sync_jobs(text, integer)'
  ] LOOP
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    END IF;
  END LOOP;
END $$;

-- Fonctions ville : seulement appelées par des triggers (sync_event_city, sync_location_city,
-- sync_major_event_city, refresh_city_center_from_location_change). On laisse le service role pour un
-- éventuel usage serveur ; on retire anon/authenticated.
REVOKE ALL ON FUNCTION public.upsert_city(text, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_city(text, numeric, numeric) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_city_center(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_city_center(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.resolve_city_id_from_address(text, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_city_id_from_address(text, numeric, numeric) TO service_role;

-- Note : is_user_admin(), is_user_organizer(), is_user_safety_suspended(), can_use_ugc_features(),
-- is_event_approved_for_public_event_{artists,organizers}() restent exécutables par anon/authenticated :
-- elles sont évaluées dans les policies RLS et ne renvoient qu'un booléen sur l'appelant courant.

-- ───────────────────────────────────────────────────────────────────────────
-- Rollback (référence) :
--   CREATE POLICY "Anyone can view invitation by token" ON public.organizer_invitations FOR SELECT USING (true);
--   DROP POLICY "Organizer owners can view their invitations" ON public.organizer_invitations;
--   DROP POLICY "Invited users can view their invitation" ON public.organizer_invitations;
--   GRANT EXECUTE ON FUNCTION public.<fn>(...) TO anon, authenticated;  -- par fonction
--   (et restaurer les corps d'accept_organizer_invitation / get_user_emails sans garde)
