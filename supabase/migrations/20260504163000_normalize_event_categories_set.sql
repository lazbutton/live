-- Normalize event categories to a short curated set for the app filters.
-- Target visible set:
-- 1. Concert
-- 2. DJ Set
-- 3. Theatre
-- 4. Danse
-- 5. Expo
-- 6. Cinema
-- 7. Rencontre
-- 8. Atelier

BEGIN;

-- 1) Target categories (short labels used in the app)
WITH category_target(name, display_order) AS (
  VALUES
    ('Concert', 1),
    ('DJ Set', 2),
    ('Theatre', 3),
    ('Danse', 4),
    ('Expo', 5),
    ('Cinema', 6),
    ('Rencontre', 7),
    ('Atelier', 8)
)
INSERT INTO categories (name, description, display_order, is_active)
SELECT
  t.name,
  'Categorie normalisee',
  t.display_order,
  true
FROM category_target t
ON CONFLICT (name) DO UPDATE
SET
  display_order = EXCLUDED.display_order,
  is_active = true;

-- 2) Normalize events.category (can store either legacy name or legacy uuid as text)
WITH category_map(old_name, new_name) AS (
  VALUES
    -- Concert family
    ('concert', 'Concert'),
    ('musique', 'Concert'),
    ('music', 'Concert'),
    ('jam', 'Concert'),
    ('acoustic', 'Concert'),
    ('rock', 'Concert'),
    ('jazz', 'Concert'),
    ('festival', 'Concert'),
    -- DJ/club family
    ('dj set', 'DJ Set'),
    ('dj', 'DJ Set'),
    ('techno', 'DJ Set'),
    ('house', 'DJ Set'),
    ('electro', 'DJ Set'),
    -- Stage/performance
    ('theatre', 'Theatre'),
    ('theater', 'Theatre'),
    ('théatre', 'Theatre'),
    ('spectacle', 'Theatre'),
    ('danse', 'Danse'),
    -- Visual arts
    ('expo', 'Expo'),
    ('vernissage', 'Expo'),
    ('art', 'Expo'),
    -- Cinema/projection
    ('projection/cine', 'Cinema'),
    ('projection/ciné', 'Cinema'),
    ('projection', 'Cinema'),
    ('cinema', 'Cinema'),
    ('cinéma', 'Cinema'),
    ('cine', 'Cinema'),
    ('ciné', 'Cinema'),
    -- Talks/meetups
    ('conference', 'Rencontre'),
    ('conférence', 'Rencontre'),
    ('rencontre', 'Rencontre'),
    -- Workshops
    ('atelier', 'Atelier'),
    -- Out-of-scope legacy fallback for cultural app
    ('sport', 'Rencontre')
),
resolved_map AS (
  SELECT DISTINCT
    c_old.id AS old_id,
    c_old.name AS old_name,
    c_new.id AS new_id,
    c_new.name AS new_name
  FROM categories c_old
  JOIN category_map m
    ON lower(trim(c_old.name)) = m.old_name
  JOIN categories c_new
    ON c_new.name = m.new_name
)
UPDATE events e
SET category = rm.new_name
FROM resolved_map rm
WHERE e.category = rm.old_id::text
   OR lower(trim(e.category)) = lower(trim(rm.old_name));

