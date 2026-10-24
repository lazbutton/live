-- ============================================
-- Migration : des fiches plus riches — genres, public, réservation
-- Date : 2026-10-24
-- Description : étape 1 de « Pour toi » (../live/docs/chantiers/pour-toi.md, « Des fiches plus riches » et
-- « live-admin : les fiches »), choix 9 et 10 du 2026-10-24 : ce qu'on ajoute aux fiches d'abord, le genre,
-- pour qui et la réservation, dans des listes fermées. La fiche de l'app en tire sa ligne de repères
-- (« Dès 6 ans · Sans réservation ») ; « Pour toi » en tirera des bulles plus fines (« Jazz », « Stand-up »).
-- ============================================

-- ============================================
-- CHANGEMENTS
-- ============================================

-- - event_genres : les genres, une liste fermée par catégorie (nom, phrase pour les textes de l'app comme
--   « Ajouter le jazz à Pour toi », ordre, is_active), tenue dans le back-office par l'équipe éditoriale.
--   Lisibles par tous (les actifs ; les admins voient aussi les autres), écrits par les admins.
--   Pour commencer, les listes de la fiche du chantier : Spectacle (théâtre, humour, impro, cirque,
--   marionnettes, magie, conte), Concert (rock, jazz, rap et hip-hop, électro, classique, chanson, pop,
--   musiques du monde), Danse (contemporaine, hip-hop, classique, traditionnelle), Atelier (arts plastiques,
--   textile, cuisine, écriture, musique, numérique), Cinéma (documentaire, fiction, animation, courts
--   métrages). Insérés seulement si la catégorie existe (resolve_event_category, par son nom).
-- - events :
--   - genre_ids uuid[] : les genres de l'événement, comme tag_ids ; jamais null (vide par défaut) ;
--   - audience : pour qui, `all` (tout public), `family` (en famille), `teens` (ados), `adults` (adultes) ;
--   - min_age : l'âge minimum annoncé, de 1 à 18 ans (« dès 18 mois » : 2) ;
--   - booking : la réservation, `none` (« Sans réservation »), `reservation` (« Sur réservation »),
--     `online` (« Billetterie en ligne ») ;
--   - details_to_confirm : ces champs ont été lus par la collecte ou la reprise des fiches et pas encore
--     confirmés dans le back-office (« lus, à confirmer », étape 2).
--   Null (vide pour genre_ids) : la fiche ne le dit pas. Rien n'est deviné.
-- - Le trigger events_sync_details, à l'écriture d'un événement :
--   - garde de genre_ids les genres de sa catégorie seulement, chacun une fois, dans l'ordre de la liste
--     (un id inconnu ou d'une autre catégorie s'en va ; changer de catégorie retire les genres de l'ancienne) ;
--   - recalcule is_young_audience depuis audience quand elle est connue : vrai pour `family` et `teens`, faux
--     pour `all` et `adults`. Sans audience, is_young_audience reste tel qu'écrit. La règle d'« En famille »
--     (U5 : is_young_audience ou le tag « Jeune Public ») et les versions installées de l'app ne changent pas :
--     elles lisent toujours is_young_audience. Un « tout public dès 6 ans » n'est pas du jeune public : il
--     reste dans les goûts des adultes ; les ados, si (les tranches d'âge d'« En famille » les prendront).
--   Son nom le fait passer après events_normalize_category (ordre alphabétique des triggers BEFORE) : il voit
--   l'id de la catégorie.
-- - Un genre supprimé, ou passé dans une autre catégorie, quitte les événements qui le portaient (trigger
--   event_genres_forget).
--
-- Les événements existants ne changent pas : genre_ids vide, le reste null, is_young_audience inchangé. Leur
-- reprise est l'étape 3 (un script, essai à blanc d'abord). `app_events()` et les fonctions de l'app qui rendent
-- `setof events` portent les nouvelles colonnes ; aucune ne filtre dessus. Prérequis :
-- 20261024120000_app_home_rules.sql (resolve_event_category, events_normalize_category). À appliquer d'un bloc
-- (`psql --single-transaction`) ; pas de BEGIN ni de COMMIT ici.

