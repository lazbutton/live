-- Bootstrap des notifications produit:
-- - crée les préférences manquantes
-- - active les notifications par défaut
-- - sélectionne toutes les catégories actives pour les comptes non initialisés

INSERT INTO public.user_notification_preferences (
  user_id,
  frequency,
  is_enabled,
  category_ids
)
SELECT
  u.id,
  'daily',
  true,
  COALESCE(
    ARRAY(
      SELECT c.id::text
      FROM public.categories c
      WHERE c.is_active = true
      ORDER BY c.display_order ASC, c.name ASC
    ),
    ARRAY[]::text[]
  )
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_notification_preferences p
  WHERE p.user_id = u.id
);

UPDATE public.user_notification_preferences p
SET
  frequency = CASE
    WHEN p.frequency = 'never' OR p.frequency IS NULL OR btrim(p.frequency) = '' THEN 'daily'
    ELSE p.frequency
  END,
  is_enabled = CASE
    WHEN p.is_enabled IS DISTINCT FROM true THEN true
    ELSE p.is_enabled
  END,
  category_ids = COALESCE(
    NULLIF(p.category_ids, ARRAY[]::text[]),
    ARRAY(
      SELECT c.id::text
      FROM public.categories c
      WHERE c.is_active = true
      ORDER BY c.display_order ASC, c.name ASC
    )
  )
WHERE
  p.frequency = 'never'
  OR p.frequency IS NULL
  OR btrim(p.frequency) = ''
  OR p.is_enabled IS DISTINCT FROM true
  OR p.category_ids IS NULL
  OR cardinality(p.category_ids) = 0;

INSERT INTO public.user_notification_categories (user_id, category_id)
SELECT
  p.user_id,
  c.id
FROM public.user_notification_preferences p
JOIN public.categories c
  ON c.is_active = true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_notification_categories unc
  WHERE unc.user_id = p.user_id
)
ON CONFLICT (user_id, category_id) DO NOTHING;
