alter table public.notification_logs
add column if not exists flow_type text,
add column if not exists delivery_date date,
add column if not exists delivery_key text;

create unique index if not exists notification_logs_delivery_key_unique_idx
on public.notification_logs (delivery_key)
where delivery_key is not null;

create index if not exists notification_logs_flow_type_delivery_date_idx
on public.notification_logs (flow_type, delivery_date desc);
