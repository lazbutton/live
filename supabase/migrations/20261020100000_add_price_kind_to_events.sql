-- Genre de prix d'un événement : une seule règle pour l'app, l'admin et les pages publiques.
--
-- Décision de l'utilisateur (2026-10-20) : un prix de 0 s'affiche « Gratuit », un prix non renseigné
-- n'affiche rien. Avant, l'app (Event.getCompactPriceLabel), la page d'artiste et les visuels pour les
-- réseaux affichaient « Gratuit » sans prix (154 des 393 événements publiés le 2026-10-19), quand la
-- page de partage n'affichait rien : quatre règles, une par client. Constat : docs/API_APP.md
-- (incohérences, point 7).
--
-- events.price_kind, colonne générée :
-- - 'pay_what_you_want' : prix libre (is_pay_what_you_want), quels que soient les montants ;
-- - 'unknown' : aucun prix connu : rien n'est affiché ;
-- - 'free' : tous les prix connus valent 0 : « Gratuit » ;
-- - 'paid' : sinon, y compris une fourchette qui part de 0 (« 0 à 5 € » : 3 événements le 2026-10-20).
-- Prix connus : price_min et price_max, à défaut price (comme l'app et lib/events/price-utils.ts) ;
-- une valeur négative ne compte pas. Les montants restent dans ces colonnes : leur mise en forme
-- (« 12 € », « 8 à 12 € ») reste à chaque client.
--
-- Tous les chemins d'écriture notent déjà « gratuit » par 0 et « inconnu » par null (formulaire de
-- l'admin, collecte, scraping, import par lot, assistant de l'app) ; l'espace organisateur reçoit le
-- même choix que l'admin dans la même PR.
--
-- Colonne générée (STORED) : Postgres la calcule à chaque écriture, aucun code ne l'écrit (une valeur
-- fournie est refusée ; tous les inserts et updates de events listent leurs colonnes, vérifié le
-- 2026-10-20 dans l'admin, l'app et les fonctions SQL). L'ajout réécrit la table une fois, sans
-- déclencher ses triggers (pas de job Notion, updated_at inchangé). app_events() et
-- app_events_in_range() rendent `setof events` : la colonne y est sans les modifier.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS price_kind text GENERATED ALWAYS AS (
    CASE
      WHEN is_pay_what_you_want THEN 'pay_what_you_want'
      WHEN coalesce(
        least(
          CASE WHEN price_min >= 0 THEN price_min END,
          CASE WHEN price_max >= 0 THEN price_max END
        ),
        CASE WHEN price >= 0 THEN price END
      ) IS NULL THEN 'unknown'
      WHEN coalesce(
        greatest(
          CASE WHEN price_min >= 0 THEN price_min END,
          CASE WHEN price_max >= 0 THEN price_max END
        ),
        CASE WHEN price >= 0 THEN price END
      ) <= 0 THEN 'free'
      ELSE 'paid'
    END
  ) STORED;

COMMENT ON COLUMN public.events.price_kind IS
  'Genre de prix, calculé par la base : pay_what_you_want (prix libre), unknown (aucun prix connu : ne rien afficher), free (tous les prix connus à 0 : « Gratuit »), paid (montants dans price_min / price_max, à défaut price). Règle : migration 20261020100000.';

-- Vérification (SQL Editor) :
-- select price_kind, count(*) from public.app_events() group by 1 order by 1;

-- Rollback :
-- ALTER TABLE public.events DROP COLUMN IF EXISTS price_kind;
