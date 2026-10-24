-- « Pour toi » : ce qui te plaît d'abord, le reste juste à côté (étape 4).
--
-- ../live/docs/chantiers/pour-toi.md (« Pour toi », « Les goûts », « Données et code », choix du 2026-10-24). Une page
-- de l'accueil de l'app qui ne montre que ce qui correspond à tes goûts (des bulles : « Concerts », « Humour »…) et
-- ce que proposent les lieux, organisateurs et artistes que tu suis (U8) ; « Tout » reste à côté. La règle vit ici,
-- une fois ; l'app ne fait que passer `for_me`. Contrat pour l'app : docs/API_APP.md, « Pour toi ».
--
-- 1. app_interests : les goûts (nom, phrase comme « l'humour », icône, ordre, catégories et tags pris, « En famille »),
--    lisibles par tous, écrits par les admins. Les douze de la fiche, posés par leurs noms de catégories et de tags.
-- 2. user_interests : les goûts choisis, une ligne par goût ; chacun ne lit, n'ajoute et ne retire que les siennes
--    (invités compris), comme user_follows.
-- 3. app_interest_ids(events) : les goûts qui prennent un événement, une colonne calculée pour PostgREST
--    (`select=…,app_interest_ids`). Le jeune public (la règle d'« En famille », U5 : `is_young_audience` ou le tag
--    « Jeune Public ») n'est pris que par le goût « En famille » : « Petit Parleur » n'entre pas chez qui aime le
--    théâtre. Les autres prennent leurs catégories (events.category, l'id de la sienne) ou leurs tags.
-- 4. La règle de « Pour toi » : app_for_me_profile_of(utilisateur) (ses goûts, ses lieux suivis, les événements de ses
--    organisateurs, lieux et artistes suivis), app_for_me_profile() (celui de l'appelant) et app_is_for_me(…).
-- 5. app_events_in_range(…, for_me) et app_event_counts(…, for_me) : null comme avant, true ce qui est pour toi,
--    false ce qui ne l'est pas (« 7 autres événements dans “Tout” »). La signature change : supprimées puis recréées
--    (deux fonctions du même nom feraient répondre PostgREST en PGRST203), comme pour U5 et la zone.
-- 6. app_interest_counts(zone_city, zone_km, at_time) : le nombre de chaque bulle, et seulement celles à 5 événements
--    ou plus, ou choisies (choix 13).
-- 7. copy_guest_data : recopie aussi les goûts de l'invité.
-- 8. app_audience_add : trois compteurs (for_me_opened, interests_changed, for_me_to_all).
--
-- Les fonctions de l'app : `language sql`, `stable`, `security invoker`, sans clause SET. Exception :
-- app_for_me_profile(), `security definer` et `SET search_path = ''` : elle ne lit que les lignes de l'appelant, et
-- un invocateur anonyme (app_events_in_range sans session) ne peut pas lire user_interests ni user_follows.
-- Prérequis : 20261024120000_app_home_rules.sql (app_events_in_range, app_event_counts, app_on_tout),
-- 20261021141000_create_user_follows.sql (user_follows, copy_guest_data) et, pour la même liste de compteurs dans
-- n'importe quel ordre, 20261024150000_add_radio_show_follows.sql. À appliquer d'un bloc (`psql --single-transaction`) ;
-- pas de BEGIN ni de COMMIT ici.

-- 1. app_interests -------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_interests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  phrase text NOT NULL,
  icon_svg text,
  display_order integer NOT NULL DEFAULT 0,
  category_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  tag_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  family boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_interests_pkey PRIMARY KEY (id),
  CONSTRAINT app_interests_slug_key UNIQUE (slug),
  CONSTRAINT app_interests_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT app_interests_name_check CHECK (btrim(name) <> ''),
  CONSTRAINT app_interests_phrase_check CHECK (btrim(phrase) <> ''),
  -- « En famille » prend le jeune public, et lui seul : ni catégorie ni tag de plus.
  CONSTRAINT app_interests_family_check
    CHECK (NOT family OR (cardinality(category_ids) = 0 AND cardinality(tag_ids) = 0))
);

COMMENT ON TABLE public.app_interests IS
  'Les goûts de « Pour toi » (les bulles de l''app) : un goût prend des catégories, des tags, ou le jeune public (family). Lisibles par tous ; écrits par les admins. Règle : app_interest_ids(events), migration 20261024190000.';
COMMENT ON COLUMN public.app_interests.slug IS
  'Clé stable (concerts, humour, en-famille…), pour les tests et les reprises.';
COMMENT ON COLUMN public.app_interests.name IS 'Nom de la bulle : « Humour ».';
COMMENT ON COLUMN public.app_interests.phrase IS
  'Le goût dans une phrase : « l''humour » (« Ajouter l''humour à Pour toi », « Tu aimes l''humour ? »).';
COMMENT ON COLUMN public.app_interests.icon_svg IS
  'Icône SVG 24 × 24 (stroke currentColor), comme categories.icon_svg.';
COMMENT ON COLUMN public.app_interests.category_ids IS
  'Catégories prises (events.category est l''id de la sienne).';
COMMENT ON COLUMN public.app_interests.tag_ids IS 'Tags pris : un tag en commun avec events.tag_ids suffit.';
COMMENT ON COLUMN public.app_interests.family IS
  '« En famille » : prend le jeune public (is_young_audience ou le tag « Jeune Public », la règle d''U5), qu''aucun autre goût ne prend.';
COMMENT ON COLUMN public.app_interests.is_active IS
  'Un goût inactif ne prend rien et n''est plus proposé ; les choix qui le visent restent.';

DROP TRIGGER IF EXISTS update_app_interests_updated_at ON public.app_interests;
CREATE TRIGGER update_app_interests_updated_at
  BEFORE UPDATE ON public.app_interests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.app_interests ENABLE ROW LEVEL SECURITY;

-- Lecture : tous, actifs ou non (rien de privé ; l'app lit les actifs). Pas de fonction dans la policy de lecture :
-- app_interest_ids, lue pour chaque carte, n'en paie pas le prix.
DROP POLICY IF EXISTS "Anyone can view interests" ON public.app_interests;
CREATE POLICY "Anyone can view interests"
  ON public.app_interests
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can create interests" ON public.app_interests;
CREATE POLICY "Admins can create interests"
  ON public.app_interests
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_user_admin()));

DROP POLICY IF EXISTS "Admins can update interests" ON public.app_interests;
CREATE POLICY "Admins can update interests"
  ON public.app_interests
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_user_admin()))
  WITH CHECK ((SELECT public.is_user_admin()));