-- Extra safety: textual values that may not exist in categories anymore
WITH category_map(old_name, new_name) AS (
  VALUES
    ('concert', 'Concert'),
    ('musique', 'Concert'),
    ('music', 'Concert'),
    ('jam', 'Concert'),
    ('acoustic', 'Concert'),
    ('rock', 'Concert'),
    ('jazz', 'Concert'),
    ('festival', 'Concert'),
    ('dj set', 'DJ Set'),
    ('dj', 'DJ Set'),
    ('techno', 'DJ Set'),
    ('house', 'DJ Set'),
    ('electro', 'DJ Set'),
    ('theatre', 'Theatre'),
    ('theater', 'Theatre'),
    ('théatre', 'Theatre'),
    ('spectacle', 'Theatre'),
    ('danse', 'Danse'),
    ('expo', 'Expo'),
    ('vernissage', 'Expo'),
    ('art', 'Expo'),
    ('projection/cine', 'Cinema'),
    ('projection/ciné', 'Cinema'),
    ('projection', 'Cinema'),
    ('cinema', 'Cinema'),
    ('cinéma', 'Cinema'),
    ('cine', 'Cinema'),
    ('ciné', 'Cinema'),
    ('conference', 'Rencontre'),
    ('conférence', 'Rencontre'),
    ('rencontre', 'Rencontre'),
    ('atelier', 'Atelier'),
    ('sport', 'Rencontre')
)
UPDATE events e
SET category = m.new_name
FROM category_map m
WHERE lower(trim(e.category)) = m.old_name;

-- 3) Move user_notification_categories to new category ids
WITH category_map(old_name, new_name) AS (
  VALUES
    ('concert', 'Concert'),
    ('musique', 'Concert'),
    ('music', 'Concert'),
    ('jam', 'Concert'),
    ('acoustic', 'Concert'),
    ('rock', 'Concert'),
    ('jazz', 'Concert'),
    ('festival', 'Concert'),
    ('dj set', 'DJ Set'),
    ('dj', 'DJ Set'),
    ('techno', 'DJ Set'),
    ('house', 'DJ Set'),
    ('electro', 'DJ Set'),
    ('theatre', 'Theatre'),
    ('theater', 'Theatre'),
    ('théatre', 'Theatre'),
    ('spectacle', 'Theatre'),
    ('danse', 'Danse'),
    ('expo', 'Expo'),
    ('vernissage', 'Expo'),
    ('art', 'Expo'),
    ('projection/cine', 'Cinema'),
    ('projection/ciné', 'Cinema'),
    ('projection', 'Cinema'),
    ('cinema', 'Cinema'),
    ('cinéma', 'Cinema'),
    ('cine', 'Cinema'),
    ('ciné', 'Cinema'),
    ('conference', 'Rencontre'),
    ('conférence', 'Rencontre'),
    ('rencontre', 'Rencontre'),
    ('atelier', 'Atelier'),
    ('sport', 'Rencontre')
),
resolved_map AS (
  SELECT DISTINCT
    c_old.id AS old_id,
    c_new.id AS new_id
  FROM categories c_old
  JOIN category_map m
    ON lower(trim(c_old.name)) = m.old_name
  JOIN categories c_new
    ON c_new.name = m.new_name
)
INSERT INTO user_notification_categories (user_id, category_id, created_at)
SELECT
  unc.user_id,
  rm.new_id,
  unc.created_at
FROM user_notification_categories unc
JOIN resolved_map rm
  ON unc.category_id = rm.old_id
WHERE rm.old_id <> rm.new_id
ON CONFLICT (user_id, category_id) DO NOTHING;

WITH category_map(old_name, new_name) AS (
  VALUES
    ('concert', 'Concert'),
    ('musique', 'Concert'),
    ('music', 'Concert'),
    ('jam', 'Concert'),
    ('acoustic', 'Concert'),
    ('rock', 'Concert'),
    ('jazz', 'Concert'),
    ('festival', 'Concert'),
    ('dj set', 'DJ Set'),
    ('dj', 'DJ Set'),
    ('techno', 'DJ Set'),
    ('house', 'DJ Set'),
    ('electro', 'DJ Set'),
    ('theatre', 'Theatre'),
    ('theater', 'Theatre'),
    ('théatre', 'Theatre'),
    ('spectacle', 'Theatre'),
    ('danse', 'Danse'),
    ('expo', 'Expo'),
    ('vernissage', 'Expo'),
    ('art', 'Expo'),
    ('projection/cine', 'Cinema'),
    ('projection/ciné', 'Cinema'),
    ('projection', 'Cinema'),
    ('cinema', 'Cinema'),
    ('cinéma', 'Cinema'),
    ('cine', 'Cinema'),
    ('ciné', 'Cinema'),
    ('conference', 'Rencontre'),
    ('conférence', 'Rencontre'),
    ('rencontre', 'Rencontre'),
    ('atelier', 'Atelier'),
    ('sport', 'Rencontre')
),
resolved_map AS (
  SELECT DISTINCT
    c_old.id AS old_id,
    c_new.id AS new_id
  FROM categories c_old
  JOIN category_map m
    ON lower(trim(c_old.name)) = m.old_name
  JOIN categories c_new
    ON c_new.name = m.new_name
)
DELETE FROM user_notification_categories unc
USING resolved_map rm
WHERE unc.category_id = rm.old_id
  AND rm.old_id <> rm.new_id;

