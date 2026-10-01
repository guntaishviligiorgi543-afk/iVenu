-- Homepage hero configuration stores only ordered canonical event IDs.
create table if not exists public.homepage_hero_configs (
  id boolean primary key default true check (id),
  mode text not null default 'automatic' check (mode in ('automatic', 'manual')),
  updated_at timestamptz not null default now()
);

create table if not exists public.homepage_hero_slots (
  slot smallint primary key check (slot between 1 and 3),
  event_id uuid not null unique references public.events(id) on delete cascade
);

alter table public.homepage_hero_configs enable row level security;
alter table public.homepage_hero_slots enable row level security;

create policy "Public read homepage hero config" on public.homepage_hero_configs for select using (true);
create policy "Public read homepage hero slots" on public.homepage_hero_slots for select using (true);

create or replace function public.get_homepage_hero_events()
returns table (
  id uuid, performer text, title text, event_date date, event_time time,
  venue text, city text, country text, image_url text, slot smallint
)
language sql
security definer
set search_path = ''
as $$
  with config as (
    select coalesce((select mode from public.homepage_hero_configs where id), 'automatic') as mode
  ), eligible as (
    select event.id, event.performer, event.title, event.event_date, event.event_time,
      coalesce(venue_row.name, event.venue) as venue,
      coalesce(venue_row.city_area, event.city) as city,
      coalesce(venue_row.country, event.country) as country,
      event.image_url, event.created_at
    from public.events event
    left join public.venues venue_row on venue_row.id = event.venue_id
    where event.status = 'active'
  ), manual as (
    select event.*, hero_slot.slot
    from public.homepage_hero_slots hero_slot
    join eligible event on event.id = hero_slot.event_id
    cross join config
    where config.mode = 'manual'
  ), manual_fallback as (
    select event.*, row_number() over (order by event.created_at desc, event.id desc) as fallback_position
    from eligible event
    cross join config
    where config.mode = 'manual'
      and not exists (select 1 from manual where manual.id = event.id)
  ), selected as (
    select id, performer, title, event_date, event_time, venue, city, country, image_url, slot, created_at from manual
    union all
    select event.id, event.performer, event.title, event.event_date, event.event_time,
      event.venue, event.city, event.country, event.image_url, missing.slot, event.created_at
    from manual_fallback event
    join lateral (
      select slot::smallint as slot, row_number() over (order by slot) as fallback_position
      from generate_series(1, 3) as generated_slot(slot)
      where not exists (select 1 from manual where manual.slot = generated_slot.slot)
    ) missing on missing.fallback_position = event.fallback_position
    union all
    select event.id, event.performer, event.title, event.event_date, event.event_time,
      event.venue, event.city, event.country, event.image_url,
      row_number() over (order by event.created_at desc, event.id desc)::smallint, event.created_at
    from eligible event
    cross join config
    where config.mode = 'automatic'
    order by created_at desc, id desc
    limit 3
  )
  select id, performer, title, event_date, event_time, venue, city, country, image_url, slot
  from selected
  order by slot, id;
$$;

create or replace function public.get_admin_homepage_hero_config()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admin_users admin where admin.user_id = (select auth.uid())) then
    raise exception 'Administrator access is required.';
  end if;
  return jsonb_build_object(
    'mode', coalesce((select mode from public.homepage_hero_configs where id), 'automatic'),
    'slots', coalesce((select jsonb_object_agg(slot, event_id) from public.homepage_hero_slots), '{}'::jsonb)
  );
end;
$$;

create or replace function public.admin_save_homepage_hero_config(p_mode text, p_event_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_event_id uuid;
begin
  if not exists (select 1 from public.admin_users admin where admin.user_id = (select auth.uid())) then
    raise exception 'Administrator access is required.';
  end if;
  if p_mode not in ('automatic', 'manual') then raise exception 'Choose automatic or manual Hero selection.'; end if;
  if coalesce(cardinality(p_event_ids), 0) > 3 then raise exception 'Choose at most three Hero events.'; end if;
  if (select count(distinct event_id) from unnest(coalesce(p_event_ids, '{}'::uuid[])) event_id where event_id is not null)
     <> (select count(*) from unnest(coalesce(p_event_ids, '{}'::uuid[])) event_id where event_id is not null) then
    raise exception 'An event can only occupy one Hero slot.';
  end if;
  foreach v_event_id in array p_event_ids loop
    if v_event_id is not null and not exists (select 1 from public.events event where event.id = v_event_id and event.status = 'active') then
      raise exception 'Hero events must be active.';
    end if;
  end loop;
  insert into public.homepage_hero_configs (id, mode, updated_at) values (true, p_mode, now())
  on conflict (id) do update set mode = excluded.mode, updated_at = excluded.updated_at;
  if p_mode = 'manual' then
    delete from public.homepage_hero_slots;
    insert into public.homepage_hero_slots (slot, event_id)
    select ordinality::smallint, event_id
    from unnest(coalesce(p_event_ids, '{}'::uuid[])) with ordinality as selection(event_id, ordinality)
    where event_id is not null;
  end if;
end;
$$;

revoke all on function public.get_homepage_hero_events() from public;
revoke all on function public.get_admin_homepage_hero_config() from public, anon;
revoke all on function public.admin_save_homepage_hero_config(text, uuid[]) from public, anon;
grant execute on function public.get_homepage_hero_events() to anon, authenticated;
grant execute on function public.get_admin_homepage_hero_config() to authenticated;
grant execute on function public.admin_save_homepage_hero_config(text, uuid[]) to authenticated;
