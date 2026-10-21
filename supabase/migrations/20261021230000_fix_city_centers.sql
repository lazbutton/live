-- Villes : un centre fixe (la mairie) et deux lignes fautives corrigées.
--
-- Suite de la zone de l'app (20261021220000_create_app_zone.sql, ../live/docs/VILLES.md) : la zone se mesure
-- depuis le centre de la ville choisie. Jusqu'ici ce centre était la moyenne des coordonnées de ses lieux,
-- recalculée à chaque lieu modifié (refresh_city_center) : il bougeait sans que personne ne change rien, et celui
-- d'Orléans tombait à 800 m de la place de l'Étape. Décision de l'utilisateur du 2026-10-21 : corriger aussi les
-- données.
--
-- 1. refresh_city_center ne remplace plus un centre existant : une ville créée par une adresse prend celui de ses
--    lieux tant qu'elle n'en a pas, puis le garde.
-- 2. Le centre de chaque ville connue le 2026-10-21 : les coordonnées de sa mairie, prises dans la base officielle
--    des communes (geo.api.gouv.fr, champ `mairie`, code INSEE en commentaire). Orléans tombe sur le centre de
--    secours de l'app (47,9028 ; 1,9093).
-- 3. « SAINT DENIS EN VAL » (en capitales, sans centre) : la commune de Saint-Denis-en-Val, renommée ; même
--    libellé normalisé, même slug.
-- 4. « place sainte beuve orleans » : une adresse prise pour une ville. Ce qui y est rattaché (lieux,
--    événements, grands événements ; rien de public le 2026-10-21) passe à Orléans, puis la ligne est supprimée.
--
-- Par slug : sans effet sur une base qui n'a pas ces villes (base de test). Rejouable. Prérequis :
-- 20260322110000 (cities, refresh_city_center), 20261020220000 (droits de refresh_city_center).

CREATE OR REPLACE FUNCTION public.refresh_city_center(p_city_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_city_id IS NULL THEN
        RETURN;
    END IF;

    -- Seulement une ville sans centre : un centre posé (la mairie) ne bouge plus avec les lieux.
    UPDATE public.cities AS c
    SET
        center_lat = stats.avg_lat,
        center_lng = stats.avg_lng
    FROM (
        SELECT
            city_id,
            avg(latitude)::numeric(10,8) AS avg_lat,
            avg(longitude)::numeric(11,8) AS avg_lng
        FROM public.locations
        WHERE city_id = p_city_id
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
        GROUP BY city_id
    ) AS stats
    WHERE c.id = stats.city_id
      AND c.center_lat IS NULL
      AND stats.avg_lat IS NOT NULL
      AND stats.avg_lng IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.refresh_city_center(uuid) IS
  'Donne à une ville sans centre la moyenne des coordonnées de ses lieux ; un centre existant (la mairie, migration 20261021230000) ne change plus.';

REVOKE ALL ON FUNCTION public.refresh_city_center(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_city_center(uuid) TO service_role;

UPDATE public.cities AS c
SET center_lat = v.lat, center_lng = v.lng
FROM (VALUES
  ('orleans', 47.902800, 1.909300), -- Orléans (45234)
  ('saran', 47.951700, 1.874500), -- Saran (45302)
  ('fleury-les-aubrais', 47.931200, 1.920900), -- Fleury-les-Aubrais (45147)
  ('la-chapelle-saint-mesmin', 47.887200, 1.840400), -- La Chapelle-Saint-Mesmin (45075)
  ('olivet', 47.865300, 1.897200), -- Olivet (45232)
  ('saint-jean-de-la-ruelle', 47.912700, 1.874200), -- Saint-Jean-de-la-Ruelle (45285)
  ('saint-jean-de-braye', 47.912100, 1.970900), -- Saint-Jean-de-Braye (45284)
  ('saint-jean-le-blanc', 47.893000, 1.915500), -- Saint-Jean-le-Blanc (45286)
  ('saint-pryve-saint-mesmin', 47.881000, 1.867800), -- Saint-Pryvé-Saint-Mesmin (45298)
  ('saint-denis-en-val', 47.879000, 1.955500), -- Saint-Denis-en-Val (45274)
  ('checy', 47.891500, 2.025300), -- Chécy (45089)
  ('la-ferte-saint-aubin', 47.720100, 1.941000), -- La Ferté-Saint-Aubin (45146)
  ('baule', 47.811200, 1.670700), -- Baule (45024)
  ('vitry-aux-loges', 47.939900, 2.266400), -- Vitry-aux-Loges (45346)
  ('chalette-sur-loing', 48.014800, 2.732000), -- Châlette-sur-Loing (45068)
  ('vald-yerre', 48.097900, 1.122800), -- Vald'Yerre (28012)
  ('joue-les-tours', 47.351500, 0.662300), -- Joué-lès-Tours (37122)
  ('paris', 48.856400, 2.352500) -- Paris (75056)
) AS v(slug, lat, lng)
WHERE c.slug = v.slug;

UPDATE public.cities
SET label = 'Saint-Denis-en-Val'
WHERE slug = 'saint-denis-en-val'
  AND label = 'SAINT DENIS EN VAL';

UPDATE public.locations AS l
SET city_id = o.id
FROM public.cities AS f, public.cities AS o
WHERE f.slug = 'place-sainte-beuve-orleans' AND o.slug = 'orleans' AND l.city_id = f.id;

UPDATE public.events AS e
SET city_id = o.id
FROM public.cities AS f, public.cities AS o
WHERE f.slug = 'place-sainte-beuve-orleans' AND o.slug = 'orleans' AND e.city_id = f.id;

UPDATE public.major_events AS m
SET city_id = o.id
FROM public.cities AS f, public.cities AS o
WHERE f.slug = 'place-sainte-beuve-orleans' AND o.slug = 'orleans' AND m.city_id = f.id;

DELETE FROM public.cities AS f
WHERE f.slug = 'place-sainte-beuve-orleans'
  AND EXISTS (SELECT 1 FROM public.cities AS o WHERE o.slug = 'orleans');

-- Vérification (SQL Editor) :
-- select label, slug, center_lat, center_lng from public.cities order by label;

-- Rollback : recréer refresh_city_center de 20260322110000 (sans `c.center_lat IS NULL`) ; les anciens centres
-- se recalculent par `select public.refresh_city_center(id) from public.cities` après avoir remis les centres à
-- NULL. La ligne supprimée ne revient pas (aucune donnée publique n'y était rattachée).
