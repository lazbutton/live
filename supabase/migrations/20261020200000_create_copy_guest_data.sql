-- Données d'un invité (session anonyme) recopiées sur le compte qui se connecte.
--
-- L'app ouvre une session anonyme par installation ; quand la personne se connecte ou crée un
-- compte, `AuthService.migrateGuestDataToAccount` (app) recopie ses favoris, ses événements masqués
-- et ses préférences de notification sur le compte (audit UI/UX du 2026-10-20, U6). L'app les
-- lisait elle-même, après la connexion, donc avec le jeton du compte : les policies de lecture
-- (`auth.uid() = user_id`) ne lui rendaient rien, et rien n'était recopié (sauf pour un admin).
--
-- copy_guest_data(guest_session_id) : recopie sur l'appelant les données de l'invité dont
-- `guest_session_id` est la session (`auth.sessions.id`, claim `session_id` du jeton de l'invité).
-- - Appelant : un vrai compte (`auth.users.is_anonymous` faux). Source : un utilisateur anonyme.
--   Sinon, erreur 42501 et rien n'est écrit.
-- - L'id de session prouve que l'appelant a tenu la session de l'invité : il n'est que dans les
--   jetons de cette session, sur l'appareil. L'id de l'utilisateur ne suffirait pas : il est public
--   dès qu'il est l'auteur d'un événement publié (`events.created_by`). La session reste en base
--   après la connexion à un compte (l'app ne déconnecte pas l'invité) ; si elle n'y est plus
--   (session expirée ou supprimée), rien n'est recopié.
-- - Favoris (`event_likes`) et masqués (`user_hidden_events`) : ajoutés à ceux du compte, sans
--   doublons.
-- - Préférences de notification (`user_notification_preferences`, avec ses catégories
--   `user_notification_categories`) : recopiées seulement si le compte n'en a pas encore (un compte
--   existant garde ses réglages).
-- - Les données de l'invité restent (retour en arrière possible). Rejouer l'appel ne change rien.
-- Rend une ligne : le nombre de lignes ajoutées par table.
--
-- `security definer` pour lire les lignes de l'invité malgré la RLS et lire `auth.sessions` /
-- `auth.users` ; `set search_path = ''`, tout est qualifié. Exécutable par authenticated seulement
-- (les invités aussi ont ce rôle : la fonction les refuse).

CREATE OR REPLACE FUNCTION public.copy_guest_data(guest_session_id uuid)
RETURNS TABLE (
  likes integer,
  hidden_events integer,
  notification_preferences integer,
  notification_categories integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  compte uuid := (SELECT auth.uid());
  invite uuid;
BEGIN
  IF compte IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users AS u WHERE u.id = compte AND NOT u.is_anonymous
  ) THEN
    RAISE EXCEPTION 'copy_guest_data : réservé à un compte, pas à une session invitée'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.user_id INTO invite
  FROM auth.sessions AS s
  JOIN auth.users AS u ON u.id = s.user_id
  WHERE s.id = copy_guest_data.guest_session_id
    AND u.is_anonymous;
  IF invite IS NULL THEN
    RAISE EXCEPTION 'copy_guest_data : session invitée inconnue'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.event_likes (event_id, user_id)
  SELECT l.event_id, compte
  FROM public.event_likes AS l
  WHERE l.user_id = invite
  ON CONFLICT (event_id, user_id) DO NOTHING;
  GET DIAGNOSTICS likes = ROW_COUNT;

  INSERT INTO public.user_hidden_events (event_id, user_id)
  SELECT h.event_id, compte
  FROM public.user_hidden_events AS h
  WHERE h.user_id = invite
  ON CONFLICT (event_id, user_id) DO NOTHING;
  GET DIAGNOSTICS hidden_events = ROW_COUNT;

  INSERT INTO public.user_notification_preferences (user_id, frequency, is_enabled, category_ids)
  SELECT compte, p.frequency, p.is_enabled, p.category_ids
  FROM public.user_notification_preferences AS p
  WHERE p.user_id = invite
  ON CONFLICT (user_id) DO NOTHING;
  GET DIAGNOSTICS notification_preferences = ROW_COUNT;

  notification_categories := 0;
  IF notification_preferences > 0 THEN
    INSERT INTO public.user_notification_categories (user_id, category_id)
    SELECT compte, c.category_id
    FROM public.user_notification_categories AS c
    WHERE c.user_id = invite
    ON CONFLICT (user_id, category_id) DO NOTHING;
    GET DIAGNOSTICS notification_categories = ROW_COUNT;
  END IF;

  RETURN NEXT;
END
$$;

COMMENT ON FUNCTION public.copy_guest_data(uuid) IS
  'Recopie sur le compte appelant les favoris, masqués et préférences de notification (si le compte n''en a pas) de la session invitée guest_session_id (auth.sessions.id). Appelant non anonyme, source anonyme. Rend le nombre de lignes ajoutées par table.';

REVOKE ALL ON FUNCTION public.copy_guest_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_guest_data(uuid) TO authenticated;

-- Vérification (SQL Editor) : la fonction existe et seul authenticated l'exécute (plus service_role
-- et postgres, par les droits par défaut).
-- select has_function_privilege('anon', 'public.copy_guest_data(uuid)', 'execute') as anon,
--        has_function_privilege('authenticated', 'public.copy_guest_data(uuid)', 'execute') as authenticated;

-- Rollback :
-- DROP FUNCTION IF EXISTS public.copy_guest_data(uuid);
