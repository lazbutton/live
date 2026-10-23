-- Festivals : un festival est un événement qui contient les autres, avec ses lieux à lui.
--
-- Décision du 2026-10-23 (../live/docs/FESTIVALS.md, § 4 à 6 ; maquettes du lot 5, MAQUETTES_REFONTE.md) : un
-- festival est un événement de la catégorie Festival ; ses événements y sont rattachés par events.festival_id ;
-- sa page dans l'app est sa fiche en mode festival. Il remplace les Multi-événements (major_events, créés en mars,
-- jamais publiés), retirés plus tard. Contrat pour l'app : docs/API_APP.md (« Festivals »).
--
-- - events.festival_id : le festival dont l'événement fait partie (vers events.id ; le festival supprimé, le
--   rattachement tombe). Un événement ne fait pas partie de lui-même (events_festival_id_not_self) ; un festival
--   n'est pas dans un festival (check_event_festival, déclencheur) : un événement rattaché ne contient rien, un
--   événement qui en contient d'autres n'est rattaché à rien. La base ne regarde pas la catégorie : le
--   back-office ne propose que les fiches de la catégorie Festival. Index partiel : seuls les rattachés.
-- - festival_locations : les lieux d'un festival, dans l'ordre (sort_index), dès son annonce ; la fiche garde
--   dans location_id le premier, pour ce qui n'en lit qu'un (la zone, versions installées de l'app, page publique,
--   carte du soir sans programme) : le back-office l'y met. Une clé `id` et l'unicité de (festival_id, location_id),
--   pas une clé primaire sur ces deux colonnes : PostgREST y verrait une relation plusieurs-à-plusieurs entre
--   events et locations, et tout `locations(…)` embarqué depuis events (l'app, l'admin) répondrait 400
--   (PGRST201, « more than one relationship was found ») ; essayé le 2026-10-23 sur PostgREST v13.0.5, la
--   version de la prod. RLS : lisible avec son festival (la RLS d'events : le public, les festivals
--   approuvés ; l'admin, tous), écrite par l'admin.
-- - app_festival_events(at_time) : pour l'accueil, sur le modèle d'app_event_series (U14), une ligne par
--   événement à venir rattaché à un festival visible.
-- La zone ne change pas (décision du 2026-10-23, session de coordination) : un festival y entre par son
-- location_id, son premier lieu, comme tout événement, et ses événements chacun par le leur. La liste de
-- l'accueil (app_events_in_zone) et les comptes (app_events_in_range) disent ainsi la même chose (U3).
--
-- `language sql`, `stable`, `security invoker`, sans clause SET, comme app_events() : la RLS de l'appelant
-- s'applique. Le déclencheur est `security definer` : la règle ne dépend pas de ce que voit celui qui écrit (un
-- festival en attente, invisible pour un organisateur, compte aussi). Tous les objets sont qualifiés.
-- Prérequis : 20261021220000_create_app_zone.sql (app_events_in_range à neuf arguments). Rien n'est remplacé :
-- une colonne, une table, deux fonctions, un déclencheur. À appliquer d'un bloc (`psql --single-transaction`) ;
-- pas de BEGIN ni de COMMIT ici.

-- events.festival_id ---------------------------------------------------------------------------------

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS festival_id uuid;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_festival_id_fkey;
ALTER TABLE public.events
  ADD CONSTRAINT events_festival_id_fkey
  FOREIGN KEY (festival_id) REFERENCES public.events (id) ON DELETE SET NULL;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_festival_id_not_self;
ALTER TABLE public.events
  ADD CONSTRAINT events_festival_id_not_self CHECK (festival_id <> id);

COMMENT ON COLUMN public.events.festival_id IS
  'Festival dont l''événement fait partie (une fiche de la catégorie Festival) ; null : aucun. Jamais lui-même ; un festival n''est pas dans un festival (check_event_festival). Le festival supprimé, le rattachement tombe. Migration 20261023120000.';

-- Le programme d'un festival, et le contrôle du déclencheur : seuls les événements rattachés.
CREATE INDEX IF NOT EXISTS idx_events_festival_id
  ON public.events USING btree (festival_id)
  WHERE festival_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.check_event_festival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  festival_du_festival uuid;
