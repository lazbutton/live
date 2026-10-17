alter table public.events
add column if not exists is_pay_what_you_want boolean not null default false;

comment on column public.events.is_pay_what_you_want is 'Indique qu’un événement est en prix libre et que les montants fixes doivent être ignorés à l’affichage.';

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
    status
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
