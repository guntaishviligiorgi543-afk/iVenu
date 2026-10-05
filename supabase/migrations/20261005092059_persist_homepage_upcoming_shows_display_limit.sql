-- Align the count-only Admin UI with a persisted Upcoming Shows limit.
-- Preserve the current four-show default, modes, selections and eligibility.
alter table public.homepage_upcoming_shows_configs
  add column display_limit integer not null default 4
  check (display_limit >= 1);

-- The legacy signature has no remaining callers or database dependents.
-- Replace it rather than leaving an ambiguous/obsolete write overload.
drop function public.admin_save_homepage_upcoming_shows_config(text, uuid[]);

create function public.admin_save_homepage_upcoming_shows_config(p_display_limit integer)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1 from public.admin_users admin where admin.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  if p_display_limit is null or p_display_limit < 1 then
    raise exception 'Upcoming Shows count must be a positive integer.' using errcode = '22023';
  end if;

  insert into public.homepage_upcoming_shows_configs (id, display_limit, updated_at)
  values (true, p_display_limit, now())
  on conflict (id) do update
    set display_limit = excluded.display_limit, updated_at = excluded.updated_at;
end;
$function$;

create or replace function public.get_admin_homepage_upcoming_shows_config()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1 from public.admin_users admin where admin.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;

  return jsonb_build_object(
    'mode', coalesce((select mode from public.homepage_upcoming_shows_configs where id), 'latest_added'),
    'display_limit', coalesce((select display_limit from public.homepage_upcoming_shows_configs where id), 4),
    'event_ids', coalesce((
      select jsonb_agg(event_id order by display_order)
      from public.homepage_upcoming_shows_custom_events
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.get_homepage_upcoming_shows()
 RETURNS TABLE(id uuid, performer text, title text, description text, event_date date, event_time time without time zone, venue text, city text, country text, image_url text, category text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with settings as (
    select coalesce((select mode from public.homepage_upcoming_shows_configs where id), 'latest_added') as mode,
      coalesce((select display_limit from public.homepage_upcoming_shows_configs where id), 4) as display_limit
  ), expired as (
    select public.expire_event_seat_reservations() as released
  ), eligible as (
    select event.id, event.performer, event.title, event.description,
      event.event_date, event.event_time,
      coalesce(venue_row.name, event.venue) as venue,
      coalesce(venue_row.city_area, event.city) as city,
      coalesce(venue_row.country, event.country) as country,
      event.image_url, category_row.name as category
    from public.events event
    left join public.venues venue_row on venue_row.id = event.venue_id
    left join public.categories category_row on category_row.id = event.category_id
    cross join expired
    where event.status = 'active'
      and public.event_has_purchasable_inventory(event.id)
      and make_timestamptz(
        extract(year from event.event_date)::integer,
        extract(month from event.event_date)::integer,
        extract(day from event.event_date)::integer,
        extract(hour from event.event_time)::integer,
        extract(minute from event.event_time)::integer,
        extract(second from event.event_time)::double precision,
        'Asia/Tbilisi'
      ) > now()
  ), automatic as (
    select eligible.*, row_number() over (order by event_date, event_time, id)::smallint as display_position
    from eligible
    cross join settings
    where settings.mode <> 'custom_selection'
  ), custom as (
    select eligible.*, custom_event.display_order::smallint as display_position
    from public.homepage_upcoming_shows_custom_events custom_event
    join eligible on eligible.id = custom_event.event_id
    cross join settings
    where settings.mode = 'custom_selection'
  )
  select id, performer, title, description, event_date, event_time, venue, city,
    country, image_url, category
  from (
    select * from automatic
    union all
    select * from custom
  ) selected
  where display_position <= (select display_limit from settings)
  order by display_position, id;
$function$;

-- RLS and public SELECT remain intact; all writes go through the Admin check.
revoke insert, update, delete, truncate, references, trigger
  on public.homepage_upcoming_shows_configs from public, anon, authenticated;
revoke all on function public.admin_save_homepage_upcoming_shows_config(integer)
  from public, anon;
grant execute on function public.admin_save_homepage_upcoming_shows_config(integer)
  to authenticated;
revoke all on function public.get_admin_homepage_upcoming_shows_config() from public, anon;
grant execute on function public.get_admin_homepage_upcoming_shows_config() to authenticated;
revoke all on function public.get_homepage_upcoming_shows() from public;
grant execute on function public.get_homepage_upcoming_shows() to anon, authenticated;

notify pgrst, 'reload schema';