BEGIN
  IF NEW.festival_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Le festival choisi n'est lui-même dans aucun festival. FOR SHARE : un rattachement du festival lancé en
  -- même temps attend la fin de celui-ci, puis y trouve cet événement (et l'inverse).
  SELECT f.festival_id INTO festival_du_festival
  FROM public.events AS f
  WHERE f.id = NEW.festival_id
  FOR SHARE;

  IF festival_du_festival IS NOT NULL THEN
    RAISE EXCEPTION 'Un festival n''est pas dans un festival : % fait partie de %.', NEW.festival_id, festival_du_festival
      USING ERRCODE = '23514';
  END IF;

  -- L'événement rattaché ne contient aucun événement.
  IF EXISTS (SELECT 1 FROM public.events AS c WHERE c.festival_id = NEW.id) THEN
    RAISE EXCEPTION 'Un festival n''est pas dans un festival : % contient des événements.', NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.check_event_festival() IS
  'Déclencheur d''events : refuse (23514) un rattachement qui mettrait un festival dans un festival (le festival choisi fait déjà partie d''un festival, ou l''événement en contient d''autres). Migration 20261023120000.';

DROP TRIGGER IF EXISTS trg_events_check_festival ON public.events;
CREATE TRIGGER trg_events_check_festival
  BEFORE INSERT OR UPDATE OF festival_id ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.check_event_festival();

-- festival_locations --------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.festival_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL,
  location_id uuid NOT NULL,
  sort_index integer NOT NULL DEFAULT 0,
  CONSTRAINT festival_locations_pkey PRIMARY KEY (id),
  CONSTRAINT festival_locations_festival_id_location_id_key UNIQUE (festival_id, location_id),
  CONSTRAINT festival_locations_festival_id_fkey
    FOREIGN KEY (festival_id) REFERENCES public.events (id) ON DELETE CASCADE,
  CONSTRAINT festival_locations_location_id_fkey
    FOREIGN KEY (location_id) REFERENCES public.locations (id) ON DELETE CASCADE
);

COMMENT ON TABLE public.festival_locations IS
  'Lieux d''un festival (une fiche de la catégorie Festival), dès son annonce, dans l''ordre de sort_index ; la fiche garde le premier dans location_id. Lisibles avec leur festival, écrits par l''admin. Pas de clé primaire sur (festival_id, location_id) : PostgREST verrait une relation plusieurs-à-plusieurs events ↔ locations et les `locations(…)` embarqués depuis events deviendraient ambigus (PGRST201). Migration 20261023120000.';
COMMENT ON COLUMN public.festival_locations.sort_index IS
  'Ordre des lieux du festival (0 d''abord) : le premier est le lieu de sa fiche.';

-- Les festivals d'un lieu (sa page dans l'app) ; ceux d'un festival : la contrainte d'unicité.
CREATE INDEX IF NOT EXISTS idx_festival_locations_location_id
  ON public.festival_locations USING btree (location_id);

ALTER TABLE public.festival_locations ENABLE ROW LEVEL SECURITY;

-- Lisible quand son festival l'est : la sous-requête passe par la RLS d'events, celle de l'appelant.
DROP POLICY IF EXISTS "Festival locations are viewable with their festival" ON public.festival_locations;
CREATE POLICY "Festival locations are viewable with their festival"
  ON public.festival_locations
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.events AS e WHERE e.id = festival_locations.festival_id));

DROP POLICY IF EXISTS "Admins can insert festival locations" ON public.festival_locations;
CREATE POLICY "Admins can insert festival locations"
  ON public.festival_locations
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (SELECT public.is_user_admin()) = true);

DROP POLICY IF EXISTS "Admins can update festival locations" ON public.festival_locations;
CREATE POLICY "Admins can update festival locations"
  ON public.festival_locations
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT public.is_user_admin()) = true)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (SELECT public.is_user_admin()) = true);

DROP POLICY IF EXISTS "Admins can delete festival locations" ON public.festival_locations;
CREATE POLICY "Admins can delete festival locations"
  ON public.festival_locations
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT public.is_user_admin()) = true);

