-- ============================================
-- Migration 011 : Fonction pour convertir une demande d'événement en événement
-- Date : 2024-12-XX
-- Description : Fonction pour créer un événement à partir d'une demande dans user_requests
-- ============================================

-- Fonction pour convertir une demande d'événement (dans user_requests) en événement réel
CREATE OR REPLACE FUNCTION convert_event_request_to_event(request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_event_id UUID;
  request_data RECORD;
  current_user_id UUID;
  event_json JSONB;
BEGIN
  -- Récupérer l'ID de l'utilisateur admin actuel
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Vérifier que l'utilisateur est admin
  IF NOT is_user_admin() THEN
    RAISE EXCEPTION 'Seuls les administrateurs peuvent convertir des demandes en événements';
  END IF;
  
  -- Récupérer les données de la demande
  SELECT * INTO request_data
  FROM user_requests
  WHERE id = request_id 
    AND request_type = 'event_creation' 
    AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande d''événement non trouvée ou déjà traitée';
  END IF;
  
  -- Vérifier que event_data existe
  IF request_data.event_data IS NULL THEN
    RAISE EXCEPTION 'Les données de l''événement sont manquantes';
  END IF;
  
  event_json := request_data.event_data;
  
  -- Créer l'événement à partir des données JSON
  INSERT INTO events (
    title,
    description,
    date,
    location_id,
    image_url,
    category,
    price,
    address,
    capacity,
    door_opening_time,
    external_url,
    created_by,
    status
  ) VALUES (
    event_json->>'title',
    event_json->>'description',
    (event_json->>'date')::timestamptz,
    NULLIF(event_json->>'location_id', 'null')::UUID,
    NULLIF(event_json->>'image_url', 'null'),
    event_json->>'category',
    NULLIF(event_json->>'price', 'null')::DECIMAL,
    NULLIF(event_json->>'address', 'null'),
    NULLIF(event_json->>'capacity', 'null')::INTEGER,
    NULLIF(event_json->>'door_opening_time', 'null'),
    NULLIF(event_json->>'external_url', 'null'),
    request_data.requested_by,
    'approved' -- Les événements créés depuis une demande sont automatiquement approuvés
  ) RETURNING id INTO new_event_id;
  
  -- Lier l'organisateur si présent dans event_data
  IF event_json->>'organizer_id' IS NOT NULL AND event_json->>'organizer_id' != 'null' THEN
    INSERT INTO event_organizers (event_id, organizer_id)
    VALUES (new_event_id, (event_json->>'organizer_id')::UUID)
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Mettre à jour la demande pour marquer qu'elle a été convertie
  UPDATE user_requests
  SET 
    status = 'approved',
    reviewed_by = current_user_id,
    reviewed_at = NOW(),
    notes = COALESCE(notes, '') || E'\nConverti en événement ID: ' || new_event_id::TEXT
  WHERE id = request_id;
  
  RETURN new_event_id;
END;
$$;

-- Commentaire sur la fonction
COMMENT ON FUNCTION convert_event_request_to_event(UUID) IS 
'Convertit une demande d''événement (dans user_requests avec request_type=''event_creation'') en événement réel. Seuls les administrateurs peuvent utiliser cette fonction.';

