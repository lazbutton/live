-- Tests de app_possible_duplicates(), app_link_keys() et app_similar_titles() (migration
-- 20261021201000_create_app_possible_duplicates.sql).
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.
--
-- « Maintenant » est fixé au vendredi 6 novembre 2026, 19:15 (heure de Paris) par `at_time`. Les
-- événements sont désignés par les deux derniers chiffres de leur id (« 01 » = l'événement 01).

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events) THEN
    RAISE EXCEPTION 'Base non vide : ces tests se lancent sur une base jetable (scripts/db-test.sh), jamais en prod.';
  END IF;
END $$;

CREATE FUNCTION pg_temp.verifie(nom text, obtenu text, attendu text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF obtenu IS DISTINCT FROM attendu THEN
    RAISE EXCEPTION 'ÉCHEC % : obtenu « % », attendu « % »', nom, obtenu, attendu;
  END IF;
  RAISE NOTICE 'ok  %', nom;
END $$;

-- Les lignes, dans l'ordre du rang : « 01:link 03:title » ; vide sans ligne.
CREATE FUNCTION pg_temp.doublons(titre text, debut timestamp, lieu text, lien text,
  nombre integer DEFAULT 3, maintenant timestamp DEFAULT '2026-11-06 19:15') RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(d.event_id::text, 2) || ':' || d.reason, ' ' ORDER BY d.rank), '')
  FROM public.app_possible_duplicates(
    titre,
    debut,
    CASE WHEN lieu IS NOT NULL THEN ('1a000000-0000-4000-8000-00000000000' || lieu)::uuid END,
    lien,
    maintenant,
    nombre
  ) AS d
$$;

CREATE FUNCTION pg_temp.cles(lien text) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(array_to_string(public.app_link_keys(lien), ' | '), 'null')
$$;

-- Un appel refusé : le code de l'erreur au lieu d'arrêter le fichier.
CREATE FUNCTION pg_temp.lit_les_lignes() RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM public.app_possible_duplicate_results;
  RETURN 'lu';
EXCEPTION WHEN OTHERS THEN
  RETURN 'erreur ' || SQLSTATE;
END $$;

-- Les règles de comparaison ------------------------------------------------------------------------

SELECT pg_temp.verifie('liens : protocole, www, slash final, casse',
  pg_temp.cles('https://www.Billetterie.fr/Spectacle/'), 'billetterie.fr/spectacle');
SELECT pg_temp.verifie('liens : fragment et paramètres de suivi retirés, les autres gardés',
  pg_temp.cles('http://exemple.fr/agenda?id=12&utm_source=fb&fbclid=x#haut'), 'exemple.fr/agenda?id=12');
SELECT pg_temp.verifie('liens : chemin précis, aussi sans ses paramètres',
  pg_temp.cles('https://www.facebook.com/events/123456789/?ref=share&acontext=x'),
  'facebook.com/events/123456789?acontext=x | facebook.com/events/123456789');
SELECT pg_temp.verifie('liens : une page .php reste avec ses paramètres',
  pg_temp.cles('https://salle.fr/agenda/evenement.php?id=4'), 'salle.fr/agenda/evenement.php?id=4');
SELECT pg_temp.verifie('liens : autre chose qu''un lien http(s)',
  pg_temp.cles('ftp://exemple.fr/a') || ' ' || pg_temp.cles('') || ' ' || pg_temp.cles(NULL)
  || ' ' || pg_temp.cles('facebook.com/events/1'),
  'null null null null');

SELECT pg_temp.verifie('titres : accents, casse et ponctuation ignorés',
  public.app_similar_titles('Youn Sun Nah !', 'YOUN SUN NAH')::text, 'true');
SELECT pg_temp.verifie('titres : l''un contient l''autre (6 caractères au moins)',
  public.app_similar_titles('Youn Sun Nah', 'Youn Sun Nah + 1ère partie Nit And Dogs')::text
  || ' ' || public.app_similar_titles('Jazz', 'Jazz au jardin')::text,
  'true false');
SELECT pg_temp.verifie('titres : mots communs à 60 %',
  public.app_similar_titles('Festival des Arts de la Rue', 'Arts de la rue : le festival')::text
  || ' ' || public.app_similar_titles('Concert de jazz', 'Concert de rock')::text,
  'true false');
SELECT pg_temp.verifie('titres : vides',
  public.app_similar_titles('', 'Concert')::text || ' ' || public.app_similar_titles(NULL, NULL)::text,
  'false false');

-- Jeu d'essai --------------------------------------------------------------------------------------

INSERT INTO auth.users (id, email) VALUES
  ('3d000000-0000-4000-8000-000000000001', 'u1@test.local'),
  ('3d000000-0000-4000-8000-000000000002', 'u2@test.local');

