-- Suivis (U8) : suivre un lieu, un organisateur ou un artiste.
--
-- ../live/docs/AMELIORATIONS.md, U8 (décidé le 2026-10-20) : « Suivre » en tête des pages de lieu,
-- d'organisateur et d'artiste de l'app, « Mes suivis » dans son onglet Favoris, et une notification
-- quand un suivi publie (20261021142000_create_follows_digest.sql). Contrat pour l'app :
-- docs/API_APP.md, « Suivis ». Prérequis : 20261021140000_add_events_published_at.sql
-- (events.published_at) et 20261020200000_create_copy_guest_data.sql (remplacée ici).
--
-- user_follows : une ligne par (utilisateur, cible), sa date. target_type : 'location' (un lieu, y
-- compris un lieu qui organise : sa page dans l'app est celle du lieu), 'organizer' (une ligne
-- d'organizers) ou 'artist' ; target_id : l'id de la cible dans sa table. Une clé étrangère ne peut
-- pas viser trois tables : deux triggers en tiennent lieu.
-- - check_user_follow_target() refuse une cible qui n'existe pas (23503, comme une clé étrangère) ;
-- - delete_follows_of_target() retire les suivis d'un lieu, d'un organisateur ou d'un artiste
--   supprimé (comme ON DELETE CASCADE).
-- Un compte supprimé emporte ses suivis (user_id → auth.users, ON DELETE CASCADE).
--
-- RLS : chacun ses lignes, en lecture comme en écriture, comme event_likes depuis U39
-- (20261020181000) : personne ne lit qui suit quoi. Les invités suivent aussi : une session anonyme
-- a le rôle authenticated et son propre auth.uid() ; la recopie invité → compte
-- (copy_guest_data, plus bas) emporte leurs suivis. Rien pour anon. Pas de mise à jour : on suit,
-- ou on ne suit plus (suppression). Les crons passent par le service role, qui ignore la RLS.
--
-- Aussi ici :
-- - user_notification_preferences.follows_enabled : la notification des suivis, activée par défaut
--   (l'interrupteur « Mes suivis » de l'écran des notifications de l'app) ;
-- - app_follows() : la liste « Mes suivis » de l'app ;
-- - copy_guest_data() : recopie aussi les suivis et follows_enabled.

-- Table -----------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_follows (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_follows_pkey PRIMARY KEY (user_id, target_type, target_id),
  CONSTRAINT user_follows_target_type_check
    CHECK (target_type = ANY (ARRAY['location'::text, 'organizer'::text, 'artist'::text]))
);

COMMENT ON TABLE public.user_follows IS
  'Suivis (U8) : un utilisateur (invités compris) suit un lieu, un organisateur ou un artiste. Chacun ne lit et n''écrit que ses lignes.';
COMMENT ON COLUMN public.user_follows.target_type IS
  'location (lieu, y compris un lieu qui organise), organizer (ligne d''organizers) ou artist.';
COMMENT ON COLUMN public.user_follows.target_id IS
  'Id de la cible dans locations, organizers ou artists (vérifié à l''écriture, retiré avec elle).';
COMMENT ON COLUMN public.user_follows.created_at IS
  'Début du suivi : les événements publiés avant ne sont ni « nouveaux » ni notifiés.';

-- Qui suit une cible : la notification des suivis et les comptes de « Mes suivis ». Les lignes d'un
-- utilisateur : la clé primaire.
CREATE INDEX IF NOT EXISTS idx_user_follows_target
  ON public.user_follows USING btree (target_type, target_id);

-- Cible existante, retirée avec elle ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_user_follow_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Un type inconnu est refusé par user_follows_target_type_check.
  -- CASE entre parenthèses : sinon son THEN finirait la condition du IF.
  IF NEW.target_type = ANY (ARRAY['location', 'organizer', 'artist'])
    AND NOT (CASE NEW.target_type
      WHEN 'location' THEN EXISTS (SELECT 1 FROM public.locations AS t WHERE t.id = NEW.target_id)
      WHEN 'organizer' THEN EXISTS (SELECT 1 FROM public.organizers AS t WHERE t.id = NEW.target_id)
      ELSE EXISTS (SELECT 1 FROM public.artists AS t WHERE t.id = NEW.target_id)
    END)
  THEN
    RAISE EXCEPTION 'user_follows : cible introuvable (%, %)', NEW.target_type, NEW.target_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.check_user_follow_target() IS
  'Trigger de user_follows : refuse (23503) un suivi dont la cible n''existe pas dans locations, organizers ou artists.';

DROP TRIGGER IF EXISTS trg_user_follows_check_target ON public.user_follows;
CREATE TRIGGER trg_user_follows_check_target
  BEFORE INSERT OR UPDATE OF target_type, target_id ON public.user_follows
  FOR EACH ROW
  EXECUTE FUNCTION public.check_user_follow_target();

-- Argument : le target_type de la table supprimée. Security definer : celui qui supprime (un admin)
-- ne voit pas les suivis des autres.
CREATE OR REPLACE FUNCTION public.delete_follows_of_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.user_follows AS f
  WHERE f.target_type = TG_ARGV[0]
    AND f.target_id = OLD.id;
  RETURN NULL;
END
$$;

COMMENT ON FUNCTION public.delete_follows_of_target() IS
  'Trigger de locations, organizers et artists : retire les suivis de la ligne supprimée (TG_ARGV[0] : son target_type).';

DROP TRIGGER IF EXISTS trg_locations_delete_follows ON public.locations;
CREATE TRIGGER trg_locations_delete_follows
  AFTER DELETE ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_follows_of_target('location');

DROP TRIGGER IF EXISTS trg_organizers_delete_follows ON public.organizers;
CREATE TRIGGER trg_organizers_delete_follows
  AFTER DELETE ON public.organizers
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_follows_of_target('organizer');

DROP TRIGGER IF EXISTS trg_artists_delete_follows ON public.artists;
CREATE TRIGGER trg_artists_delete_follows
  AFTER DELETE ON public.artists
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_follows_of_target('artist');

-- RLS et droits -----------------------------------------------------------------------------------

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own follows" ON public.user_follows;
CREATE POLICY "Users can view their own follows"
  ON public.user_follows
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own follows" ON public.user_follows;
CREATE POLICY "Users can create their own follows"
  ON public.user_follows
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own follows" ON public.user_follows;
CREATE POLICY "Users can delete their own follows"
  ON public.user_follows
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Au lieu des droits par défaut de Supabase (tout, à anon compris) : lire, suivre, ne plus suivre.
REVOKE ALL ON TABLE public.user_follows FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.user_follows TO authenticated;
GRANT ALL ON TABLE public.user_follows TO service_role;

-- Préférence de notification ---------------------------------------------------------------------

ALTER TABLE public.user_notification_preferences
  ADD COLUMN IF NOT EXISTS follows_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.user_notification_preferences.follows_enabled IS
  'Notification des suivis (U8 : au plus une par jour, quand un suivi publie), activée par défaut. Avec is_enabled, l''interrupteur général.';

-- « Mes suivis » -----------------------------------------------------------------------------------
--
-- app_follows(at_time) : une ligne par suivi de l'appelant dont la cible existe encore :
-- - target_type, target_id, followed_at : le suivi ;
-- - name, image_url : la cible (lieu : sa photo ; organisateur : son logo, à défaut son icône ;
--   artiste : sa photo) ;
-- - upcoming_count : ses événements à venir, comme les comptes de la fiche (app_organizer_counts,
--   20261020140000) : app_events_in_range à partir d'aujourd'hui 0 h (heure de Paris), sans les
--   masqués de l'appelant ni les auteurs qu'il a bloqués ; lieu : ceux qui s'y tiennent
--   (events.location_id) et ceux qu'il organise (event_organizers.location_id), chacun une fois ;
--   organisateur : event_organizers.organizer_id ; artiste : event_artists.artist_id ;
-- - new_count : ceux d'entre eux publiés (events.published_at) depuis 7 jours et depuis le début du
--   suivi (« 2 nouveaux événements » de la liste).
-- Tri : les cibles qui ont du nouveau, puis le plus d'événements à venir, puis le nom.
-- at_time : « maintenant » en heure de Paris, comme app_events_in_range (tests) ; null : maintenant.
--
-- `language sql`, `stable`, `security invoker` : la RLS de l'appelant s'applique (ses suivis
-- seulement). Exécutable par authenticated (invités compris).

CREATE OR REPLACE FUNCTION public.app_follows(at_time timestamp DEFAULT NULL)
RETURNS TABLE (
  target_type text,
  target_id uuid,
  name text,
  image_url text,
  upcoming_count integer,
  new_count integer,
  followed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH maintenant AS (
    SELECT
      coalesce(app_follows.at_time, now() AT TIME ZONE 'Europe/Paris') AS paris,
      coalesce(app_follows.at_time AT TIME ZONE 'Europe/Paris', now()) AS instant
  ),
  cibles AS (
    SELECT f.target_type, f.target_id, f.created_at, l.name, l.image_url
    FROM public.user_follows AS f
    JOIN public.locations AS l ON l.id = f.target_id
    WHERE f.user_id = (SELECT auth.uid()) AND f.target_type = 'location'
    UNION ALL
    SELECT f.target_type, f.target_id, f.created_at, o.name,
      coalesce(nullif(btrim(o.logo_url), ''), nullif(btrim(o.icon_url), ''))
    FROM public.user_follows AS f
    JOIN public.organizers AS o ON o.id = f.target_id
    WHERE f.user_id = (SELECT auth.uid()) AND f.target_type = 'organizer'
    UNION ALL
    SELECT f.target_type, f.target_id, f.created_at, a.name, a.image_url
    FROM public.user_follows AS f
    JOIN public.artists AS a ON a.id = f.target_id
    WHERE f.user_id = (SELECT auth.uid()) AND f.target_type = 'artist'
  ),
  a_venir AS (
    SELECT e.id, e.location_id, e.published_at
    FROM maintenant AS m
    CROSS JOIN LATERAL public.app_events_in_range(
      date_trunc('day', m.paris), NULL, NULL, NULL, app_follows.at_time
    ) AS e
  ),
  -- (cible, événement à venir), sans doublon : UNION.
  liens AS (
    SELECT 'location'::text AS target_type, a.location_id AS target_id, a.id AS event_id
    FROM a_venir AS a
    JOIN cibles AS c ON c.target_type = 'location' AND c.target_id = a.location_id
    UNION
    SELECT 'location'::text, eo.location_id, eo.event_id
    FROM public.event_organizers AS eo
    JOIN cibles AS c ON c.target_type = 'location' AND c.target_id = eo.location_id
    UNION
    SELECT 'organizer'::text, eo.organizer_id, eo.event_id
    FROM public.event_organizers AS eo
    JOIN cibles AS c ON c.target_type = 'organizer' AND c.target_id = eo.organizer_id
    UNION
    SELECT 'artist'::text, ea.artist_id, ea.event_id
    FROM public.event_artists AS ea
    JOIN cibles AS c ON c.target_type = 'artist' AND c.target_id = ea.artist_id
  )
  SELECT t.target_type, t.target_id, t.name, t.image_url, t.upcoming_count, t.new_count, t.followed_at
  FROM (
    SELECT
      c.target_type,
      c.target_id,
      c.name,
      nullif(btrim(c.image_url), '') AS image_url,
      count(a.id)::integer AS upcoming_count,
      count(a.id) FILTER (
        WHERE a.published_at > greatest(c.created_at, m.instant - interval '7 days')
      )::integer AS new_count,
      c.created_at AS followed_at
    FROM cibles AS c
    CROSS JOIN maintenant AS m
    LEFT JOIN liens AS li ON li.target_type = c.target_type AND li.target_id = c.target_id
    LEFT JOIN a_venir AS a ON a.id = li.event_id
    GROUP BY c.target_type, c.target_id, c.name, c.image_url, c.created_at, m.instant
  ) AS t
  ORDER BY t.new_count > 0 DESC, t.upcoming_count DESC, t.name, t.target_id
$$;

COMMENT ON FUNCTION public.app_follows(timestamp) IS
  'Mes suivis (U8) : les suivis de l''appelant, leur cible (nom, image), ses événements à venir (comme app_organizer_counts) et ceux publiés depuis 7 jours et depuis le suivi. Règle complète : migration 20261021141000.';

REVOKE ALL ON FUNCTION public.app_follows(timestamp) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_follows(timestamp) TO authenticated;

-- Recopie invité → compte, avec les suivis ---------------------------------------------------------
--
-- Comme 20261020200000_create_copy_guest_data.sql (mêmes règles, mêmes refus), plus :
-- - les suivis de l'invité (user_follows) ajoutés à ceux du compte, sans doublons, avec leur date
--   (les événements publiés depuis restent nouveaux pour le compte) ;
-- - follows_enabled avec les autres préférences, quand le compte n'en a pas encore.
-- Une colonne de plus dans la ligne rendue (follows) : la fonction est recréée. Les colonnes
-- existantes ne changent pas : les versions de l'app qui ne lisent pas follows l'ignorent.

DROP FUNCTION IF EXISTS public.copy_guest_data(uuid);

CREATE FUNCTION public.copy_guest_data(guest_session_id uuid)
RETURNS TABLE (
  likes integer,
  hidden_events integer,
  notification_preferences integer,
  notification_categories integer,
  follows integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  compte uuid := (SELECT auth.uid());
  invite uuid;
BEGIN
  IF compte IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users AS u WHERE u.id = compte AND NOT u.is_anonymous
  ) THEN
    RAISE EXCEPTION 'copy_guest_data : réservé à un compte, pas à une session invitée'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.user_id INTO invite
  FROM auth.sessions AS s
  JOIN auth.users AS u ON u.id = s.user_id
  WHERE s.id = copy_guest_data.guest_session_id
    AND u.is_anonymous;
  IF invite IS NULL THEN
    RAISE EXCEPTION 'copy_guest_data : session invitée inconnue'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.event_likes (event_id, user_id)
  SELECT l.event_id, compte
  FROM public.event_likes AS l
  WHERE l.user_id = invite
  ON CONFLICT (event_id, user_id) DO NOTHING;
  GET DIAGNOSTICS likes = ROW_COUNT;

  INSERT INTO public.user_hidden_events (event_id, user_id)
  SELECT h.event_id, compte
  FROM public.user_hidden_events AS h
  WHERE h.user_id = invite
  ON CONFLICT (event_id, user_id) DO NOTHING;
  GET DIAGNOSTICS hidden_events = ROW_COUNT;

  INSERT INTO public.user_notification_preferences (
    user_id, frequency, is_enabled, category_ids, follows_enabled
  )
  SELECT compte, p.frequency, p.is_enabled, p.category_ids, p.follows_enabled
  FROM public.user_notification_preferences AS p
  WHERE p.user_id = invite
  ON CONFLICT (user_id) DO NOTHING;
  GET DIAGNOSTICS notification_preferences = ROW_COUNT;

  notification_categories := 0;
  IF notification_preferences > 0 THEN
    INSERT INTO public.user_notification_categories (user_id, category_id)
    SELECT compte, c.category_id
    FROM public.user_notification_categories AS c
    WHERE c.user_id = invite
    ON CONFLICT (user_id, category_id) DO NOTHING;
    GET DIAGNOSTICS notification_categories = ROW_COUNT;
  END IF;

  INSERT INTO public.user_follows (user_id, target_type, target_id, created_at)
  SELECT compte, f.target_type, f.target_id, f.created_at
  FROM public.user_follows AS f
  WHERE f.user_id = invite
  ON CONFLICT (user_id, target_type, target_id) DO NOTHING;
  GET DIAGNOSTICS follows = ROW_COUNT;

  RETURN NEXT;
END
$$;

COMMENT ON FUNCTION public.copy_guest_data(uuid) IS
  'Recopie sur le compte appelant les favoris, masqués, suivis et préférences de notification (si le compte n''en a pas) de la session invitée guest_session_id (auth.sessions.id). Appelant non anonyme, source anonyme. Rend le nombre de lignes ajoutées par table.';

REVOKE ALL ON FUNCTION public.copy_guest_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_guest_data(uuid) TO authenticated;

-- Vérification (SQL Editor) : la table, ses policies, les fonctions et leurs droits.
-- select policyname, cmd, roles from pg_policies where tablename = 'user_follows' order by 1;
-- select has_function_privilege('anon', 'public.app_follows(timestamp)', 'execute') as anon,
--        has_function_privilege('authenticated', 'public.app_follows(timestamp)', 'execute') as authenticated;
-- select target_type, count(*) from public.user_follows group by 1;

-- Rollback (copy_guest_data : recréer celle de 20261020200000 après le DROP) :
-- DROP FUNCTION IF EXISTS public.copy_guest_data(uuid);
-- DROP FUNCTION IF EXISTS public.app_follows(timestamp);
-- ALTER TABLE public.user_notification_preferences DROP COLUMN IF EXISTS follows_enabled;
-- DROP TRIGGER IF EXISTS trg_locations_delete_follows ON public.locations;
-- DROP TRIGGER IF EXISTS trg_organizers_delete_follows ON public.organizers;
-- DROP TRIGGER IF EXISTS trg_artists_delete_follows ON public.artists;
-- DROP FUNCTION IF EXISTS public.delete_follows_of_target();
-- DROP TABLE IF EXISTS public.user_follows;
-- DROP FUNCTION IF EXISTS public.check_user_follow_target();
