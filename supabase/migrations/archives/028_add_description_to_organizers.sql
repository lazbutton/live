-- Ajouter le champ description aux organisateurs
ALTER TABLE organizers
ADD COLUMN IF NOT EXISTS short_description TEXT;


