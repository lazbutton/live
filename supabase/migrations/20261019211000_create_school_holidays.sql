-- Vacances scolaires de la zone B (académie d'Orléans-Tours), pour le calendrier « Quand ? » de l'app.
--
-- Refonte de l'app (../live/docs/MAQUETTES_REFONTE.md, « Calendrier ») : une bande sous les jours
-- de vacances, avec une légende, et un raccourci « Vacances de la Toussaint » pendant les vacances
-- ou juste avant. Les périodes viennent du calendrier scolaire officiel (data.education.gouv.fr, jeu
-- `fr-en-calendrier-scolaire`), jamais en dur : la route GET /api/cron/school-holidays les recharge
-- chaque semaine (vercel.json) avec la clé service role. L'app lit la table (lecture publique).
-- Mode d'emploi et contrat : docs/API_APP.md.
--
-- Une ligne par période, pour les élèves : premier et dernier jour sans classe, bornes comprises.
-- Le jeu officiel donne le jour de fin des cours (start_date) et le jour de la reprise (end_date) :
-- Toussaint 2026, du samedi 17 octobre au lundi 2 novembre, soit les jours du 17 octobre au
-- 1er novembre (first_day, last_day). Une période d'un seul jour (pont de l'Ascension 2027, vendredi
-- 7 mai) a la même date aux deux bornes. Les lignes « Enseignants » et « Début des Vacances d'Été »
-- (fin pas encore connue) ne sont pas chargées. Conversion : lib/school-holidays/official-calendar.ts.

CREATE TABLE IF NOT EXISTS public.school_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy text NOT NULL,
  zone text NOT NULL,
  school_year text NOT NULL,
  name text NOT NULL,
  first_day date NOT NULL,
  last_day date NOT NULL,
  source_start_date timestamptz NOT NULL,
  source_end_date timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_holidays_days_check CHECK (last_day >= first_day),
  CONSTRAINT school_holidays_period_key UNIQUE (academy, school_year, name)
);

COMMENT ON TABLE public.school_holidays IS
  'Vacances scolaires (élèves) de l''académie d''Orléans-Tours, zone B, lues dans le calendrier scolaire officiel (data.education.gouv.fr, fr-en-calendrier-scolaire) par /api/cron/school-holidays. Lecture publique (app).';
COMMENT ON COLUMN public.school_holidays.academy IS 'Académie du jeu officiel (location), « Orléans-Tours ».';
COMMENT ON COLUMN public.school_holidays.zone IS 'Zone du jeu officiel, « Zone B ».';
COMMENT ON COLUMN public.school_holidays.school_year IS 'Année scolaire, « 2026-2027 ».';
COMMENT ON COLUMN public.school_holidays.name IS 'Nom de la période (description du jeu officiel), « Vacances de la Toussaint ».';
COMMENT ON COLUMN public.school_holidays.first_day IS 'Premier jour de vacances (jour de fin des cours, souvent un samedi), heure de Paris.';
COMMENT ON COLUMN public.school_holidays.last_day IS 'Dernier jour de vacances, compris (veille de la reprise), heure de Paris.';
COMMENT ON COLUMN public.school_holidays.source_start_date IS 'start_date du jeu officiel, telle quelle (fin des cours).';
COMMENT ON COLUMN public.school_holidays.source_end_date IS 'end_date du jeu officiel, telle quelle (reprise des cours, ou le jour même pour une période d''un jour).';

CREATE INDEX IF NOT EXISTS idx_school_holidays_last_day ON public.school_holidays USING btree (last_day);

DROP TRIGGER IF EXISTS update_school_holidays_updated_at ON public.school_holidays;
CREATE TRIGGER update_school_holidays_updated_at
  BEFORE UPDATE ON public.school_holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lecture pour tous (l'app, avec ou sans session) ; écriture par la clé service role seulement
-- (qui passe outre la RLS).
ALTER TABLE public.school_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School holidays are viewable by everyone" ON public.school_holidays;
CREATE POLICY "School holidays are viewable by everyone"
  ON public.school_holidays
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON public.school_holidays FROM anon, authenticated;
GRANT SELECT ON public.school_holidays TO anon, authenticated;
GRANT ALL ON public.school_holidays TO service_role;

-- Vérification (SQL Editor), après le premier chargement : la Toussaint 2026 va du 17 octobre au
-- 1er novembre.
-- select school_year, name, first_day, last_day from public.school_holidays order by first_day;

-- Rollback :
-- DROP TABLE IF EXISTS public.school_holidays;
