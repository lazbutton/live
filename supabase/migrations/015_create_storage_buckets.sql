-- Créer les buckets Supabase Storage pour les images
-- Note: Les buckets doivent être créés via l'API Supabase ou l'interface web
-- Ce fichier documente les buckets nécessaires:
-- 1. event-images - Pour les images des événements
-- 2. locations-images - Pour les images des lieux
-- 3. organizers-images - Pour les logos et icônes des organisateurs

-- Les buckets doivent être créés avec les paramètres suivants:
-- - Public: true (pour pouvoir accéder aux images via URL publique)
-- - File size limit: 10 MB (géré côté client par compression)
-- - Allowed MIME types: image/*

-- Pour créer les buckets via SQL (nécessite les extensions appropriées):
-- Note: La création de buckets via SQL peut varier selon la version de Supabase
-- Il est recommandé de les créer via l'interface web Supabase Storage

-- Instructions pour créer les buckets via l'interface Supabase:
-- 1. Allez dans votre projet Supabase
-- 2. Cliquez sur "Storage" dans le menu de gauche
-- 3. Cliquez sur "New bucket"
-- 4. Créez les trois buckets suivants:
--    - event-images (public: true)
--    - locations-images (public: true)
--    - organizers-images (public: true)
-- 5. Pour chaque bucket, activez "Public bucket" dans les paramètres

-- Configuration des politiques RLS pour les buckets (si nécessaire):
-- Les buckets publics ne nécessitent pas de politiques RLS complexes pour la lecture
-- Mais vous pouvez ajouter des politiques pour limiter l'upload aux utilisateurs authentifiés

-- Exemple de politique RLS pour permettre l'upload aux utilisateurs authentifiés:
-- (À adapter selon vos besoins de sécurité)

-- CREATE POLICY "Authenticated users can upload images"
-- ON storage.objects FOR INSERT
-- TO authenticated
-- WITH CHECK (
--   bucket_id = 'event-images' OR
--   bucket_id = 'locations-images' OR
--   bucket_id = 'organizers-images'
-- );

-- CREATE POLICY "Public can view images"
-- ON storage.objects FOR SELECT
-- TO public
-- USING (
--   bucket_id = 'event-images' OR
--   bucket_id = 'locations-images' OR
--   bucket_id = 'organizers-images'
-- );