-- L1 théâtre, L2 salle, L3 bar.
INSERT INTO public.locations (id, name, address) VALUES
  ('1a000000-0000-4000-8000-000000000001', 'Zz Théâtre', '1 rue A'),
  ('1a000000-0000-4000-8000-000000000002', 'Zz Salle', '2 rue A'),
  ('1a000000-0000-4000-8000-000000000003', 'Zz Bar', '3 rue A');

INSERT INTO public.events (id, title, date, end_date, category, location_id, status, created_by,
  external_url, facebook_url, instagram_url, scraping_url)
SELECT
  ('e5000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  titre,
  debut::timestamp AT TIME ZONE 'UTC',
  fin::timestamp AT TIME ZONE 'UTC',
  'CONCERT',
  CASE WHEN lieu IS NOT NULL THEN ('1a000000-0000-4000-8000-00000000000' || lieu)::uuid END,
  coalesce(statut, 'approved'),
  auteur::uuid,
  billetterie,
  facebook,
  instagram,
  collecte
FROM (VALUES
  -- Le 17 novembre au théâtre (L1), 20:00.
  (1,  'Youn Sun Nah + 1ère partie Nit And Dogs', '2026-11-17 20:00', NULL, 1, NULL, NULL,
       'https://www.billetterie.fr/youn-sun-nah?utm_source=x', NULL, NULL, NULL),
  -- Le même soir au théâtre, 21:30 (à deux heures près), un autre titre.
  (2,  'Bal de clôture',                  '2026-11-17 21:30', NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL),
  -- Au théâtre, trop tard (plus de deux heures après 20:00).
  (3,  'Spectacle de minuit',             '2026-11-17 22:30', NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL),
  -- Même titre, le même jour, à la salle (L2) ; puis un autre jour.
  (4,  'Youn Sun Nah',                    '2026-11-17 18:00', NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL),
  (5,  'Youn Sun Nah',                    '2026-11-18 20:00', NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL),
  -- Une exposition en cours le 17 novembre, au bar (L3).
  (6,  'Les affiches de Youn Sun Nah',    '2026-11-01 10:00', '2026-11-30 18:00', 3, NULL, NULL, NULL, NULL, NULL, NULL),
  -- Importé par la collecte depuis une page Facebook (scraping_url) ; puis une page Instagram et une page
  -- Facebook (instagram_url, facebook_url).
  (7,  'Soirée Facebook',                 '2026-11-20 20:00', NULL, 3, NULL, NULL, NULL, NULL, NULL,
       'https://facebook.com/events/987654321'),
  (12, 'Soirée Instagram',                '2026-11-21 20:00', NULL, 3, NULL, NULL, NULL, NULL,
       'https://www.instagram.com/p/AbCdEf123/?igsh=x', NULL),
  (13, 'Soirée Facebook bis',             '2026-11-22 20:00', NULL, 3, NULL, NULL, NULL,
       'https://www.facebook.com/events/555666777/', NULL, NULL),
  -- Exclus : en attente (08), passé (09), masqué par U1 (10), d'un auteur bloqué par U1 (11).
  (8,  'Youn Sun Nah en attente',         '2026-11-17 20:00', NULL, 1, 'pending', '3d000000-0000-4000-8000-000000000001',
       'https://www.billetterie.fr/youn-sun-nah', NULL, NULL, NULL),
  (9,  'Youn Sun Nah passé',              '2026-11-01 20:00', NULL, 1, NULL, NULL,
       'https://www.billetterie.fr/youn-sun-nah', NULL, NULL, NULL),
  (10, 'Youn Sun Nah, masqué par U1',     '2026-11-17 20:30', NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL),
  (11, 'Youn Sun Nah, auteur bloqué',     '2026-11-17 19:00', NULL, 1, NULL, '3d000000-0000-4000-8000-000000000002', NULL, NULL, NULL, NULL)
) AS v(n, titre, debut, fin, lieu, statut, auteur, billetterie, facebook, instagram, collecte);

INSERT INTO public.user_hidden_events (event_id, user_id) VALUES
  ('e5000000-0000-4000-8000-000000000010', '3d000000-0000-4000-8000-000000000001');
INSERT INTO public.blocked_users (blocker_user_id, blocked_user_id) VALUES
  ('3d000000-0000-4000-8000-000000000001', '3d000000-0000-4000-8000-000000000002');

-- Sans session (clé anon publique) --------------------------------------------------------------

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

-- L'affiche lue de la maquette : « Youn Sun Nah », le 17 novembre à 20:00, au théâtre. 01 au même lieu
-- à 20:00, puis 10 (20:30) et 11 (19:00), 02 (21:30) : même lieu à deux heures près ; 04, 06 : même titre
-- le même jour (l'exposition en cours) ; pas 03 (22:30), 05 (le 18), 08 (en attente), 09 (passé).
SELECT pg_temp.verifie('affiche lue : même lieu à deux heures près, puis même titre ce jour-là',
  pg_temp.doublons('Youn Sun Nah', '2026-11-17 20:00', '1', NULL, 5),
  '01:place 10:place 11:place 02:place 04:title');
SELECT pg_temp.verifie('3 lignes par défaut',
  pg_temp.doublons('Youn Sun Nah', '2026-11-17 20:00', '1', NULL), '01:place 10:place 11:place');
SELECT pg_temp.verifie('sans lieu : le titre seul, le même jour (l''exposition en cours comprise)',
  pg_temp.doublons('youn sun nah', '2026-11-17 20:00', NULL, NULL, 5),
  '01:title 10:title 11:title 04:title 06:title');
SELECT pg_temp.verifie('un autre jour : rien au théâtre, l''autre date du même titre',
  pg_temp.doublons('Youn Sun Nah', '2026-11-18 20:00', '1', NULL), '05:title 06:title');
SELECT pg_temp.verifie('nombre de lignes : 1 à 5',
  pg_temp.doublons('Youn Sun Nah', '2026-11-17 20:00', '1', NULL, 0) || ' / '
  || (SELECT count(*) FROM public.app_possible_duplicates('Youn Sun Nah', '2026-11-17 20:00',
       '1a000000-0000-4000-8000-000000000001', NULL, '2026-11-06 19:15', 1000))::text,
  '01:place / 5');

-- Depuis un lien (l'app l'envoie complété en https://), quelle que soit la date : la billetterie de 01
-- (external_url), quelle que soit la façon de l'écrire ; la page d'où la collecte a importé 07
-- (scraping_url) ; les pages Instagram de 12 et Facebook de 13. Le lien passe avant le reste.
SELECT pg_temp.verifie('lien : www, slash final et paramètres de suivi ignorés',
  pg_temp.doublons(NULL, NULL, NULL, 'https://billetterie.fr/youn-sun-nah/?fbclid=abc'), '01:link');
SELECT pg_temp.verifie('lien : sans protocole, rien (l''app le complète)',
  pg_temp.doublons(NULL, NULL, NULL, 'billetterie.fr/youn-sun-nah'), '');
SELECT pg_temp.verifie('lien : la page Facebook importée par la collecte, avec d''autres paramètres',
  pg_temp.doublons(NULL, NULL, '3', 'https://www.facebook.com/events/987654321?acontext=y'), '07:link');
SELECT pg_temp.verifie('lien : la page Instagram, sans ses paramètres de suivi, sans casse',
  pg_temp.doublons(NULL, NULL, NULL, 'https://instagram.com/p/abcdef123'), '12:link');
SELECT pg_temp.verifie('lien : la page Facebook de l''événement',
  pg_temp.doublons(NULL, NULL, NULL, 'https://facebook.com/events/555666777?ref=x'), '13:link');
SELECT pg_temp.verifie('lien : un autre domaine ne correspond pas (m.facebook.com)',
  pg_temp.doublons(NULL, NULL, '3', 'https://m.facebook.com/events/987654321'), '');
SELECT pg_temp.verifie('lien d''abord, puis le lieu et le titre',
  pg_temp.doublons('Youn Sun Nah', '2026-11-17 20:00', '1', 'https://facebook.com/events/987654321', 3),
  '07:link 01:place 10:place');

SELECT pg_temp.verifie('rien à comparer : aucune ligne',
  pg_temp.doublons('Youn Sun Nah', NULL, '1', NULL) || '|' || pg_temp.doublons(NULL, NULL, NULL, 'pas un lien')
  || '|' || pg_temp.doublons(NULL, NULL, NULL, NULL),
  '||');
SELECT pg_temp.verifie('le 2 décembre : tout est passé',
  pg_temp.doublons('Youn Sun Nah', '2026-11-17 20:00', '1', NULL, 3, '2026-12-02 09:00'), '');
SELECT pg_temp.verifie('anon : table des lignes illisible', pg_temp.lit_les_lignes(), 'erreur 42501');

-- Avec la session de U1 : sans 10, qu'il a masqué, ni 11, d'un auteur qu'il a bloqué ; pas son propre
-- événement en attente (08), qui n'est pas publié.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"3d000000-0000-4000-8000-000000000001"}', true);
SELECT pg_temp.verifie('U1 : sans l''événement masqué, l''auteur bloqué ni son événement en attente',
  pg_temp.doublons('Youn Sun Nah', '2026-11-17 20:00', '1', NULL, 5),
  '01:place 02:place 04:title 06:title');
SELECT pg_temp.verifie('authenticated : table des lignes illisible', pg_temp.lit_les_lignes(), 'erreur 42501');

RESET ROLE;
ROLLBACK;