-- 4) Normalize user_notification_preferences.category_ids (text[] of category uuids)
WITH category_map(old_name, new_name) AS (
  VALUES
    ('concert', 'Concert'),
    ('musique', 'Concert'),
    ('music', 'Concert'),
    ('jam', 'Concert'),
    ('acoustic', 'Concert'),
    ('rock', 'Concert'),
    ('jazz', 'Concert'),
    ('festival', 'Concert'),
    ('dj set', 'DJ Set'),
    ('dj', 'DJ Set'),
    ('techno', 'DJ Set'),
    ('house', 'DJ Set'),
    ('electro', 'DJ Set'),
    ('theatre', 'Theatre'),
    ('theater', 'Theatre'),
    ('théatre', 'Theatre'),
    ('spectacle', 'Theatre'),
    ('danse', 'Danse'),
    ('expo', 'Expo'),
    ('vernissage', 'Expo'),
    ('art', 'Expo'),
    ('projection/cine', 'Cinema'),
    ('projection/ciné', 'Cinema'),
    ('projection', 'Cinema'),
    ('cinema', 'Cinema'),
    ('cinéma', 'Cinema'),
    ('cine', 'Cinema'),
    ('ciné', 'Cinema'),
    ('conference', 'Rencontre'),
    ('conférence', 'Rencontre'),
    ('rencontre', 'Rencontre'),
    ('atelier', 'Atelier'),
    ('sport', 'Rencontre')
),
resolved_map AS (
  SELECT DISTINCT
    c_old.id AS old_id,
    c_new.id AS new_id
  FROM categories c_old
  JOIN category_map m
    ON lower(trim(c_old.name)) = m.old_name
  JOIN categories c_new
    ON c_new.name = m.new_name
)
UPDATE user_notification_preferences up
SET category_ids = (
  SELECT COALESCE(array_agg(DISTINCT COALESCE(rm.new_id::text, cid)), ARRAY[]::text[])
  FROM unnest(COALESCE(up.category_ids, ARRAY[]::text[])) AS cid
  LEFT JOIN resolved_map rm
    ON cid = rm.old_id::text
)
WHERE up.category_ids IS NOT NULL;

-- 5) Keep only target categories active in filters
WITH category_target(name) AS (
  VALUES
    ('Concert'),
    ('DJ Set'),
    ('Theatre'),
    ('Danse'),
    ('Expo'),
    ('Cinema'),
    ('Rencontre'),
    ('Atelier')
)
UPDATE categories c
SET is_active = EXISTS (
  SELECT 1
  FROM category_target t
  WHERE t.name = c.name
);

-- 6) Ensure target display order is applied
WITH category_target(name, display_order) AS (
  VALUES
    ('Concert', 1),
    ('DJ Set', 2),
    ('Theatre', 3),
    ('Danse', 4),
    ('Expo', 5),
    ('Cinema', 6),
    ('Rencontre', 7),
    ('Atelier', 8)
)
UPDATE categories c
SET display_order = t.display_order
FROM category_target t
WHERE c.name = t.name;

COMMIT;