DROP POLICY IF EXISTS "Admins can delete interests" ON public.app_interests;
CREATE POLICY "Admins can delete interests"
  ON public.app_interests
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_user_admin()));

REVOKE ALL ON TABLE public.app_interests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.app_interests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_interests TO authenticated;
GRANT ALL ON TABLE public.app_interests TO service_role;

-- Les douze goûts de la fiche (« Les goûts »), dans l'ordre des bulles. Catégories et tags par leurs noms (casse et
-- espaces ignorés) : la même migration sert la prod et les bases de test. Icônes : celle de la catégorie, ou une
-- icône Lucide (drama, laugh, tent, users). Un goût déjà là (même slug) n'est pas touché.
INSERT INTO public.app_interests (slug, name, phrase, icon_svg, display_order, category_ids, tag_ids, family)
SELECT
  g.slug,
  g.name,
  g.phrase,
  coalesce(
    g.icon_svg,
    (
      SELECT c.icon_svg
      FROM public.categories AS c
      WHERE upper(btrim(c.name)) = g.icon_category
      ORDER BY c.is_active DESC NULLS LAST, c.display_order NULLS LAST, c.id
      LIMIT 1
    )
  ),
  g.ordre,
  coalesce(
    (SELECT array_agg(c.id ORDER BY c.id) FROM public.categories AS c WHERE upper(btrim(c.name)) = ANY (g.categories)),
    '{}'::uuid[]
  ),
  coalesce(
    (SELECT array_agg(t.id ORDER BY t.id) FROM public.tags AS t WHERE upper(btrim(t.name)) = ANY (g.tags)),
    '{}'::uuid[]
  ),
  g.family
FROM (
  VALUES
    ('concerts', 'Concerts', 'les concerts', NULL, 'CONCERT', 1,
      ARRAY['CONCERT'], ARRAY[]::text[], false),
    ('dj-electro', 'DJ sets et électro', 'les DJ sets et l''électro', NULL, 'DJ SET', 2,
      ARRAY['DJ SET'], ARRAY['ELECTRO'], false),
    ('theatre', 'Théâtre', 'le théâtre',
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11h.01"/><path d="M14 6h.01"/><path d="M18 6h.01"/><path d="M6.5 13.1h.01"/><path d="M22 5c0 9-4 12-6 12s-6-3-6-12c0-2 2-3 6-3s6 1 6 3"/><path d="M17.4 9.9c-.8.8-2 .8-2.8 0"/><path d="M10.1 7.1C9 7.2 7.7 7.7 6 8.6c-3.5 2-4.7 3.9-3.7 5.6 4.5 7.8 9.5 8.4 11.2 7.4.9-.5 1.9-2.1 1.9-4.7"/><path d="M9.1 16.5c.3-1.1 1.4-1.7 2.4-1.4"/></svg>',
      NULL, 3, ARRAY[]::text[], ARRAY['THÉÂTRE'], false),
    ('humour', 'Humour', 'l''humour',
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M18 13a6 6 0 0 1-6 5 6 6 0 0 1-6-5h12Z"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/></svg>',
      NULL, 4, ARRAY[]::text[], ARRAY['HUMOUR'], false),
    ('cirque', 'Cirque', 'le cirque',
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>',
      NULL, 5, ARRAY[]::text[], ARRAY['CIRQUE', 'ACROBATIES'], false),
    ('danse', 'Danse', 'la danse', NULL, 'DANSE', 6,
      ARRAY['DANSE'], ARRAY['DANSE'], false),
    ('cinema', 'Cinéma', 'le cinéma', NULL, 'CINÉMA', 7,
      ARRAY['CINÉMA'], ARRAY[]::text[], false),
    ('expos', 'Expos', 'les expos', NULL, 'EXPO', 8,
      ARRAY['EXPO'], ARRAY[]::text[], false),
    ('ateliers', 'Ateliers', 'les ateliers', NULL, 'ATELIER', 9,
      ARRAY['ATELIER'], ARRAY[]::text[], false),
    ('rencontres', 'Rencontres', 'les rencontres', NULL, 'RENCONTRE', 10,
      ARRAY['RENCONTRE'], ARRAY['CONFÉRENCE'], false),
    ('festivals', 'Festivals', 'les festivals', NULL, 'FESTIVAL', 11,
      ARRAY['FESTIVAL'], ARRAY[]::text[], false),
    ('en-famille', 'En famille', 'les sorties en famille',
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/></svg>',
      NULL, 12, ARRAY[]::text[], ARRAY[]::text[], true)
) AS g (slug, name, phrase, icon_svg, icon_category, ordre, categories, tags, family)
ON CONFLICT (slug) DO NOTHING;

