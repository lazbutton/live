-- ============================================
-- Migration : Lier les organisateurs existants aux utilisateurs
-- Date : 2025-01-15
-- Description : Crée des associations dans user_organizers pour tous les organisateurs
--               existants qui n'ont pas encore d'association
-- ============================================

-- ============================================
-- CHANGEMENTS
-- ============================================

-- Cette migration crée des associations user_organizers pour tous les organisateurs existants
-- qui n'ont pas encore d'association. Les organisateurs seront liés à tous les utilisateurs
-- ayant le rôle admin dans user_metadata.role = 'admin'

-- ============================================
-- CODE SQL
-- ============================================

-- Option 1 : Lier tous les organisateurs à tous les admins existants
-- Cette approche donne accès à tous les organisateurs à tous les admins

INSERT INTO public.user_organizers (user_id, organizer_id, role)
SELECT DISTINCT
    au.id as user_id,
    o.id as organizer_id,
    'owner' as role
FROM public.organizers o
CROSS JOIN auth.users au
WHERE 
    -- Vérifier que l'utilisateur est admin
    (au.raw_user_meta_data->>'role') = 'admin'
    -- Vérifier que l'association n'existe pas déjà
    AND NOT EXISTS (
        SELECT 1 FROM public.user_organizers uo
        WHERE uo.user_id = au.id 
        AND uo.organizer_id = o.id
    )
ON CONFLICT (user_id, organizer_id) DO NOTHING;

-- Lier aussi les lieux-organisateurs (locations avec is_organizer = true) aux admins
-- NOTE : Cette requête nécessite que la migration 20250115000002_allow_location_organizers_in_user_organizers.sql
-- ait été exécutée au préalable pour modifier la contrainte FK.
INSERT INTO public.user_organizers (user_id, organizer_id, role)
SELECT DISTINCT
    au.id as user_id,
    l.id as organizer_id,
    'owner' as role
FROM public.locations l
CROSS JOIN auth.users au
WHERE 
    -- Vérifier que c'est un lieu-organisateur
    l.is_organizer = true
    -- Vérifier que l'utilisateur est admin
    AND (au.raw_user_meta_data->>'role') = 'admin'
    -- Vérifier que l'association n'existe pas déjà
    AND NOT EXISTS (
        SELECT 1 FROM public.user_organizers uo
        WHERE uo.user_id = au.id 
        AND uo.organizer_id = l.id
    )
ON CONFLICT (user_id, organizer_id) DO NOTHING;

-- ============================================
-- ALTERNATIVE : Lier seulement aux organisateurs qui ont un user_id défini
-- ============================================

-- Si vous préférez lier les organisateurs uniquement aux utilisateurs 
-- spécifiés dans organizers.user_id, utilisez cette requête à la place :

/*
INSERT INTO public.user_organizers (user_id, organizer_id, role)
SELECT DISTINCT
    o.user_id as user_id,
    o.id as organizer_id,
    'owner' as role
FROM public.organizers o
WHERE 
    o.user_id IS NOT NULL
    -- Vérifier que l'association n'existe pas déjà
    AND NOT EXISTS (
        SELECT 1 FROM public.user_organizers uo
        WHERE uo.user_id = o.user_id 
        AND uo.organizer_id = o.id
    )
ON CONFLICT (user_id, organizer_id) DO NOTHING;
*/

-- ============================================
-- VÉRIFICATION
-- ============================================

-- Vous pouvez exécuter cette requête pour vérifier les résultats :
-- SELECT 
--     o.name as organizer_name,
--     au.email as user_email,
--     uo.role
-- FROM user_organizers uo
-- JOIN organizers o ON o.id = uo.organizer_id
-- JOIN auth.users au ON au.id = uo.user_id
-- ORDER BY o.name, au.email;

-- ============================================
-- ROLLBACK
-- ============================================

-- Pour annuler cette migration (supprimer les associations créées pour les admins) :
-- DELETE FROM public.user_organizers 
-- WHERE role = 'owner' 
-- AND user_id IN (
--     SELECT id FROM auth.users 
--     WHERE (raw_user_meta_data->>'role') = 'admin'
-- );

