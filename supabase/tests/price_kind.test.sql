-- Tests de events.price_kind (migration 20261020100000_add_price_kind_to_events.sql).
--
-- Sur une base jetable avec toutes les migrations et aucun événement : scripts/db-test.sh.
-- Jamais en prod : tout se passe dans une transaction annulée, mais le script s'arrête de lui-même
-- si la base contient déjà des événements.

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

-- Un événement par cas : (price, price_min, price_max, prix libre) → genre attendu.
INSERT INTO public.events (id, title, date, category, status, price, price_min, price_max, is_pay_what_you_want)
SELECT
  ('e0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  titre, '2026-11-07 20:30+00', 'Concert', 'approved', prix, prix_min, prix_max, libre
FROM (VALUES
  (1,  'P01 aucun prix',                    NULL::numeric, NULL::numeric, NULL::numeric, false),
  (2,  'P02 gratuit (admin : 0 et 0)',      0,    0,    NULL, false),
  (3,  'P03 gratuit (price seul)',          0,    NULL, NULL, false),
  (4,  'P04 gratuit (price_min seul)',      NULL, 0,    NULL, false),
  (5,  'P05 12 €',                          12,   12,   NULL, false),
  (6,  'P06 8 à 12 €',                      8,    8,    12,   false),
  (7,  'P07 0 à 5 €',                       0,    0,    5,    false),
  (8,  'P08 maximum seul',                  NULL, NULL, 10,   false),
  (9,  'P09 prix libre avec montant',       12,   12,   NULL, true),
  (10, 'P10 prix libre sans montant',       NULL, NULL, NULL, true),
  (11, 'P11 prix négatif',                  -1,   NULL, NULL, false),
  (12, 'P12 négatif mais minimum à 0',      -1,   0,    NULL, false),
  (13, 'P13 price ignoré (maximum à 0)',    5,    NULL, 0,    false),
  (14, 'P14 price 12 (app : price seul)',   12,   NULL, NULL, false)
) AS v(n, titre, prix, prix_min, prix_max, libre);

SELECT pg_temp.verifie('genres calculés',
  (SELECT string_agg(split_part(title, ' ', 1) || '=' || price_kind, ' ' ORDER BY title) FROM public.events),
  'P01=unknown P02=free P03=free P04=free P05=paid P06=paid P07=paid P08=paid '
  || 'P09=pay_what_you_want P10=pay_what_you_want P11=unknown P12=free P13=free P14=paid');

-- Recalculé à chaque écriture.
UPDATE public.events SET price = 0, price_min = 0 WHERE id = 'e0000000-0000-4000-8000-000000000001';
SELECT pg_temp.verifie('aucun prix → 0 : gratuit',
  (SELECT price_kind FROM public.events WHERE id = 'e0000000-0000-4000-8000-000000000001'), 'free');
UPDATE public.events SET price = 15, price_min = 15 WHERE id = 'e0000000-0000-4000-8000-000000000001';
SELECT pg_temp.verifie('0 → 15 : payant',
  (SELECT price_kind FROM public.events WHERE id = 'e0000000-0000-4000-8000-000000000001'), 'paid');
UPDATE public.events SET is_pay_what_you_want = true WHERE id = 'e0000000-0000-4000-8000-000000000001';
SELECT pg_temp.verifie('payant → prix libre',
  (SELECT price_kind FROM public.events WHERE id = 'e0000000-0000-4000-8000-000000000001'), 'pay_what_you_want');
UPDATE public.events SET is_pay_what_you_want = false, price = NULL, price_min = NULL
WHERE id = 'e0000000-0000-4000-8000-000000000001';
SELECT pg_temp.verifie('prix effacé : inconnu',
  (SELECT price_kind FROM public.events WHERE id = 'e0000000-0000-4000-8000-000000000001'), 'unknown');

-- Jamais écrite par le code.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.events (title, date, category, status, price_kind)
    VALUES ('écrite', '2026-11-07 20:30+00', 'Concert', 'approved', 'free');
    RAISE EXCEPTION 'ÉCHEC price_kind écrite à l''insertion';
  EXCEPTION WHEN generated_always THEN
    RAISE NOTICE 'ok  insertion avec price_kind refusée';
  END;
  BEGIN
    UPDATE public.events SET price_kind = 'free' WHERE id = 'e0000000-0000-4000-8000-000000000005';
    RAISE EXCEPTION 'ÉCHEC price_kind modifiée';
  EXCEPTION WHEN generated_always THEN
    RAISE NOTICE 'ok  modification de price_kind refusée';
  END;
END $$;

-- Lue par l'app, sans session : app_events() et app_events_in_range() la rendent.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT pg_temp.verifie('app_events() en anon',
  (SELECT price_kind FROM public.app_events() WHERE id = 'e0000000-0000-4000-8000-000000000006'), 'paid');
SELECT pg_temp.verifie('app_events_in_range() en anon',
  (SELECT string_agg(DISTINCT price_kind, ' ' ORDER BY price_kind)
   FROM public.app_events_in_range('2026-11-07 00:00', '2026-11-08 00:00', at_time => '2026-11-06 12:00')),
  'free paid pay_what_you_want unknown');
RESET ROLE;

ROLLBACK;
