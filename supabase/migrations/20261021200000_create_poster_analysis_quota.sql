-- Analyse d'affiche de l'app ouverte à tous, avec un plafond par jour.
--
-- Décision du 2026-10-21 (../live/docs/AMELIORATIONS.md, § 5 et partie E, point 6) : « Proposer un
-- événement » s'ouvre sans compte, et « Depuis une affiche » aussi ; l'analyse de l'affiche
-- (POST /api/mobile/events/extract-from-image, un appel payant à un modèle d'IA) est donc permise à une
-- session invitée (anonyme), avec un plafond par jour tenu ici. Le compte n'est demandé qu'à l'envoi
-- de la proposition (/api/user-requests, inchangé).
--
-- poster_analysis_usage : un compteur par session et par jour (heure de Paris). Ni l'image ni ce qui en
-- a été lu : l'id de la session (auth.users), s'il s'agit d'une session invitée, et le nombre
-- d'analyses du jour. Rien n'est gardé au-delà de la veille. Ni lisible ni modifiable par l'app (RLS
-- sans politique, aucun droit) : seule la route, avec la clé service role, appelle
-- take_poster_analysis().
--
-- take_poster_analysis(user_id, is_guest, per_user_limit, guest_total_limit) : réserve une analyse pour
-- aujourd'hui avant l'appel à l'IA (un échec de l'IA compte aussi). Rend :
-- - 'ok' : réservée ;
-- - 'user_limit' : la session a déjà fait per_user_limit analyses aujourd'hui ;
-- - 'guest_limit' : session invitée, et les sessions invitées ont déjà fait guest_total_limit analyses
--   aujourd'hui à elles toutes (une nouvelle session invitée ne coûte rien à créer : ce total borne la
--   dépense) ; les comptes n'y sont pas soumis.
-- Atomique : un verrou de ligne pour la session, un verrou consultatif du jour pour le total des invités
-- (deux appels simultanés ne passent pas tous les deux au-delà). Les limites sont celles de la route
-- (lib/events/poster-analysis-quota.ts).
--
-- `security definer` (la table n'a aucun droit), search_path vide, objets qualifiés. Exécutable par
-- service_role seulement.

CREATE TABLE IF NOT EXISTS public.poster_analysis_usage (
  day date NOT NULL,
  user_id uuid NOT NULL,
  is_guest boolean NOT NULL DEFAULT false,
  analyses_count integer NOT NULL DEFAULT 0 CHECK (analyses_count >= 0),
  PRIMARY KEY (day, user_id)
);

COMMENT ON TABLE public.poster_analysis_usage IS
  'Analyses d''affiche de l''app par session et par jour (heure de Paris), pour le plafond de /api/mobile/events/extract-from-image. Écrite par take_poster_analysis() seulement ; rien au-delà de la veille.';

ALTER TABLE public.poster_analysis_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.poster_analysis_usage FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.take_poster_analysis(
  user_id uuid,
  is_guest boolean,
  per_user_limit integer,
  guest_total_limit integer
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  aujourdhui date := (now() AT TIME ZONE 'Europe/Paris')::date;
  invite boolean := coalesce(take_poster_analysis.is_guest, false);
  deja integer;
  total_invites integer;
BEGIN
  IF take_poster_analysis.user_id IS NULL THEN
    RAISE EXCEPTION 'take_poster_analysis : user_id requis';
  END IF;

  -- Ménage : rien n'est gardé au-delà de la veille.
  DELETE FROM public.poster_analysis_usage AS u WHERE u.day < aujourdhui - 1;

  IF invite THEN
    -- Un appel à la fois pour le total des invités du jour.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('take_poster_analysis:guests:' || aujourdhui::text)
    );
    SELECT coalesce(sum(u.analyses_count), 0)
    INTO total_invites
    FROM public.poster_analysis_usage AS u
    WHERE u.day = aujourdhui
      AND u.is_guest;
    IF total_invites >= greatest(coalesce(take_poster_analysis.guest_total_limit, 0), 0) THEN
      RETURN 'guest_limit';
    END IF;
  END IF;

  INSERT INTO public.poster_analysis_usage (day, user_id, is_guest, analyses_count)
  VALUES (aujourdhui, take_poster_analysis.user_id, invite, 0)
  -- Par le nom de la contrainte : `(day, user_id)` serait ambigu avec le paramètre user_id.
  ON CONFLICT ON CONSTRAINT poster_analysis_usage_pkey DO NOTHING;

  SELECT u.analyses_count
  INTO deja
  FROM public.poster_analysis_usage AS u
  WHERE u.day = aujourdhui
    AND u.user_id = take_poster_analysis.user_id
  FOR UPDATE;

  IF deja >= greatest(coalesce(take_poster_analysis.per_user_limit, 0), 0) THEN
    RETURN 'user_limit';
  END IF;

  -- Une session invitée qui se connecte garde son id : elle compte ensuite comme un compte.
  UPDATE public.poster_analysis_usage AS u
  SET analyses_count = u.analyses_count + 1,
      is_guest = invite
  WHERE u.day = aujourdhui
    AND u.user_id = take_poster_analysis.user_id;

  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.take_poster_analysis(uuid, boolean, integer, integer) IS
  'Réserve une analyse d''affiche du jour (heure de Paris) pour la session user_id : ''ok'', ''user_limit'' (per_user_limit atteint) ou ''guest_limit'' (session invitée, guest_total_limit atteint pour l''ensemble des invités). Appelée par /api/mobile/events/extract-from-image avec la clé service role. Règle : migration 20261021200000.';

REVOKE ALL ON FUNCTION public.take_poster_analysis(uuid, boolean, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_poster_analysis(uuid, boolean, integer, integer) TO service_role;