-- ============================================
-- CODE SQL
-- ============================================

-- Genres ---------------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_genres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Supprimer une catégorie supprime ses genres (et le trigger event_genres_forget les retire des événements).
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  -- « Théâtre », « Rap et hip-hop » : le nom d'une bulle ou d'une puce.
  name text NOT NULL CHECK (btrim(name) <> ''),
  -- « le théâtre », « l'humour » (apostrophe droite ; l'app la rend typographique) : la phrase des textes.
  phrase text NOT NULL CHECK (btrim(phrase) <> ''),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.event_genres IS
  'Genres d''événements : une liste fermée par catégorie, tenue dans le back-office (../live/docs/chantiers/pour-toi.md, « Des fiches plus riches »). Les événements les portent dans events.genre_ids. Migration 20261024170000.';
COMMENT ON COLUMN public.event_genres.phrase IS
  'Le genre dans une phrase de l''app (« Ajouter le jazz à Pour toi ») : « le jazz », « l''humour », apostrophe droite.';
COMMENT ON COLUMN public.event_genres.is_active IS
  'Faux : plus proposé (formulaire, collecte) ni lisible par l''app ; les événements qui le portent le gardent.';

-- Un nom par catégorie, casse et espaces autour ignorés.
CREATE UNIQUE INDEX IF NOT EXISTS event_genres_category_name_key
  ON public.event_genres (category_id, lower(btrim(name)));

DROP TRIGGER IF EXISTS update_event_genres_updated_at ON public.event_genres;
CREATE TRIGGER update_event_genres_updated_at
  BEFORE UPDATE ON public.event_genres
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.event_genres ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.event_genres FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.event_genres TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.event_genres TO authenticated;

DROP POLICY IF EXISTS "Genres actifs lisibles par tous" ON public.event_genres;
CREATE POLICY "Genres actifs lisibles par tous" ON public.event_genres
  FOR SELECT USING (is_active);

-- is_user_admin() lu une fois par requête ((SELECT …) : une InitPlan), pas pour chaque ligne.
DROP POLICY IF EXISTS "Admins lisent tous les genres" ON public.event_genres;
CREATE POLICY "Admins lisent tous les genres" ON public.event_genres
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT public.is_user_admin()));

DROP POLICY IF EXISTS "Admins ajoutent des genres" ON public.event_genres;
CREATE POLICY "Admins ajoutent des genres" ON public.event_genres
  FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (SELECT public.is_user_admin()));

DROP POLICY IF EXISTS "Admins modifient les genres" ON public.event_genres;
CREATE POLICY "Admins modifient les genres" ON public.event_genres
  FOR UPDATE USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT public.is_user_admin()))
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (SELECT public.is_user_admin()));

DROP POLICY IF EXISTS "Admins suppriment des genres" ON public.event_genres;
CREATE POLICY "Admins suppriment des genres" ON public.event_genres
  FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT public.is_user_admin()));

