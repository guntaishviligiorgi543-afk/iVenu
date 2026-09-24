-- Retire mode-based Homepage Upcoming Shows selection while preserving existing
-- configuration and custom-selection rows as harmless historical data.
alter table public.homepage_upcoming_shows_configs
  add column if not exists display_limit integer not null default 5;

alter table public.homepage_upcoming_shows_configs
  drop constraint if exists homepage_upcoming_shows_configs_display_limit_check;

alter table public.homepage_upcoming_shows_configs
  add constraint homepage_upcoming_shows_configs_display_limit_check
  check (display_limit > 0);

update public.homepage_upcoming_shows_configs
set display_limit = 5
where display_limit is null or display_limit < 1;

create or replace function public.get_homepage_upcoming_shows()
returns table (
  id uuid, performer text, title text, description text, event_date date,
  event_time time without time zone, venue text, city text, country text,
  image_url text, category text
)
language sql
security definer
set search_path = ''
as $$
  with settings as (
    select coalesce(
      (select display_limit from public.homepage_upcoming_shows_configs where id),
      5
    ) as display_limit
  )
  select
    event.id,
    event.performer,
    event.title,
    event.description,
    event.event_date,
    event.event_time,
    coalesce(venue_row.name, event.venue) as venue,
    coalesce(venue_row.city_area, event.city) as city,
    coalesce(venue_row.country, event.country) as country,
    event.image_url,
    category_row.name as category
  from public.events event
  left join public.venues venue_row on venue_row.id = event.venue_id
  left join public.categories category_row on category_row.id = event.category_id
  cross join settings
  where event.status = 'active'
    and (
      event.event_date > current_date
      or (
        event.event_date = current_date
        and coalesce(event.event_time, time '23:59:59') >= localtime
      )
    )
  order by event.event_date asc, event.event_time asc nulls last, event.id asc
  limit (select display_limit from settings);
$$;

create or replace function public.get_admin_homepage_upcoming_shows_config()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.admin_users admin
    where admin.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;

  return jsonb_build_object(
    'display_limit', coalesce(
      (select display_limit from public.homepage_upcoming_shows_configs where id),
      5
    )
  );
end;
$$;

drop function if exists public.admin_save_homepage_upcoming_shows_config(text, uuid[]);

create function public.admin_save_homepage_upcoming_shows_config(
  p_display_limit integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_available_count integer;
begin
  if not exists (
    select 1
    from public.admin_users admin
    where admin.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;

  if p_display_limit is null or p_display_limit < 1 then
    raise exception 'Upcoming Shows count must be a positive integer.';
  end if;

  select count(*)::integer into v_available_count
  from public.events event
  where event.status = 'active'
    and (
      event.event_date > current_date
      or (
        event.event_date = current_date
        and coalesce(event.event_time, time '23:59:59') >= localtime
      )
    );

  if p_display_limit > v_available_count then
    raise exception 'Upcoming Shows count cannot exceed the available active upcoming events.';
  end if;

  insert into public.homepage_upcoming_shows_configs (
    id,
    display_limit,
    updated_at
  )
  values (true, p_display_limit, now())
  on conflict (id) do update set
    display_limit = excluded.display_limit,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.get_homepage_upcoming_shows() from public;
revoke all on function public.get_admin_homepage_upcoming_shows_config() from public, anon;
revoke all on function public.admin_save_homepage_upcoming_shows_config(integer) from public, anon;
grant execute on function public.get_homepage_upcoming_shows() to anon, authenticated;
grant execute on function public.get_admin_homepage_upcoming_shows_config() to authenticated;
grant execute on function public.admin_save_homepage_upcoming_shows_config(integer) to authenticated;
