-- Migration: Notifications push automatiques aux admins pour les nouvelles demandes
-- Date: 2025-01-20
--
-- Cette migration crée une fonction qui peut être appelée pour notifier les admins.
-- Pour l'automatisation complète, configurez un Database Webhook dans Supabase Dashboard :
-- 1. Allez dans Database > Webhooks
-- 2. Créez un nouveau webhook sur la table user_requests
-- 3. Event: INSERT
-- 4. HTTP Request: POST vers https://votre-domaine.com/api/notifications/admin/new-request
-- 5. HTTP Headers: Content-Type: application/json
-- 6. HTTP Request Body: 
--    {
--      "requestId": "{{ $1.id }}",
--      "requestType": "{{ $1.request_type }}",
--      "eventTitle": "{{ $1.event_data.title }}",
--      "sourceUrl": "{{ $1.source_url }}"
--    }
--
-- Alternative: Appeler directement l'API depuis le code qui crée les demandes
-- Voir app/api/notifications/admin/new-request/route.ts

-- Fonction helper pour notifier les admins (peut être appelée depuis le code)
CREATE OR REPLACE FUNCTION notify_admins_new_request(request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_data RECORD;
BEGIN
  -- Récupérer les données de la demande
  SELECT id, request_type, event_data, source_url
  INTO request_data
  FROM user_requests
  WHERE id = request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande non trouvée: %', request_id;
  END IF;

  -- Logger l'événement (peut être utilisé par un cron ou un webhook)
  RAISE NOTICE 'Nouvelle demande créée: % (type: %, titre: %)', 
    request_data.id, 
    request_data.request_type,
    COALESCE(request_data.event_data->>'title', 'N/A');
END;
$$;

COMMENT ON FUNCTION notify_admins_new_request(uuid) IS 'Fonction helper pour notifier les admins d''une nouvelle demande. À utiliser avec un Database Webhook Supabase ou depuis le code.';

