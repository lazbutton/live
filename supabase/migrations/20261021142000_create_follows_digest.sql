-- Notification des suivis (U8) : chaque jour, à chacun, ce que ses suivis ont publié.
--
-- ../live/docs/AMELIORATIONS.md, U8 : « une notification quand un lieu suivi publie (regroupée, au
-- plus une par jour), avec le cron des résumés ». Le cron /api/cron/notifications/follows-digest
-- (lib/notifications/follows-digest.ts) lit follows_digest(), puis envoie un message par personne,
-- au plus un par jour (notification_logs.delivery_key `follows_digest:<jour>:<utilisateur>`, comme
-- les résumés). Contrat pour l'app : docs/API_APP.md, « Suivis ». Prérequis :
-- 20261021140000_add_events_published_at.sql (events.published_at) et
-- 20261021141000_create_user_follows.sql (user_follows).
--
-- notification_logs.covered_until : pour un message des suivis, l'instant jusqu'où il couvre les
-- publications (le moment du calcul). Le message suivant reprend de là : rien n'est envoyé deux
-- fois, et rien ne passe entre deux messages, pas même ce qui est publié pendant un envoi. Un envoi
-- qui échoue libère son log (sans jeton, réglages coupés…) : ses événements partent avec le message
-- suivant.
--
-- follows_digest(at_time) : une ligne par (utilisateur, événement, cible suivie qui l'a publié) :
-- - les événements visibles dans l'app (app_events()), pas complets, pas terminés (règle 3
--   d'app_events_in_range, heure de Paris), publiés (published_at) dans (depuis, at_time] ;
-- - depuis : le plus récent du début du suivi, de la fin du dernier message des suivis envoyé
--   (covered_until) et d'at_time moins 7 jours (un message manqué ne rattrape pas plus d'une
--   semaine) ;
-- - publiés par la cible au sens de « Mes suivis » (app_follows()) : lieu (events.location_id ou
--   event_organizers.location_id), organisateur (event_organizers.organizer_id), artiste
--   (event_artists.artist_id) ;
-- - sans les événements que l'utilisateur a masqués ni ceux des auteurs qu'il a bloqués (comme
--   app_events_in_range, ici pour chaque utilisateur : la fonction tourne sans session) ;
-- - target_name : le nom de la cible, pour le titre du message.
-- Tri : utilisateur, date de l'événement, événement, cible. at_time : null, maintenant.
-- Les réglages (is_enabled, follows_enabled) et les jetons sont vérifiés par le cron.
--
-- `stable`, `security invoker` : réservée au service role (le cron), qui ignore la RLS.

ALTER TABLE public.notification_logs
  ADD COLUMN IF NOT EXISTS covered_until timestamptz;

COMMENT ON COLUMN public.notification_logs.covered_until IS
  'Message des suivis (flow_type follows_digest) : les publications sont couvertes jusqu''à cet instant ; le message suivant reprend de là (follows_digest()).';

