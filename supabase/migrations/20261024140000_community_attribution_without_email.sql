-- ============================================
-- Migration : l'attribution publique d'une proposition, jamais une adresse e-mail
-- Date : 2026-10-24
-- Description : une proposition de l'app (user_requests) part avec le nom public de son auteur
--   (contributor_display_name) et son accord (community_attribution_opt_in, décoché par défaut). À la
--   validation, convert_event_request_to_event recopie ce nom dans events.community_contributor_label, que
--   la fiche de l'app affiche (« Proposé par … ») et que l'API v1 rend (communityContributorLabel).
--
--   Deux défauts, corrigés ici :
--     • L'app envoyait l'adresse e-mail d'un compte sans nom (connexion Apple native, code par e-mail)
--       comme nom public : avec l'accord, elle serait devenue publique à la validation. L'app n'envoie
--       plus que le nom du compte (sinon rien), mais les versions déjà installées continuent : la règle
--       vit donc ici.
--     • La recopie avait disparu : 20260415190000 et 20260415213000 (prix, venues de l'app) ont réécrit la
--       fonction d'après une version antérieure à 20260411160000, sans community_submission,
--       community_attribution_opt_in ni community_contributor_label. Depuis, un événement converti ne dit
--       plus qu'il vient de la communauté (ni « Proposé par », ni « Suggestion communautaire »).
--
--   Ce qui change :
--     1. public_contributor_label(text) : le nom public d'un contributeur, sans les espaces autour ; NULL
--        s'il est vide ou s'il contient « @ » (une adresse e-mail ne devient jamais un nom public).
--     2. convert_event_request_to_event : la version de 20260415213000 (prix libre), plus l'origine
--        communautaire, l'accord, et le nom public seulement avec l'accord.
--     3. events : un nom public qui contiendrait « @ » effacé, puis une contrainte qui le refuse, quel que
--        soit le chemin d'écriture (events_community_contributor_label_not_email).
--
--   user_requests.contributor_display_name n'est pas touché : la colonne est privée (l'auteur et les
--   admins) ; le back-office y lit le nom de l'auteur, et son e-mail par get_user_emails.
--   Rejouable (CREATE OR REPLACE, DROP CONSTRAINT IF EXISTS).

-- ============================================
-- CODE SQL
-- ============================================

