-- Ajouter un champ pour stocker les indications/hints à donner à l'IA pour chaque champ
ALTER TABLE organizer_ai_fields
ADD COLUMN IF NOT EXISTS ai_hint TEXT;

-- Commentaire pour documenter le champ
COMMENT ON COLUMN organizer_ai_fields.ai_hint IS 'Indications spécifiques à donner à l''IA pour extraire ce champ (ex: "Le prix est toujours écrit en gras", "La date est au format DD/MM/YYYY")';

