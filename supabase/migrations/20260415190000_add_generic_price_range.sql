alter table public.events
add column if not exists price_min numeric(10,2),
add column if not exists price_max numeric(10,2);

comment on column public.events.price_min is 'Prix minimum générique de l''événement (optionnel).';
comment on column public.events.price_max is 'Prix maximum générique de l''événement (optionnel).';

update public.events
set
  price_min = derived.price_min,
  price_max = derived.price_max
from (
  select
    id,
    min(price_value) as price_min,
    case
      when max(price_value) > min(price_value) then max(price_value)
      else null
    end as price_max
  from (
    select id, price as price_value
    from public.events
    where price is not null and price >= 0

    union all

    select id, presale_price as price_value
    from public.events
    where presale_price is not null and presale_price >= 0

    union all

    select id, subscriber_price as price_value
    from public.events
    where subscriber_price is not null and subscriber_price >= 0
  ) price_candidates
  group by id
) as derived
where public.events.id = derived.id;

update public.events
set price = price_min
where price_min is not null
  and price is distinct from price_min;

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
    status
  ) values (
    event_json->>'title',
    event_json->>'description',
    (event_json->>'date')::timestamptz,
    nullif(event_json->>'end_date', 'null')::timestamptz,
    nullif(event_json->>'location_id', 'null')::uuid,
    nullif(event_json->>'image_url', 'null'),
    event_json->>'category',
    coalesce(
      nullif(event_json->>'price_min', 'null')::numeric,
      nullif(event_json->>'price', 'null')::numeric
    ),
    coalesce(
      nullif(event_json->>'price_min', 'null')::numeric,
      nullif(event_json->>'price', 'null')::numeric
    ),
    nullif(event_json->>'price_max', 'null')::numeric,
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
    'pending'
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

comment on function public.convert_event_request_to_event(uuid) is 'Convertit une demande event_creation (user_requests) en événement status=pending et marque la demande comme converted. Admin uniquement.';