-- Les listes de départ (choix 10 : celles de la fiche du chantier, ajustées ensuite par l'équipe éditoriale).
-- Rejouable : un genre déjà là (même nom dans la même catégorie) est laissé tel quel.
INSERT INTO public.event_genres (category_id, name, phrase, display_order)
SELECT public.resolve_event_category(g.categorie), g.name, g.phrase, g.display_order
FROM (VALUES
  ('Spectacle', 'Théâtre', 'le théâtre', 1),
  ('Spectacle', 'Humour', 'l''humour', 2),
  ('Spectacle', 'Impro', 'l''impro', 3),
  ('Spectacle', 'Cirque', 'le cirque', 4),
  ('Spectacle', 'Marionnettes', 'les marionnettes', 5),
  ('Spectacle', 'Magie', 'la magie', 6),
  ('Spectacle', 'Conte', 'le conte', 7),
  ('Concert', 'Rock', 'le rock', 1),
  ('Concert', 'Jazz', 'le jazz', 2),
  ('Concert', 'Rap et hip-hop', 'le rap et le hip-hop', 3),
  ('Concert', 'Électro', 'l''électro', 4),
  ('Concert', 'Classique', 'la musique classique', 5),
  ('Concert', 'Chanson', 'la chanson', 6),
  ('Concert', 'Pop', 'la pop', 7),
  ('Concert', 'Musiques du monde', 'les musiques du monde', 8),
  ('Danse', 'Contemporaine', 'la danse contemporaine', 1),
  ('Danse', 'Hip-hop', 'la danse hip-hop', 2),
  ('Danse', 'Classique', 'la danse classique', 3),
  ('Danse', 'Traditionnelle', 'les danses traditionnelles', 4),
  ('Atelier', 'Arts plastiques', 'les arts plastiques', 1),
  ('Atelier', 'Textile', 'le textile', 2),
  ('Atelier', 'Cuisine', 'la cuisine', 3),
  ('Atelier', 'Écriture', 'l''écriture', 4),
  ('Atelier', 'Musique', 'les ateliers de musique', 5),
  ('Atelier', 'Numérique', 'le numérique', 6),
  ('Cinéma', 'Documentaire', 'le documentaire', 1),
  ('Cinéma', 'Fiction', 'la fiction', 2),
  ('Cinéma', 'Animation', 'le cinéma d''animation', 3),
  ('Cinéma', 'Courts métrages', 'les courts métrages', 4)
) AS g(categorie, name, phrase, display_order)
WHERE public.resolve_event_category(g.categorie) IS NOT NULL
ON CONFLICT DO NOTHING;

-- Les nouvelles colonnes d'events -------------------------------------------------------------------------------

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS genre_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS audience text CHECK (audience IN ('all', 'family', 'teens', 'adults')),
  ADD COLUMN IF NOT EXISTS min_age smallint CHECK (min_age BETWEEN 1 AND 18),
  ADD COLUMN IF NOT EXISTS booking text CHECK (booking IN ('none', 'reservation', 'online')),
  ADD COLUMN IF NOT EXISTS details_to_confirm boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.genre_ids IS
  'Genres de l''événement (event_genres de sa catégorie ; trigger events_sync_details), comme tag_ids. Vide : pas de genre connu.';
COMMENT ON COLUMN public.events.audience IS
  'Pour qui : all (tout public), family (en famille), teens (ados), adults (adultes) ; null : la fiche ne le dit pas. Connue, elle fixe is_young_audience (family, teens).';
COMMENT ON COLUMN public.events.min_age IS
  'Âge minimum annoncé, en années (1 à 18 ; des mois arrondis à l''année au-dessus) ; null : pas d''âge annoncé.';
COMMENT ON COLUMN public.events.booking IS
  'Réservation : none (« Sans réservation »), reservation (« Sur réservation »), online (« Billetterie en ligne ») ; null : la fiche ne le dit pas.';
COMMENT ON COLUMN public.events.details_to_confirm IS
  'Genre, public ou réservation lus par la collecte ou la reprise des fiches, pas encore confirmés dans le back-office (« lus, à confirmer »).';
COMMENT ON COLUMN public.events.is_young_audience IS
  'Jeune public : pensé pour les enfants, les familles ou les ados. Recalculé depuis audience quand elle est connue (family, teens ; trigger events_sync_details) ; sinon rempli par la collecte ou l''admin. Lu par « En famille » (U5).';

-- À l'écriture d'un événement : ses genres (ceux de sa catégorie) et son jeune public (d'après audience).
CREATE OR REPLACE FUNCTION public.sync_event_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Les genres de la catégorie de l'événement, inactifs compris (un genre retiré des listes reste sur ses
  -- événements), chacun une fois, dans l'ordre de la liste. security definer : la RLS d'event_genres ne cache
  -- pas les genres inactifs à qui écrit.
  IF cardinality(NEW.genre_ids) > 0 THEN
    NEW.genre_ids := coalesce((
      SELECT array_agg(g.id ORDER BY g.display_order, g.name, g.id)
      FROM public.event_genres AS g
      WHERE g.id = ANY (NEW.genre_ids)
        AND g.category_id::text = NEW.category
    ), '{}'::uuid[]);
  ELSE
    -- Null écrit par un client : vide.
    NEW.genre_ids := '{}'::uuid[];
  END IF;

  IF NEW.audience IS NOT NULL THEN
    NEW.is_young_audience := NEW.audience IN ('family', 'teens');
  END IF;

  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.sync_event_details() IS
  'Trigger events_sync_details : genre_ids réduit aux genres de la catégorie de l''événement (chacun une fois, ordre de la liste) ; is_young_audience recalculé depuis audience quand elle est connue (family, teens). Migration 20261024170000.';

REVOKE EXECUTE ON FUNCTION public.sync_event_details() FROM PUBLIC, anon, authenticated;

-- Après events_normalize_category (ordre alphabétique) : la catégorie est déjà un id.
DROP TRIGGER IF EXISTS events_sync_details ON public.events;
CREATE TRIGGER events_sync_details
  BEFORE INSERT OR UPDATE OF category, genre_ids, audience, is_young_audience ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_event_details();

-- Un genre supprimé, ou rangé dans une autre catégorie, quitte les événements qui le portaient.
CREATE OR REPLACE FUNCTION public.forget_event_genre()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.events AS e
  SET genre_ids = array_remove(e.genre_ids, OLD.id)
  WHERE OLD.id = ANY (e.genre_ids)
    AND (TG_OP = 'DELETE' OR e.category IS DISTINCT FROM NEW.category_id::text);
  RETURN NULL;
END
$$;

COMMENT ON FUNCTION public.forget_event_genre() IS
  'Trigger event_genres_forget : un genre supprimé, ou passé dans une autre catégorie, est retiré d''events.genre_ids. Migration 20261024170000.';

REVOKE EXECUTE ON FUNCTION public.forget_event_genre() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS event_genres_forget ON public.event_genres;
CREATE TRIGGER event_genres_forget
  AFTER DELETE OR UPDATE OF category_id ON public.event_genres
  FOR EACH ROW
  EXECUTE FUNCTION public.forget_event_genre();

-- Vérification (SQL Editor) : les 29 genres de départ (moins, si une catégorie n'a pas été trouvée par son nom) ;
-- aucun événement changé.
-- select c.name, count(*) from public.event_genres g join public.categories c on c.id = g.category_id group by 1;
-- select count(*) filter (where audience is not null or booking is not null or min_age is not null
--   or cardinality(genre_ids) > 0 or details_to_confirm) from public.events;

-- ============================================
-- ROLLBACK
-- ============================================

-- Avant la sortie de la version de l'app qui lit audience, min_age et booking (sa fiche répondrait 400), dans cet
-- ordre. is_young_audience garde la valeur que le trigger lui a donnée.
-- DROP TRIGGER IF EXISTS events_sync_details ON public.events;
-- DROP FUNCTION IF EXISTS public.sync_event_details();
-- DROP TRIGGER IF EXISTS event_genres_forget ON public.event_genres;
-- DROP FUNCTION IF EXISTS public.forget_event_genre();
-- ALTER TABLE public.events
--   DROP COLUMN IF EXISTS details_to_confirm,
--   DROP COLUMN IF EXISTS booking,
--   DROP COLUMN IF EXISTS min_age,
--   DROP COLUMN IF EXISTS audience,
--   DROP COLUMN IF EXISTS genre_ids;
-- DROP TABLE IF EXISTS public.event_genres;
-- COMMENT ON COLUMN public.events.is_young_audience IS
--   'Jeune public : événement pensé pour les enfants ou les familles. Rempli par la collecte, modifiable dans l''admin.';
