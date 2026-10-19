-- Jeune public : événement pensé pour les enfants ou les familles (conte, spectacle « dès 3 ans »,
-- atelier 7-10 ans, boum…). Rempli par la collecte (catégorie de la source, âge ou mention « jeune
-- public » dans le titre ou la description) et modifiable dans l'admin.
--
-- Indicateur seulement : app_events() ne filtre pas dessus. L'app peut s'en servir pour signaler ou
-- masquer ces événements (ajouter la colonne à `_eventColumns` côté app).

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS is_young_audience boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.is_young_audience IS
  'Jeune public : événement pensé pour les enfants ou les familles. Rempli par la collecte, modifiable dans l''admin.';

-- Rollback :
-- ALTER TABLE public.events DROP COLUMN IF EXISTS is_young_audience;