CREATE OR REPLACE FUNCTION public.follows_digest(at_time timestamptz DEFAULT NULL)
RETURNS TABLE (
  user_id uuid,
  event_id uuid,
  event_title text,
  event_date timestamptz,
  target_type text,
  target_id uuid,
  target_name text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH r AS (
    SELECT
      coalesce(follows_digest.at_time, now()) AS fin,
      -- Les dates des événements sont l'heure de Paris étiquetée UTC (docs/API_APP.md).
      (coalesce(follows_digest.at_time, now()) AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'UTC'
        AS maintenant
  ),
  -- Fin du dernier message des suivis envoyé, par utilisateur (un log libéré n'est plus là).
  derniers AS (
    SELECT nl.user_id, max(nl.covered_until) AS couvert
    FROM public.notification_logs AS nl
    WHERE nl.flow_type = 'follows_digest'
      AND nl.sent_at IS NOT NULL
    GROUP BY nl.user_id
  ),
  suivis AS (
    SELECT
      f.user_id,
      f.target_type,
      f.target_id,
      -- greatest ignore les nulls : sans message envoyé, le début du suivi ou 7 jours.
      greatest(f.created_at, d.couvert, r.fin - interval '7 days') AS depuis
    FROM public.user_follows AS f
    CROSS JOIN r
    LEFT JOIN derniers AS d ON d.user_id = f.user_id
  ),
  nouveaux AS (
    SELECT e.id, e.title, e.date, e.location_id, e.created_by, e.published_at
    FROM public.app_events() AS e
    CROSS JOIN r
    WHERE e.published_at > r.fin - interval '7 days'
      AND e.published_at <= r.fin
      AND e.is_full IS NOT TRUE
      -- Pas terminé : sans fin, à minuit le soir de son début (app_events_in_range, règle 3).
      AND coalesce(e.end_date, date_trunc('day', e.date, 'UTC') + interval '24 hours') > r.maintenant
  ),
  -- (événement, cible qui le publie), sans doublon : UNION.
  liens AS (
    SELECT n.id AS event_id, 'location'::text AS target_type, n.location_id AS target_id
    FROM nouveaux AS n
    WHERE n.location_id IS NOT NULL
    UNION
    SELECT eo.event_id, 'location'::text, eo.location_id
    FROM public.event_organizers AS eo
    JOIN nouveaux AS n ON n.id = eo.event_id
    WHERE eo.location_id IS NOT NULL
    UNION
    SELECT eo.event_id, 'organizer'::text, eo.organizer_id
    FROM public.event_organizers AS eo
    JOIN nouveaux AS n ON n.id = eo.event_id
    WHERE eo.organizer_id IS NOT NULL
    UNION
    SELECT ea.event_id, 'artist'::text, ea.artist_id
    FROM public.event_artists AS ea
    JOIN nouveaux AS n ON n.id = ea.event_id
  )
  SELECT
    s.user_id,
    n.id,
    n.title,
    n.date,
    s.target_type,
    s.target_id,
    coalesce(l.name, o.name, a.name)
  FROM suivis AS s
  JOIN liens AS li ON li.target_type = s.target_type AND li.target_id = s.target_id
  JOIN nouveaux AS n ON n.id = li.event_id AND n.published_at > s.depuis
  LEFT JOIN public.locations AS l ON s.target_type = 'location' AND l.id = s.target_id
  LEFT JOIN public.organizers AS o ON s.target_type = 'organizer' AND o.id = s.target_id
  LEFT JOIN public.artists AS a ON s.target_type = 'artist' AND a.id = s.target_id
  WHERE NOT EXISTS (
      SELECT 1
      FROM public.user_hidden_events AS h
      WHERE h.user_id = s.user_id
        AND h.event_id = n.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.blocked_users AS b
      WHERE b.blocker_user_id = s.user_id
        AND b.blocked_user_id = n.created_by
    )
  ORDER BY s.user_id, n.date, n.id, s.target_type, s.target_id
$$;

COMMENT ON FUNCTION public.follows_digest(timestamptz) IS
  'Notification des suivis (U8) : par utilisateur, les événements visibles et à venir que ses cibles suivies ont publiés depuis le début du suivi, son dernier message (covered_until) et au plus 7 jours, sans ses masqués ni ses auteurs bloqués. Pour le cron (service role). Règle complète : migration 20261021142000.';

REVOKE ALL ON FUNCTION public.follows_digest(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.follows_digest(timestamptz) TO service_role;

-- Vérification (SQL Editor) : ce que le prochain message enverrait, par personne.
-- select user_id, count(distinct event_id) as evenements, string_agg(distinct target_name, ', ')
-- from public.follows_digest() group by 1;

-- Rollback :
-- DROP FUNCTION IF EXISTS public.follows_digest(timestamptz);
-- ALTER TABLE public.notification_logs DROP COLUMN IF EXISTS covered_until;