-- Au lieu des droits par défaut de Supabase (tout, à anon compris) : lire pour tous, écrire connecté (la RLS
-- réserve l'écriture à l'admin).
REVOKE ALL ON TABLE public.festival_locations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.festival_locations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.festival_locations TO authenticated;
GRANT ALL ON TABLE public.festival_locations TO service_role;

-- app_festival_events ------------------------------------------------------------------------------
--
-- Une ligne par événement à venir rattaché à un festival : l'accueil groupe ses cartes par festival (une carte
-- par festival, son programme dedans) et compte avec, comme les séries (app_event_series).
-- - À venir : app_events_in_range à partir d'aujourd'hui 0 h (heure de Paris, ou at_time), toutes villes, sans
--   les événements masqués par l'utilisateur ni ceux des auteurs qu'il a bloqués, avec ceux retirés de l'accueil
--   (hide_from_home), comme app_event_series.
-- - Le festival visible lui aussi : dans app_events(), ni masqué par l'utilisateur, ni d'un auteur qu'il a
--   bloqué ; ses dates ne comptent pas (commencé ou fini, il reste le sien). Sinon l'événement n'a pas de ligne
--   et reste seul, comme un événement sans festival.
-- - event_id, date : l'événement et sa date (events.date) ; festival_id : son festival ; events_count : les
--   lignes de son festival (ses événements à venir), l'événement compris.
-- Rendues par festival (sa première date à venir), puis par date.
CREATE OR REPLACE FUNCTION public.app_festival_events(at_time timestamp DEFAULT NULL)
RETURNS TABLE (
  event_id uuid,
  festival_id uuid,
  date timestamptz,
  events_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
ROWS 20
AS $$
  SELECT
    e.id,
    e.festival_id,
    e.date,
    (count(*) OVER (PARTITION BY e.festival_id))::integer
  FROM public.app_events_in_range(
    date_trunc('day', coalesce(app_festival_events.at_time, now() AT TIME ZONE 'Europe/Paris')),
    NULL,
    NULL,
    NULL,
    app_festival_events.at_time
  ) AS e
  WHERE e.festival_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.app_events() AS f
      WHERE f.id = e.festival_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.user_hidden_events AS h
          WHERE h.event_id = f.id
            AND h.user_id = auth.uid()
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.blocked_users AS bu
          WHERE bu.blocker_user_id = auth.uid()
            AND bu.blocked_user_id = f.created_by
        )
    )
  ORDER BY min(e.date) OVER (PARTITION BY e.festival_id), e.festival_id, e.date, e.id
$$;

COMMENT ON FUNCTION public.app_festival_events(timestamp) IS
  'Festivals de l''app : une ligne par événement à venir rattaché à un festival visible (app_events(), ni masqué par l''utilisateur, ni d''un auteur bloqué) : event_id, festival_id, date, events_count (les événements à venir du festival, l''événement compris). À venir comme app_events_in_range à partir d''aujourd''hui 0 h (heure de Paris, ou at_time), toutes villes, par utilisateur. Rendues par festival puis par date. Migration 20261023120000.';

GRANT EXECUTE ON FUNCTION public.app_festival_events(timestamp) TO anon, authenticated;

-- Vérification (SQL Editor) : les festivals, leurs lieux et leurs événements à venir.
-- select f.title, array_agg(l.name order by fl.sort_index) as lieux,
--   (select count(*) from public.app_festival_events() as a where a.festival_id = f.id) as a_venir
-- from public.events as f
-- left join public.festival_locations as fl on fl.festival_id = f.id
-- left join public.locations as l on l.id = fl.location_id
-- where exists (select 1 from public.events as c where c.festival_id = f.id) or fl.id is not null
-- group by f.id, f.title;

-- Rollback :
-- DROP FUNCTION IF EXISTS public.app_festival_events(timestamp);
-- DROP TABLE IF EXISTS public.festival_locations;
-- DROP TRIGGER IF EXISTS trg_events_check_festival ON public.events;
-- DROP FUNCTION IF EXISTS public.check_event_festival();
-- DROP INDEX IF EXISTS public.idx_events_festival_id;
-- ALTER TABLE public.events DROP COLUMN IF EXISTS festival_id;
