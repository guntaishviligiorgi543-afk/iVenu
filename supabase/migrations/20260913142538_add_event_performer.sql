alter table public.events
  add column if not exists performer text;

update public.events e
set performer = coalesce(nullif(trim(b.name), ''), e.title)
from public.bands b
where e.band_id = b.id
  and nullif(trim(e.performer), '') is null;

update public.events
set performer = title
where nullif(trim(performer), '') is null;

alter table public.events
  alter column performer set not null;;