-- 2. user_interests ------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_interests (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  interest_id uuid NOT NULL REFERENCES public.app_interests (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_interests_pkey PRIMARY KEY (user_id, interest_id)
);

COMMENT ON TABLE public.user_interests IS
  'Les goûts choisis (« Pour toi ») : une ligne par goût. Chacun ne lit, n''ajoute et ne retire que les siennes (invités compris) ; recopiées au compte par copy_guest_data.';

-- Les choix d'un goût (sa suppression, les reprises) ; ceux d'un utilisateur : la clé primaire.
CREATE INDEX IF NOT EXISTS idx_user_interests_interest
  ON public.user_interests USING btree (interest_id);

ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own interests" ON public.user_interests;
CREATE POLICY "Users can view their own interests"
  ON public.user_interests
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can add their own interests" ON public.user_interests;
CREATE POLICY "Users can add their own interests"
  ON public.user_interests
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can remove their own interests" ON public.user_interests;
CREATE POLICY "Users can remove their own interests"
  ON public.user_interests
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Comme user_follows : on choisit, ou on retire (pas de mise à jour) ; rien pour anon.
REVOKE ALL ON TABLE public.user_interests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.user_interests TO authenticated;
GRANT ALL ON TABLE public.user_interests TO service_role;

-- 3. app_interest_ids : les goûts qui prennent un événement -------------------------------------------------------
--
-- Les goûts actifs, dans l'ordre des bulles. Jeune public (is_young_audience, ou le tag « Jeune Public » par son nom,
-- comme le filtre « En famille » d'app_events_in_range) : seulement les goûts family. Sinon : ceux dont une catégorie
-- est events.category (l'id de la sienne, migration 20261024120000) ou qui ont un tag en commun avec lui.
-- Indépendante de l'utilisateur : l'app la croise avec ses choix (le menu d'une carte nomme le goût).
CREATE OR REPLACE FUNCTION public.app_interest_ids(e public.events)
RETURNS uuid[]
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(array_agg(i.id ORDER BY i.display_order, i.id), '{}'::uuid[])
  FROM (
    -- Les tags de l'événement, lus par leur clé (quelques-uns), pas tous les tags à chaque carte : en local, sur
    -- les 353 événements à venir, 1 ms de plus au lieu de 26.
    SELECT
      coalesce(e.is_young_audience, false)
      OR EXISTS (
        SELECT 1
        FROM public.tags AS t
        WHERE t.id = ANY (e.tag_ids)
          AND upper(btrim(t.name)) = 'JEUNE PUBLIC'
      ) AS jeune
  ) AS j
  JOIN public.app_interests AS i ON i.is_active
  WHERE CASE
    WHEN j.jeune THEN i.family
    ELSE NOT i.family
      AND (
        e.category = ANY (i.category_ids::text[])
        OR coalesce(e.tag_ids && i.tag_ids, false)
      )
  END
$$;

COMMENT ON FUNCTION public.app_interest_ids(public.events) IS
  'Les goûts de « Pour toi » (app_interests actifs, dans l''ordre des bulles) qui prennent l''événement : le jeune public (is_young_audience ou le tag « Jeune Public ») seulement par les goûts family ; sinon une catégorie (events.category) ou un tag en commun. Colonne calculée pour PostgREST (select=…,app_interest_ids). Migration 20261024190000.';

GRANT EXECUTE ON FUNCTION public.app_interest_ids(public.events) TO anon, authenticated;

-- 4. La règle de « Pour toi » --------------------------------------------------------------------------------------
--
-- Le profil d'un utilisateur, lu une fois par requête : ses goûts choisis, les lieux qu'il suit (un événement qui
-- s'y tient), et les événements que proposent les lieux, organisateurs et artistes qu'il suit (event_organizers :
-- un lieu qui organise, un organisateur ; event_artists : un artiste), comme app_follows. Les liens sont lus une
-- fois, pas pour chaque événement : les policies d'event_organizers et d'event_artists appellent une fonction par
-- ligne. Lit les lignes de qui on lui donne : pour le service (les résumés) et pour app_for_me_profile() seulement.
CREATE OR REPLACE FUNCTION public.app_for_me_profile_of(for_user uuid)
RETURNS TABLE (
  interest_ids uuid[],
  location_ids uuid[],
  event_ids uuid[]
)
LANGUAGE sql
STABLE
AS $$
  WITH suivis AS MATERIALIZED (
    SELECT f.target_type, f.target_id
    FROM public.user_follows AS f
    WHERE f.user_id = app_for_me_profile_of.for_user
      AND f.target_type = ANY (ARRAY['location', 'organizer', 'artist'])
  )
  SELECT
    coalesce(
      (
        SELECT array_agg(ui.interest_id ORDER BY ui.interest_id)
        FROM public.user_interests AS ui
        WHERE ui.user_id = app_for_me_profile_of.for_user
      ),
      '{}'::uuid[]
    ),
    coalesce(
      (SELECT array_agg(s.target_id ORDER BY s.target_id) FROM suivis AS s WHERE s.target_type = 'location'),
      '{}'::uuid[]
    ),
    coalesce(
      (
        SELECT array_agg(DISTINCT x.event_id)
        FROM (
          SELECT eo.event_id
          FROM public.event_organizers AS eo
          WHERE eo.organizer_id IN (SELECT s.target_id FROM suivis AS s WHERE s.target_type = 'organizer')
            OR eo.location_id IN (SELECT s.target_id FROM suivis AS s WHERE s.target_type = 'location')
          UNION
          SELECT ea.event_id
          FROM public.event_artists AS ea
          WHERE ea.artist_id IN (SELECT s.target_id FROM suivis AS s WHERE s.target_type = 'artist')
        ) AS x
      ),
      '{}'::uuid[]
    )
$$;

COMMENT ON FUNCTION public.app_for_me_profile_of(uuid) IS
  'Profil « Pour toi » d''un utilisateur : ses goûts choisis (user_interests), ses lieux suivis, et les événements de ses lieux, organisateurs et artistes suivis (event_organizers, event_artists). Pour le service (résumés) et app_for_me_profile(). Migration 20261024190000.';

REVOKE ALL ON FUNCTION public.app_for_me_profile_of(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_for_me_profile_of(uuid) TO service_role;

-- Le profil de l'appelant (auth.uid()) ; sans session, des listes vides. Security definer : app_events_in_range,
-- appelée sans session (anon), ne peut lire ni user_interests ni user_follows, et ne lit ici que les lignes de
-- l'appelant.
CREATE OR REPLACE FUNCTION public.app_for_me_profile()
RETURNS TABLE (
  interest_ids uuid[],
  location_ids uuid[],
  event_ids uuid[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.interest_ids, p.location_ids, p.event_ids
  FROM public.app_for_me_profile_of((SELECT auth.uid())) AS p
$$;

COMMENT ON FUNCTION public.app_for_me_profile() IS
  'Profil « Pour toi » de l''appelant (app_for_me_profile_of(auth.uid())) ; sans session, des listes vides. Lu par app_events_in_range et app_interest_counts. Migration 20261024190000.';

REVOKE ALL ON FUNCTION public.app_for_me_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_for_me_profile() TO anon, authenticated, service_role;

-- L'événement est-il pour ce profil : un lieu suivi l'accueille, un suivi le propose, ou un des goûts le prend.
-- Toujours vrai ou faux (jamais null : app_events_in_range compare le résultat à for_me).
CREATE OR REPLACE FUNCTION public.app_is_for_me(
  e public.events,
  interest_ids uuid[],
  location_ids uuid[],
  event_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    e.location_id = ANY (location_ids)
    OR e.id = ANY (event_ids)
    OR (cardinality(interest_ids) > 0 AND public.app_interest_ids(e) && interest_ids),
    false
  )
$$;

COMMENT ON FUNCTION public.app_is_for_me(public.events, uuid[], uuid[], uuid[]) IS
  'Règle de « Pour toi » : l''événement se tient dans un lieu suivi, est proposé par un lieu, un organisateur ou un artiste suivi (event_ids du profil), ou un des goûts choisis le prend (app_interest_ids). Profil : app_for_me_profile(). Jamais null. Migration 20261024190000.';

GRANT EXECUTE ON FUNCTION public.app_is_for_me(public.events, uuid[], uuid[], uuid[])
  TO anon, authenticated, service_role;

-- 5. app_events_in_range et app_event_counts : for_me ---------------------------------------------------------------
--
-- La définition de 20261024120000, et for_me : null (le défaut) comme avant ; true, seulement ce qui est pour
-- l'appelant (app_is_for_me avec son profil) ; false, seulement ce qui ne l'est pas. Le profil n'est lu que si
-- for_me est donné. Les versions installées de l'app, qui ne l'envoient pas, reçoivent les mêmes lignes.
DROP FUNCTION IF EXISTS public.app_events_in_range(
  timestamp, timestamp, uuid[], text, timestamp, boolean, boolean, text, numeric
);
-- La nouvelle aussi, si la migration est rejouée.
DROP FUNCTION IF EXISTS public.app_events_in_range(
  timestamp, timestamp, uuid[], text, timestamp, boolean, boolean, text, numeric, boolean
);

CREATE FUNCTION public.app_events_in_range(
  range_start timestamp,
  range_end timestamp DEFAULT NULL,
  city_ids uuid[] DEFAULT NULL,
  category text DEFAULT NULL,
  at_time timestamp DEFAULT NULL,
  free boolean DEFAULT false,
  family boolean DEFAULT false,
  zone_city text DEFAULT NULL,
  zone_km numeric DEFAULT NULL,
  for_me boolean DEFAULT NULL
)
RETURNS SETOF public.events
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT e.*
  FROM (
    SELECT
      coalesce(app_events_in_range.range_start, '-infinity'::timestamp) AT TIME ZONE 'UTC' AS debut,
      coalesce(app_events_in_range.range_end, 'infinity'::timestamp) AT TIME ZONE 'UTC' AS fin,
      coalesce(app_events_in_range.at_time, now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'UTC'
        AS maintenant,
      nullif(btrim(app_events_in_range.category), '') AS categorie,
      -- La catégorie demandée, par son id ou son nom, lue une fois : son id (null pour un texte qui ne désigne
      -- aucune catégorie visible).
      (
        SELECT c.id::text
        FROM public.categories AS c
        WHERE c.id::text = lower(btrim(app_events_in_range.category))
          OR upper(btrim(c.name)) = upper(btrim(app_events_in_range.category))
        ORDER BY c.id::text = lower(btrim(app_events_in_range.category)) DESC, c.display_order NULLS LAST, c.id
        LIMIT 1
      ) AS categorie_id,
      coalesce(app_events_in_range.free, false) AS gratuit,
      coalesce(app_events_in_range.family, false) AS en_famille,
      -- Le tag « Jeune Public », par son nom : aucun, une liste vide.
      (
        SELECT coalesce(array_agg(t.id), '{}'::uuid[])
        FROM public.tags AS t
        WHERE upper(btrim(t.name)) = 'JEUNE PUBLIC'
      ) AS jeune_public,
      -- La zone (app_zone) : sans zone ou ville inconnue, des valeurs nulles (toutes les villes).
      z.city_ids AS zone_villes,
      z.center_lat AS zone_lat,
      z.center_lng AS zone_lng,
      z.radius_km AS zone_km,
      -- « Pour toi » : le profil de l'appelant, seulement si for_me est donné.
      app_events_in_range.for_me AS pour_moi,
      p.interest_ids AS mes_gouts,
      p.location_ids AS mes_lieux,
      p.event_ids AS mes_suivis
    FROM (SELECT) AS un
    LEFT JOIN LATERAL public.app_zone(app_events_in_range.zone_city, app_events_in_range.zone_km) AS z ON true
    LEFT JOIN LATERAL (
      SELECT pr.interest_ids, pr.location_ids, pr.event_ids
      FROM public.app_for_me_profile() AS pr
      WHERE app_events_in_range.for_me IS NOT NULL
    ) AS p ON true
    -- OFFSET 0 : les bornes sont calculées à part. Recopiées dans les conditions sur events, leur
    -- AT TIME ZONE (fonction non « leakproof ») y empêcherait l'usage des index sous la RLS.
    OFFSET 0
  ) AS b
  CROSS JOIN public.app_events() AS e
  LEFT JOIN public.locations AS l ON l.id = e.location_id
  -- 1 et 2 : commence dans la plage, ou dure plus de 12 h et a commencé avant sans être fini.
  WHERE public.app_event_in_range(e.date, e.end_date, b.debut, b.fin)
    -- 3 : pas terminé (sans fin : à minuit le soir de son début, 24 h fixes en heure murale).
    AND coalesce(e.end_date, date_trunc('day', e.date, 'UTC') + interval '24 hours') > b.maintenant
    -- Périmètre des versions précédentes de l'app : ville de l'événement, à défaut celle de son lieu.
    AND (
      app_events_in_range.city_ids IS NULL
      OR cardinality(app_events_in_range.city_ids) = 0
      OR coalesce(e.city_id, l.city_id) = ANY (app_events_in_range.city_ids)
    )
    -- Zone : la ville choisie, ou le lieu (à défaut l'événement) à moins du rayon de son centre.
    AND public.app_in_zone(
      coalesce(e.city_id, l.city_id),
      coalesce(l.latitude, e.latitude),
      coalesce(l.longitude, e.longitude),
      b.zone_villes,
      b.zone_lat,
      b.zone_lng,
      b.zone_km
    )
    -- Catégorie : son id (events.category est l'id de sa catégorie, migration 20261024120000), ou le texte reçu tel
    -- quel (un texte qui ne désigne aucune catégorie, gardé dans events.category).
    AND (
      b.categorie IS NULL
      OR e.category = b.categorie_id
      OR upper(btrim(e.category)) = upper(b.categorie)
    )
    -- Gratuit : tous les prix connus à 0.
    AND (NOT b.gratuit OR e.price_kind = 'free')
    -- En famille : la case « jeune public », ou le tag « Jeune Public ».
    AND (NOT b.en_famille OR e.is_young_audience OR e.tag_ids && b.jeune_public)
    -- Pour toi (for_me) : ce qui l'est, ou ce qui ne l'est pas.
    AND (
      b.pour_moi IS NULL
      OR public.app_is_for_me(e, b.mes_gouts, b.mes_lieux, b.mes_suivis) = b.pour_moi
    )
    -- Par utilisateur : ses événements masqués et les auteurs qu'il a bloqués. Des sous-requêtes non corrélées :
    -- chacune est lue une fois par requête (un sous-plan haché), et auth.uid() une fois (une InitPlan). Un
    -- événement sans auteur n'a pas d'auteur bloqué (NOT IN rendrait null avec une liste non vide).
    AND e.id NOT IN (
      SELECT h.event_id
      FROM public.user_hidden_events AS h
      WHERE h.user_id = (SELECT auth.uid())
    )
    AND (
      e.created_by IS NULL
      OR e.created_by NOT IN (
        SELECT bu.blocked_user_id
        FROM public.blocked_users AS bu
        WHERE bu.blocker_user_id = (SELECT auth.uid())
      )
    )
$$;

COMMENT ON FUNCTION public.app_events_in_range(timestamp, timestamp, uuid[], text, timestamp, boolean, boolean, text, numeric, boolean) IS
  'Événements de app_events() dans la plage [range_start, range_end) (heure de Paris) : commencent dans la plage, ou durent plus de 12 h et ont commencé avant ; pas terminés. Zone (zone_city, zone_km : la ville, ou à moins du rayon de son centre ; app_in_zone), ancien périmètre (city_ids, à défaut la ville du lieu), catégorie (id ou nom), gratuits seulement (free : price_kind = free), en famille seulement (family : is_young_audience ou le tag « Jeune Public »), « Pour toi » (for_me : null, tous ; true, ce qui est pour l''appelant, app_is_for_me ; false, le reste), sans les événements masqués par l''utilisateur ni ceux des auteurs bloqués (sous-requêtes lues une fois par requête). Règles : migrations 20261019210000, 20261021160000, 20261021220000, 20261024120000 et 20261024190000.';

GRANT EXECUTE ON FUNCTION public.app_events_in_range(timestamp, timestamp, uuid[], text, timestamp, boolean, boolean, text, numeric, boolean)
  TO anon, authenticated;

-- app_event_counts : la définition de 20261024120000, et for_me, passé à app_events_in_range. Sur « Pour toi »
-- (for_me true), on compte comme une page de catégorie : la page montre chaque événement, sans la règle de « Tout ».
-- Avec for_me false, les « autres » de « Tout » : sa règle (app_on_tout, un festival qui a un programme compte par ses
-- événements), moins ce qui est pour toi.
DROP FUNCTION IF EXISTS public.app_event_counts(jsonb, uuid[], text, timestamp, boolean, boolean, text, numeric);
DROP FUNCTION IF EXISTS public.app_event_counts(jsonb, uuid[], text, timestamp, boolean, boolean, text, numeric, boolean);

CREATE FUNCTION public.app_event_counts(
  ranges jsonb,
  city_ids uuid[] DEFAULT NULL,
  category text DEFAULT NULL,
  at_time timestamp DEFAULT NULL,
  free boolean DEFAULT false,
  family boolean DEFAULT false,
  zone_city text DEFAULT NULL,
  zone_km numeric DEFAULT NULL,
  for_me boolean DEFAULT NULL
)
RETURNS TABLE (
  range_index integer,
  range_key text,
  range_start timestamp,
  range_end timestamp,
  events_count integer,
  starting_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH plages AS (
    SELECT
      (r.ordre - 1)::integer AS indice,
      r.plage ->> 'key' AS cle,
      (r.plage ->> 'start')::timestamp AS debut,
      (r.plage ->> 'end')::timestamp AS fin
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(app_event_counts.ranges) = 'array' THEN app_event_counts.ranges ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS r(plage, ordre)
    ORDER BY r.ordre
    LIMIT 500
  ),
  bornes AS (
    SELECT
      p.*,
      coalesce(p.debut, '-infinity'::timestamp) AT TIME ZONE 'UTC' AS debut_tz,
      coalesce(p.fin, 'infinity'::timestamp) AT TIME ZONE 'UTC' AS fin_tz
    FROM plages AS p
  ),
  -- Les festivals qui ont un programme : l'index de l'accueil (app_festival_events), lu une fois, et
  -- seulement sur « Tout ».
  programmes AS MATERIALIZED (
    SELECT DISTINCT f.festival_id
    FROM public.app_festival_events(app_event_counts.at_time) AS f
  ),
  -- Les événements sont lus une fois, sur l'union des plages : un événement d'une plage appartient
  -- toujours à [plus petit début, plus grande fin). Chaque plage les retrie ensuite.
  candidats AS (
    SELECT e.id, e.date, e.end_date
    FROM (
      SELECT min(coalesce(p.debut, '-infinity'::timestamp)) AS debut, max(coalesce(p.fin, 'infinity'::timestamp)) AS fin
      FROM plages AS p
      HAVING count(*) > 0
    ) AS u
    CROSS JOIN LATERAL public.app_events_in_range(
      u.debut,
      u.fin,
      app_event_counts.city_ids,
      app_event_counts.category,
      app_event_counts.at_time,
      app_event_counts.free,
      app_event_counts.family,
      zone_city => app_event_counts.zone_city,
      zone_km => app_event_counts.zone_km,
      for_me => app_event_counts.for_me
    ) AS e
    -- Sur « Tout », l'accueil n'affiche pas les événements retirés de l'accueil, et un festival qui a un
    -- programme y est une carte : ses événements comptent, chacun à sa date, pas sa fiche en plus. « Pour toi »
    -- (for_me true) et une catégorie montrent chaque événement.
    WHERE nullif(btrim(app_event_counts.category), '') IS NOT NULL
      OR app_event_counts.for_me IS TRUE
      OR (
        public.app_on_tout(e)
        AND NOT EXISTS (SELECT 1 FROM programmes AS p WHERE p.festival_id = e.id)
      )
  )
  SELECT
    b.indice,
    b.cle,
    b.debut,
    b.fin,
    count(c.id)::integer,
    count(c.id) FILTER (WHERE c.date >= b.debut_tz)::integer
  FROM bornes AS b
  LEFT JOIN candidats AS c ON public.app_event_in_range(c.date, c.end_date, b.debut_tz, b.fin_tz)
  GROUP BY b.indice, b.cle, b.debut, b.fin
  ORDER BY b.indice
$$;

COMMENT ON FUNCTION public.app_event_counts(jsonb, uuid[], text, timestamp, boolean, boolean, text, numeric, boolean) IS
  'Comptes du calendrier de l''app : pour chaque plage {start, end, key} de ranges (heure de Paris), events_count (événements de app_events_in_range, une fois chacun ; sur « Tout », ceux d''app_on_tout (sans hide_from_home) et sans la fiche d''un festival qui a un programme dans app_festival_events : ses événements comptent, pas elle) et starting_count (ceux qui commencent dans la plage). free et family : seulement les gratuits, ou en famille (migration 20261021160000). for_me : true, « Pour toi » (comptée comme une catégorie) ; false, les autres de « Tout » (sa règle, moins ce qui est pour l''appelant) ; null, comme avant (migration 20261024190000). Migrations 20261021220000, 20261023170000, 20261024120000 et 20261024190000.';

GRANT EXECUTE ON FUNCTION public.app_event_counts(jsonb, uuid[], text, timestamp, boolean, boolean, text, numeric, boolean)
  TO anon, authenticated;

-- 6. app_interest_counts : le nombre de chaque bulle ----------------------------------------------------------------
--
-- Pour chaque goût actif, dans l'ordre des bulles : ses événements à venir dans la zone (app_events_in_range à partir
-- d'aujourd'hui 0 h, heure de Paris, ou at_time ; pas terminés ; sans les masqués ni les auteurs bloqués de
-- l'appelant), comptés comme la page (app_interest_ids : le jeune public seulement dans « En famille »), et s'il est
-- choisi. Seulement les goûts à 5 événements ou plus, et ceux que l'appelant a choisis, même sous 5 (choix 13).
CREATE OR REPLACE FUNCTION public.app_interest_counts(
  zone_city text DEFAULT NULL,
  zone_km numeric DEFAULT NULL,
  at_time timestamp DEFAULT NULL
)
RETURNS TABLE (
  interest_id uuid,
  events_count integer,
  chosen boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH a_venir AS MATERIALIZED (
    SELECT public.app_interest_ids(e) AS gouts
    FROM public.app_events_in_range(
      date_trunc('day', coalesce(app_interest_counts.at_time, now() AT TIME ZONE 'Europe/Paris')),
      NULL,
      NULL,
      NULL,
      app_interest_counts.at_time,
      zone_city => app_interest_counts.zone_city,
      zone_km => app_interest_counts.zone_km
    ) AS e
  ),
  choisis AS MATERIALIZED (
    SELECT p.interest_ids
    FROM public.app_for_me_profile() AS p
  ),
  comptes AS (
    SELECT
      i.id,
      i.display_order,
      (SELECT count(*) FROM a_venir AS a WHERE i.id = ANY (a.gouts))::integer AS n,
      coalesce((SELECT i.id = ANY (c.interest_ids) FROM choisis AS c), false) AS choisi
    FROM public.app_interests AS i
    WHERE i.is_active
  )
  SELECT c.id, c.n, c.choisi
  FROM comptes AS c
  WHERE c.n >= 5 OR c.choisi
  ORDER BY c.display_order, c.id
$$;

COMMENT ON FUNCTION public.app_interest_counts(text, numeric, timestamp) IS
  'Les bulles de « Pour toi » : pour chaque goût actif (ordre des bulles), events_count, ses événements à venir de la zone (app_events_in_range à partir d''aujourd''hui 0 h, heure de Paris, ou at_time ; comptés par app_interest_ids), et chosen, choisi par l''appelant. Seulement ceux à 5 ou plus, ou choisis. Migration 20261024190000.';

GRANT EXECUTE ON FUNCTION public.app_interest_counts(text, numeric, timestamp) TO anon, authenticated;

-- 7. copy_guest_data : les goûts aussi -----------------------------------------------------------------------------
--
-- La définition de 20261021141000 (mêmes règles, mêmes refus), plus les goûts de l'invité ajoutés à ceux du compte,
-- sans doublons, avec leur date. Une colonne de plus dans la ligne rendue (interests) : la fonction est recréée ;
-- l'app lit les colonnes qu'elle connaît.
DROP FUNCTION IF EXISTS public.copy_guest_data(uuid);

CREATE FUNCTION public.copy_guest_data(guest_session_id uuid)
RETURNS TABLE (
  likes integer,
  hidden_events integer,
  notification_preferences integer,
  notification_categories integer,
  follows integer,
  interests integer
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

  INSERT INTO public.user_interests (user_id, interest_id, created_at)
  SELECT compte, ui.interest_id, ui.created_at
  FROM public.user_interests AS ui
  WHERE ui.user_id = invite
  ON CONFLICT (user_id, interest_id) DO NOTHING;
  GET DIAGNOSTICS interests = ROW_COUNT;

  RETURN NEXT;
END
$$;

COMMENT ON FUNCTION public.copy_guest_data(uuid) IS
  'Recopie sur le compte appelant les favoris, masqués, suivis, goûts (« Pour toi ») et préférences de notification (si le compte n''en a pas) de la session invitée guest_session_id (auth.sessions.id). Appelant non anonyme, source anonyme. Rend le nombre de lignes ajoutées par table. Migrations 20261021141000 et 20261024190000.';

REVOKE ALL ON FUNCTION public.copy_guest_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_guest_data(uuid) TO authenticated;

-- 8. Mesure d'audience : trois compteurs ----------------------------------------------------------------------------
--
-- for_me_opened (la page « Pour toi » ouverte), interests_changed (un goût choisi ou retiré), for_me_to_all (« Voir
-- dans Tout » touché depuis « Pour toi » : s'il monte, « Pour toi » est trop étroit). Les listes de
-- 20261024150000_add_radio_show_follows.sql (radio_show_follow, radio_followed_play compris), les trois clés en plus :
-- dans n'importe quel ordre d'application, aucune migration ne retire les clés de l'autre si celle-ci les a aussi.

ALTER TABLE public.app_audience_counts DROP CONSTRAINT IF EXISTS app_audience_counts_metric_check;
ALTER TABLE public.app_audience_counts ADD CONSTRAINT app_audience_counts_metric_check CHECK (metric IN (
  -- Même liste que dans app_audience_add : les changer ensemble.
  'event_opened', 'ticket_tapped', 'search_no_result', 'when_sheet_used', 'event_liked',
  'radio_live_play', 'radio_episode_play', 'festival_opened', 'radio_show_follow', 'radio_followed_play',
  'for_me_opened', 'interests_changed', 'for_me_to_all'
));

CREATE OR REPLACE FUNCTION public.app_audience_add(day date, counts jsonb)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH bornes AS (
    SELECT (now() AT TIME ZONE 'Europe/Paris')::date AS aujourdhui
  ),
  purge AS (
    DELETE FROM public.app_audience_counts AS c
    USING bornes AS b
    WHERE c.day < (b.aujourdhui - interval '25 months')::date
  ),
  ajouts AS (
    SELECT
      e.key AS metric,
      CASE WHEN jsonb_typeof(e.value) = 'number'
        THEN greatest(least(floor(e.value::numeric), 200), 0)::integer
      END AS n
    FROM bornes AS b,
      jsonb_each(CASE WHEN jsonb_typeof(app_audience_add.counts) = 'object'
        THEN app_audience_add.counts ELSE '{}'::jsonb END) AS e
    WHERE app_audience_add.day BETWEEN b.aujourdhui - 7 AND b.aujourdhui
      -- Même liste que la contrainte de la table : les changer ensemble.
      AND e.key IN (
        'event_opened', 'ticket_tapped', 'search_no_result', 'when_sheet_used', 'event_liked',
        'radio_live_play', 'radio_episode_play', 'festival_opened', 'radio_show_follow', 'radio_followed_play',
        'for_me_opened', 'interests_changed', 'for_me_to_all'
      )
      AND jsonb_typeof(e.value) = 'number'
  ),
  ecrits AS (
    INSERT INTO public.app_audience_counts AS c (day, metric, count)
    SELECT app_audience_add.day, a.metric, a.n
    FROM ajouts AS a
    WHERE a.n >= 1
    ON CONFLICT (day, metric) DO UPDATE SET count = c.count + excluded.count
    RETURNING 1
  )
  SELECT count(*)::integer FROM ecrits
$$;

COMMENT ON FUNCTION public.app_audience_add(date, jsonb) IS
  'Mesure d''audience de l''app (U41) : ajoute au jour donné (7 derniers jours, heure de Paris) les compteurs connus, de 1 à 200 chacun par appel ; le reste est ignoré. Sans identité. Rend le nombre de compteurs ajoutés. Compteurs : migrations 20261021013000, 20261023142000 (radio), 20261023180000 (festival_opened), 20261024150000 (radio_show_follow, radio_followed_play) et 20261024190000 (« Pour toi » : for_me_opened, interests_changed, for_me_to_all).';

-- CREATE OR REPLACE garde les droits de la fonction : exécutable par anon et authenticated.

-- Vérification (SQL Editor) : les goûts et leurs règles ; les nombres des bulles (Orléans, 25 km) ; les droits.
-- select slug, name, cardinality(category_ids) as categories, cardinality(tag_ids) as tags, family
--   from public.app_interests order by display_order;
-- select i.name, c.events_count from public.app_interest_counts('orleans', 25) as c
--   join public.app_interests as i on i.id = c.interest_id order by i.display_order;
-- select has_function_privilege('anon', 'public.app_for_me_profile_of(uuid)', 'execute') as anon_profile_of,
--        has_table_privilege('anon', 'public.user_interests', 'select') as anon_user_interests;

-- Rollback, dans cet ordre (avant la sortie de la version de l'app qui lit for_me et app_interest_ids) :
-- recréer app_audience_add et sa contrainte de 20261024150000_add_radio_show_follows.sql (si elle est en prod, sinon
-- de 20261023180000_add_festival_audience_metric.sql) après DELETE FROM public.app_audience_counts WHERE metric IN
-- ('for_me_opened', 'interests_changed', 'for_me_to_all') ;
-- DROP FUNCTION IF EXISTS public.copy_guest_data(uuid); puis la recréer de 20261021141000_create_user_follows.sql ;
-- DROP FUNCTION IF EXISTS public.app_interest_counts(text, numeric, timestamp);
-- DROP FUNCTION IF EXISTS public.app_event_counts(jsonb, uuid[], text, timestamp, boolean, boolean, text, numeric, boolean);
-- DROP FUNCTION IF EXISTS public.app_events_in_range(timestamp, timestamp, uuid[], text, timestamp, boolean, boolean, text, numeric, boolean);
-- puis recréer app_events_in_range et app_event_counts de 20261024120000_app_home_rules.sql (avec leurs droits) ;
-- DROP FUNCTION IF EXISTS public.app_is_for_me(public.events, uuid[], uuid[], uuid[]);
-- DROP FUNCTION IF EXISTS public.app_for_me_profile();
-- DROP FUNCTION IF EXISTS public.app_for_me_profile_of(uuid);
-- DROP FUNCTION IF EXISTS public.app_interest_ids(public.events);
-- DROP TABLE IF EXISTS public.user_interests;
-- DROP TABLE IF EXISTS public.app_interests;