-- 1. Le nom public d'un contributeur.
CREATE OR REPLACE FUNCTION public.public_contributor_label(display_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN strpos(display_name, '@') > 0 THEN NULL
    ELSE nullif(btrim(display_name), '')
  END
$$;

COMMENT ON FUNCTION public.public_contributor_label(text) IS
  'Nom public d''un contributeur (« Proposé par … ») : le texte sans les espaces autour ; NULL s''il est vide ou contient « @ » (jamais une adresse e-mail).';

-- 2. La conversion d'une demande en événement : 20260415213000, plus l'attribution (avec l'accord, le nom
--    public ; sans, rien).
create or replace function public.convert_event_request_to_event(request_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  new_event_id uuid;
  request_data record;
  current_user_id uuid;
  event_json jsonb;
  attribution_opt_in boolean;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Utilisateur non authentifié';
  end if;

  if not is_user_admin() then
    raise exception 'Seuls les administrateurs peuvent convertir des demandes en événements';
  end if;

  select * into request_data
  from user_requests
  where id = request_id
    and request_type = 'event_creation'
    and status = 'pending';

  if not found then
    raise exception 'Demande d''événement non trouvée ou déjà traitée';
  end if;

  if request_data.event_data is null then
    raise exception 'Les données de l''événement sont manquantes';
  end if;

  event_json := request_data.event_data;
  attribution_opt_in := coalesce(request_data.community_attribution_opt_in, false);

  insert into public.events (
    title,
    description,
    date,
    end_date,
    location_id,
    image_url,
    category,
    price,
    price_min,
    price_max,
    is_pay_what_you_want,
    presale_price,
    subscriber_price,
    address,
    capacity,
    door_opening_time,
    external_url,
    external_url_label,
    instagram_url,
    facebook_url,
    scraping_url,
    created_by,
    status,
    community_submission,
    community_attribution_opt_in,
    community_contributor_label
  ) values (
    event_json->>'title',
    event_json->>'description',
    (event_json->>'date')::timestamptz,
    nullif(event_json->>'end_date', 'null')::timestamptz,
    nullif(event_json->>'location_id', 'null')::uuid,
    nullif(event_json->>'image_url', 'null'),
    event_json->>'category',
    case
      when coalesce((event_json->>'is_pay_what_you_want')::boolean, false) then null
      else coalesce(
        nullif(event_json->>'price_min', 'null')::numeric,
        nullif(event_json->>'price', 'null')::numeric
      )
    end,
    case
      when coalesce((event_json->>'is_pay_what_you_want')::boolean, false) then null
      else coalesce(
        nullif(event_json->>'price_min', 'null')::numeric,
        nullif(event_json->>'price', 'null')::numeric
      )
    end,
    case
      when coalesce((event_json->>'is_pay_what_you_want')::boolean, false) then null
      else nullif(event_json->>'price_max', 'null')::numeric
    end,
    coalesce((event_json->>'is_pay_what_you_want')::boolean, false),
    nullif(event_json->>'presale_price', 'null')::numeric,
    nullif(event_json->>'subscriber_price', 'null')::numeric,
    nullif(event_json->>'address', 'null'),
    nullif(event_json->>'capacity', 'null')::integer,
    nullif(event_json->>'door_opening_time', 'null'),
    nullif(event_json->>'external_url', 'null'),
    nullif(event_json->>'external_url_label', 'null'),
    nullif(event_json->>'instagram_url', 'null'),
    nullif(event_json->>'facebook_url', 'null'),
    nullif(event_json->>'scraping_url', 'null'),
    request_data.requested_by,
    'pending',
    true,
    attribution_opt_in,
    case
      when attribution_opt_in then public.public_contributor_label(request_data.contributor_display_name)
    end
  ) returning id into new_event_id;

  if event_json->>'organizer_id' is not null and event_json->>'organizer_id' != 'null' then
    insert into public.event_organizers (event_id, organizer_id)
    values (new_event_id, (event_json->>'organizer_id')::uuid)
    on conflict do nothing;
  end if;

  update public.user_requests
  set
    status = 'converted',
    converted_event_id = new_event_id,
    converted_at = now(),
    reviewed_by = current_user_id,
    reviewed_at = now(),
    notes = coalesce(notes, '') || E'\nConverti en événement ID: ' || new_event_id::text
  where id = request_id;

  return new_event_id;
end;
$$;

comment on function public.convert_event_request_to_event(uuid) is 'Convertit une demande event_creation (user_requests) en événement status=pending, marqué communautaire avec l''accord d''attribution et, s''il est donné, le nom public (public_contributor_label : jamais une adresse e-mail) ; marque la demande comme converted. Admin uniquement.';

-- 3. Jamais d'adresse e-mail comme nom public d'un événement.
UPDATE public.events
SET community_contributor_label = NULL
WHERE strpos(community_contributor_label, '@') > 0;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_community_contributor_label_not_email;
ALTER TABLE public.events
  ADD CONSTRAINT events_community_contributor_label_not_email
  CHECK (strpos(community_contributor_label, '@') = 0);

COMMENT ON COLUMN public.events.community_contributor_label IS
  'Nom public du contributeur si l’attribution communautaire est autorisée ; jamais une adresse e-mail (contrainte events_community_contributor_label_not_email).';

-- ============================================
-- ROLLBACK
-- ============================================
-- ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_community_contributor_label_not_email;
-- Rejouer 20260415213000_add_pay_what_you_want_to_events.sql (la fonction sans attribution), puis :
-- DROP FUNCTION IF EXISTS public.public_contributor_label(text);
