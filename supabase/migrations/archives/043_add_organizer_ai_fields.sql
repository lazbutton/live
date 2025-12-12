-- Créer une table pour stocker les champs à demander à l'IA pour chaque organisateur/lieu
CREATE TABLE IF NOT EXISTS organizer_ai_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID REFERENCES organizers(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Contrainte : soit organizer_id, soit location_id doit être défini, mais pas les deux
  CONSTRAINT organizer_ai_fields_owner_check CHECK (
    (organizer_id IS NOT NULL AND location_id IS NULL) OR
    (organizer_id IS NULL AND location_id IS NOT NULL)
  )
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_organizer_ai_fields_organizer_id ON organizer_ai_fields(organizer_id) WHERE organizer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizer_ai_fields_location_id ON organizer_ai_fields(location_id) WHERE location_id IS NOT NULL;

-- Index uniques partiels pour garantir qu'un champ n'est défini qu'une fois par organisateur/lieu
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizer_ai_fields_unique_organizer 
  ON organizer_ai_fields(organizer_id, field_name) 
  WHERE organizer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizer_ai_fields_unique_location 
  ON organizer_ai_fields(location_id, field_name) 
  WHERE location_id IS NOT NULL;

-- RLS Policies
ALTER TABLE organizer_ai_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les administrateurs peuvent gérer les champs IA des organisateurs"
  ON organizer_ai_fields
  FOR ALL
  USING (is_user_admin());

-- Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_organizer_ai_fields_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organizer_ai_fields_updated_at
  BEFORE UPDATE ON organizer_ai_fields
  FOR EACH ROW
  EXECUTE FUNCTION update_organizer_ai_fields_updated_at();

-- Insérer les champs par défaut (tous activés) pour les organisateurs existants si nécessaire
-- Cette partie peut être commentée si on préfère que chaque organisateur configure manuellement
-- DO $$
-- DECLARE
--   default_fields TEXT[] := ARRAY['title', 'description', 'date', 'end_date', 'price', 'presale_price', 'subscriber_price', 'location', 'address', 'category', 'tags', 'capacity', 'door_opening_time', 'is_full'];
--   org RECORD;
-- BEGIN
--   FOR org IN SELECT id FROM organizers LOOP
--     FOREACH field_name IN ARRAY default_fields LOOP
--       INSERT INTO organizer_ai_fields (organizer_id, field_name, enabled)
--       VALUES (org.id, field_name, true)
--       ON CONFLICT (organizer_id, field_name) DO NOTHING;
--     END LOOP;
--   END LOOP;
-- END $$;

