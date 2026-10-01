-- Persist the existing Hero event-count control in the Homepage Hero singleton.
alter table public.homepage_hero_configs
  add column if not exists display_limit integer not null default 3;

alter table public.homepage_hero_configs
  drop constraint if exists homepage_hero_configs_display_limit_check;

alter table public.homepage_hero_configs
  add constraint homepage_hero_configs_display_limit_check
  check (display_limit between 1 and 20);

alter table public.homepage_hero_slots
  drop constraint if exists homepage_hero_slots_slot_check;

alter table public.homepage_hero_slots
  add constraint homepage_hero_slots_slot_check
  check (slot between 1 and 20);

create or replace function public.get_homepage_hero_events()
returns table (
  id uuid, performer text, title text, event_date date, event_time time without time zone,
  venue text, city text, country text, image_url text, slot smallint
)
language sql
security definer
set search_path = ''
as $$
  with config as (
    select
      coalesce((select mode from public.homepage_hero_configs where id), 'latest_added') as mode,
      coalesce((select display_limit from public.homepage_hero_configs where id), 3) as display_limit
  ), automatic as (
    select ranked.id, ranked.performer, ranked.title, ranked.event_date, ranked.event_time,
      ranked.venue, ranked.city, ranked.country, ranked.image_url,
      ranked.display_position::smallint as slot
    from public.get_ranked_homepage_events(
      (select mode from config),
      (select display_limit from config)
    ) ranked
    where (select mode from config) <> 'custom_selection'
  ), custom as (
    select event.id, event.performer, event.title, event.event_date, event.event_time,
      coalesce(venue_row.name, event.venue) as venue,
      coalesce(venue_row.city_area, event.city) as city,
      coalesce(venue_row.country, event.country) as country,
      event.image_url, hero_slot.slot
    from public.homepage_hero_slots hero_slot
    join public.events event on event.id = hero_slot.event_id
    left join public.venues venue_row on venue_row.id = event.venue_id
    cross join config
    where config.mode = 'custom_selection'
      and hero_slot.slot <= config.display_limit
      and event.status = 'active'
      and event.event_date >= current_date
  )
  select * from automatic
  union all
  select * from custom
  order by slot, id;
$$;

create or replace function public.get_admin_homepage_hero_config()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admin_users admin where admin.user_id = (select auth.uid())) then
    raise exception 'Administrator access is required.';
  end if;
  return jsonb_build_object(
    'mode', coalesce((select mode from public.homepage_hero_configs where id), 'latest_added'),
    'display_limit', coalesce((select display_limit from public.homepage_hero_configs where id), 3),
    'event_ids', coalesce((select jsonb_agg(event_id order by slot) from public.homepage_hero_slots), '[]'::jsonb)
  );
end;
$$;

drop function if exists public.admin_save_homepage_hero_config(text, uuid[]);

create or replace function public.admin_save_homepage_hero_config(
  p_mode text,
  p_display_limit integer,
  p_event_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_available_count integer;
begin
  if not exists (select 1 from public.admin_users admin where admin.user_id = (select auth.uid())) then
    raise exception 'Administrator access is required.';
  end if;
  if p_mode not in ('latest_added', 'most_added_to_cart', 'best_selling', 'custom_selection') then
    raise exception 'Choose a valid Hero display mode.';
  end if;
  if p_display_limit is null or p_display_limit < 1 or p_display_limit > 20 then
    raise exception 'Hero event count must be between 1 and 20.';
  end if;
  select count(*)::integer into v_available_count
  from public.events event
  where event.status = 'active' and event.event_date >= current_date;
  if p_display_limit > v_available_count then
    raise exception 'Hero event count cannot exceed the available active upcoming events.';
  end if;
  if coalesce(cardinality(p_event_ids), 0) > p_display_limit then
    raise exception 'Custom Hero selections cannot exceed the Hero event count.';
  end if;
  if (select count(distinct event_id) from unnest(coalesce(p_event_ids, '{}'::uuid[])) event_id)
     <> coalesce(cardinality(p_event_ids), 0) then
    raise exception 'An event can only appear once in Hero.';
  end if;
  foreach v_event_id in array coalesce(p_event_ids, '{}'::uuid[]) loop
    if not exists (
      select 1 from public.events event
      where event.id = v_event_id and event.status = 'active' and event.event_date >= current_date
    ) then
      raise exception 'Custom Hero events must be active and upcoming.';
    end if;
  end loop;
  insert into public.homepage_hero_configs (id, mode, display_limit, updated_at)
  values (true, p_mode, p_display_limit, now())
  on conflict (id) do update set
    mode = excluded.mode,
    display_limit = excluded.display_limit,
    updated_at = excluded.updated_at;
  if p_mode = 'custom_selection' then
    delete from public.homepage_hero_slots where slot between 1 and 20;
    insert into public.homepage_hero_slots (slot, event_id)
    select ordinality::smallint, event_id
    from unnest(coalesce(p_event_ids, '{}'::uuid[])) with ordinality as selection(event_id, ordinality);
  end if;
end;
$$;

revoke all on function public.get_homepage_hero_events() from public;
revoke all on function public.get_admin_homepage_hero_config() from public, anon;
revoke all on function public.admin_save_homepage_hero_config(text, integer, uuid[]) from public, anon;
grant execute on function public.get_homepage_hero_events() to anon, authenticated;
grant execute on function public.get_admin_homepage_hero_config() to authenticated;
grant execute on function public.admin_save_homepage_hero_config(text, integer, uuid[]) to authenticated;
