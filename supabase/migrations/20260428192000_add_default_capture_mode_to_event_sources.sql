alter table public.event_sources
add column if not exists default_capture_mode text;

update public.event_sources
set default_capture_mode = 'manual'
where default_capture_mode is null;

alter table public.event_sources
drop constraint if exists event_sources_default_capture_mode_check;

alter table public.event_sources
add constraint event_sources_default_capture_mode_check
check (default_capture_mode in ('manual', 'url', 'image', 'facebook'));

alter table public.event_sources
alter column default_capture_mode set default 'manual';

alter table public.event_sources
alter column default_capture_mode set not null;
