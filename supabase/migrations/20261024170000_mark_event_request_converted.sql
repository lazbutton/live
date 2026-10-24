-- ============================================
-- Migration : une demande complétée dans le formulaire d'événement garde son attribution
-- Date : 2026-10-24
-- Description : « Compléter » une proposition de l'app (user_requests) dans la file des demandes ouvre le
--   formulaire d'événement du back-office : l'admin crée l'événement, puis le back-office marque la demande
--   convertie (markRequestConverted). C'est le chemin obligé des demandes « depuis un lien » (event_from_url,
--   que convert_event_request_to_event refuse) et des affiches seules. Cette dernière étape était une mise à
--   jour directe de user_requests : rien n'était recopié sur l'événement, dont la fiche ne disait ni
--   « Proposé par … » ni « Suggestion communautaire ».
--
--   mark_event_request_converted(request_id, event_id) : la règle de convert_event_request_to_event
--   (20261024140000), pour un événement déjà créé par le formulaire.
--     • L'événement est marqué communautaire (community_submission), garde l'accord
--       (community_attribution_opt_in) et, avec l'accord seulement, le nom public :
--       public_contributor_label(contributor_display_name), jamais un texte qui contient « @ ».
--     • Il passe au demandeur (created_by = requested_by), comme avec convert_event_request_to_event : « Mes
--       suggestions » de l'app le montre, et « Bloquer aussi l'auteur », que l'app offre sur un événement
--       communautaire, vise events.created_by : resté à l'admin, il aurait bloqué l'admin. Comme après la
--       conversion rapide, le demandeur peut le modifier ou le supprimer tant qu'il est en attente (policies
--       « … their own pending events »).
--     • La demande passe en converted, liée à l'événement, relue par l'admin qui appelle.
--   Admin seulement (42501 sinon). La demande doit être en attente et l'événement créé par l'admin qui appelle
--   (le formulaire vient de l'enregistrer) : la fonction ne donne pas au demandeur un événement venu d'ailleurs.
--   Pour une demande déjà convertie en cet événement, rejouer l'appel ne change rien. Sinon, erreur et rien
--   n'est écrit.
--
--   `security definer`, `set search_path = ''` (tout est qualifié) ; exécutable par authenticated seulement :
--   la fonction refuse qui n'est pas admin. Rejouable (CREATE OR REPLACE).

-- ============================================
-- CODE SQL
-- ============================================

CREATE OR REPLACE FUNCTION public.mark_event_request_converted(request_id uuid, event_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  admin_id uuid := (SELECT auth.uid());
  demande public.user_requests%ROWTYPE;
  accord boolean;
BEGIN
  IF admin_id IS NULL OR NOT public.is_user_admin() THEN
    RAISE EXCEPTION 'Seuls les administrateurs peuvent marquer une demande convertie'
      USING ERRCODE = '42501';
  END IF;

  SELECT r.* INTO demande
  FROM public.user_requests AS r
  WHERE r.id = mark_event_request_converted.request_id
  FOR UPDATE;

  IF NOT FOUND OR NOT (
    demande.status = 'pending'
    OR (demande.status = 'converted'
        AND demande.converted_event_id = mark_event_request_converted.event_id)
  ) THEN
    RAISE EXCEPTION 'Demande d''événement non trouvée ou déjà traitée';
  END IF;

  accord := coalesce(demande.community_attribution_opt_in, false);

  UPDATE public.events AS e
  SET
    community_submission = true,
    community_attribution_opt_in = accord,
    community_contributor_label = CASE
      WHEN accord THEN public.public_contributor_label(demande.contributor_display_name)
    END,
    created_by = demande.requested_by
  WHERE e.id = mark_event_request_converted.event_id
    AND (demande.status = 'converted' OR e.created_by = admin_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Événement non trouvé, ou créé par quelqu''un d''autre';
  END IF;

  IF demande.status = 'pending' THEN
    UPDATE public.user_requests AS r
    SET
      status = 'converted',
      converted_event_id = mark_event_request_converted.event_id,
      converted_at = now(),
      reviewed_by = admin_id,
      reviewed_at = now()
    WHERE r.id = mark_event_request_converted.request_id;
  END IF;
END
$$;

COMMENT ON FUNCTION public.mark_event_request_converted(uuid, uuid) IS
  'Marque convertie une demande (user_requests) complétée dans le formulaire d''événement du back-office et recopie sur l''événement event_id l''origine communautaire, l''accord d''attribution et, avec l''accord seulement, le nom public (public_contributor_label : jamais une adresse e-mail) ; l''événement passe au demandeur (created_by). Admin uniquement ; demande en attente et événement créé par l''admin qui appelle, ou demande déjà convertie en cet événement (rejouer ne change rien).';

REVOKE ALL ON FUNCTION public.mark_event_request_converted(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_event_request_converted(uuid, uuid) TO authenticated;

-- Vérification (SQL Editor) : la fonction existe et seul authenticated l'exécute (plus service_role et
-- postgres, par les droits par défaut).
-- select has_function_privilege('anon', 'public.mark_event_request_converted(uuid, uuid)', 'execute') as anon,
--        has_function_privilege('authenticated', 'public.mark_event_request_converted(uuid, uuid)', 'execute')
--          as authenticated;

-- ============================================
-- ROLLBACK
-- ============================================
-- DROP FUNCTION IF EXISTS public.mark_event_request_converted(uuid, uuid);
-- (Le back-office d'avant cette migration mettait à jour user_requests directement : le redéployer d'abord.)
