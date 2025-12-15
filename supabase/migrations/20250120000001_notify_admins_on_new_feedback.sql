-- Migration: Notifications push automatiques aux admins pour les nouveaux feedbacks
-- Date: 2025-01-20
--
-- Cette migration crée une fonction qui peut être appelée pour notifier les admins.
-- Pour l'automatisation complète, configurez un Database Webhook dans Supabase Dashboard :
-- 1. Allez dans Database > Webhooks
-- 2. Créez un nouveau webhook sur la table feedbacks
-- 3. Event: INSERT
-- 4. HTTP Request: POST vers https://votre-domaine.com/api/notifications/admin/new-feedback
-- 5. HTTP Headers: Content-Type: application/json
-- 6. HTTP Request Body: 
--    {
--      "feedbackId": "{{ $1.id }}",
--      "message": "{{ $1.description }}",
--      "userId": "{{ $1.user_id }}"
--    }
--
-- Alternative: Appeler directement l'API depuis le code qui crée les feedbacks
-- Voir app/api/notifications/admin/new-feedback/route.ts

-- Fonction helper pour notifier les admins (peut être appelée depuis le code)
CREATE OR REPLACE FUNCTION notify_admins_new_feedback(feedback_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  feedback_data RECORD;
BEGIN
  -- Récupérer les données du feedback
  SELECT id, description, user_id, status, feedback_object_id
  INTO feedback_data
  FROM feedbacks
  WHERE id = feedback_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feedback non trouvé: %', feedback_id;
  END IF;

  -- Logger l'événement (peut être utilisé par un cron ou un webhook)
  RAISE NOTICE 'Nouveau feedback créé: % (description: %)', 
    feedback_data.id, 
    LEFT(feedback_data.description, 50);
END;
$$;

COMMENT ON FUNCTION notify_admins_new_feedback(uuid) IS 'Fonction helper pour notifier les admins d''un nouveau feedback. À utiliser avec un Database Webhook Supabase ou depuis le code.';

