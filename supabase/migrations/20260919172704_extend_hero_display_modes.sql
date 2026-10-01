-- Preserve the existing Hero singleton and its three ordered UUID slots while
-- extending its former automatic/manual modes to the shared homepage modes.
alter table public.homepage_hero_configs
  drop constraint homepage_hero_configs_mode_check;
update public.homepage_hero_configs
set mode = case mode
  when 'automatic' then 'latest_added'
  when 'manual' then 'custom_selection'
  else mode
end;
alter table public.homepage_hero_configs
  add constraint homepage_hero_configs_mode_check
  check (mode in ('latest_added', 'most_added_to_cart', 'best_selling', 'custom_selection'));
alter table public.homepage_hero_configs
  alter column mode set default 'latest_added';

-- One ranking source for every automatic homepage section.
create or replace function public.get_ranked_homepage_events(p_mode text, p_limit integer)
returns table (
  id uuid, performer text, title text, description text, event_date date,
  event_time time without time zone, venue text, city text, country text,
  image_url text, category text, display_position integer
)
language sql
security definer
set search_path = ''
as $$
  with eligible as (
    select event.id, event.performer, event.title, event.description, event.event_date,
      event.event_time, coalesce(venue_row.name, event.venue) as venue,
      coalesce(venue_row.city_area, event.city) as city,
      coalesce(venue_row.country, event.country) as country, event.image_url,
      category_row.name as category, event.created_at
    from public.events event
    left join public.venues venue_row on venue_row.id = event.venue_id
    left join public.categories category_row on category_row.id = event.category_id
    where event.status = 'active' and event.event_date >= current_date
  ), cart_ranked as (
    select event.id, coalesce(sum(cart_addition.quantity), 0)::bigint as cart_units
    from eligible event
    left join public.cart_additions cart_addition on cart_addition.event_id = event.id
    group by event.id
  ), sales_ranked as (
    select event.id, coalesce(sum(order_item.quantity) filter (where purchase.status = 'paid'), 0)::bigint as sold_units
    from eligible event
    left join public.ticket_types ticket_type on ticket_type.event_id = event.id
    left join public.order_items order_item on order_item.ticket_type_id = ticket_type.id
    left join public.orders purchase on purchase.id = order_item.order_id
    group by event.id
  ), ranked as (
    select event.*,
      row_number() over (
        order by
          case when p_mode = 'latest_added' then event.created_at end desc,
          case when p_mode = 'most_added_to_cart' then cart_ranked.cart_units end desc,
          case when p_mode = 'best_selling' then sales_ranked.sold_units end desc,
          event.created_at desc, event.id desc
      )::integer as display_position
    from eligible event
    join cart_ranked on cart_ranked.id = event.id
    join sales_ranked on sales_ranked.id = event.id
    where p_mode in ('latest_added', 'most_added_to_cart', 'best_selling')
  )
  select id, performer, title, description, event_date, event_time, venue, city, country, image_url, category, display_position
  from ranked
  where display_position <= greatest(p_limit, 0)
  order by display_position, id;
$$;

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
    select coalesce((select mode from public.homepage_hero_configs where id), 'latest_added') as mode
  ), automatic as (
    select ranked.id, ranked.performer, ranked.title, ranked.event_date, ranked.event_time,
      ranked.venue, ranked.city, ranked.country, ranked.image_url, ranked.display_position::smallint as slot
    from public.get_ranked_homepage_events((select mode from config), 3) ranked
    where (select mode from config) <> 'custom_selection'
  ), custom as (
    select event.id, event.performer, event.title, event.event_date, event.event_time,
      coalesce(venue_row.name, event.venue) as venue,
      coalesce(venue_row.city_area, event.city) as city,
      coalesce(venue_row.country, event.country) as country, event.image_url, hero_slot.slot
    from public.homepage_hero_slots hero_slot
    join public.events event on event.id = hero_slot.event_id
    left join public.venues venue_row on venue_row.id = event.venue_id
    cross join config
    where config.mode = 'custom_selection'
      and event.status = 'active'
      and event.event_date >= current_date
  )
  select * from automatic
  union all
  select * from custom
  order by slot, id;
$$;

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
    select coalesce((select mode from public.homepage_upcoming_shows_configs where id), 'latest_added') as mode
  ), automatic as (
    select ranked.id, ranked.performer, ranked.title, ranked.description, ranked.event_date,
      ranked.event_time, ranked.venue, ranked.city, ranked.country, ranked.image_url, ranked.category, ranked.display_position
    from public.get_ranked_homepage_events((select mode from settings), 4) ranked
    where (select mode from settings) <> 'custom_selection'
  ), custom as (
    select event.id, event.performer, event.title, event.description, event.event_date,
      event.event_time, coalesce(venue_row.name, event.venue) as venue,
      coalesce(venue_row.city_area, event.city) as city,
      coalesce(venue_row.country, event.country) as country, event.image_url,
      category_row.name as category, custom_event.display_order as display_position
    from public.homepage_upcoming_shows_custom_events custom_event
    join public.events event on event.id = custom_event.event_id
    left join public.venues venue_row on venue_row.id = event.venue_id
    left join public.categories category_row on category_row.id = event.category_id
    cross join settings
    where settings.mode = 'custom_selection'
      and event.status = 'active'
      and event.event_date >= current_date
  )
  select id, performer, title, description, event_date, event_time, venue, city, country, image_url, category
  from (
    select * from automatic
    union all
    select * from custom
  ) selected
  order by display_position, id;
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
    'display_limit', 3,
    'event_ids', coalesce((select jsonb_agg(event_id order by slot) from public.homepage_hero_slots), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_save_homepage_hero_config(p_mode text, p_event_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_event_id uuid;
begin
  if not exists (select 1 from public.admin_users admin where admin.user_id = (select auth.uid())) then
    raise exception 'Administrator access is required.';
  end if;
  if p_mode not in ('latest_added', 'most_added_to_cart', 'best_selling', 'custom_selection') then
    raise exception 'Choose a valid Hero display mode.';
  end if;
  if coalesce(cardinality(p_event_ids), 0) > 3 then
    raise exception 'Hero can display at most three events.';
  end if;
  if (select count(distinct event_id) from unnest(coalesce(p_event_ids, '{}'::uuid[])) event_id)
     <> coalesce(cardinality(p_event_ids), 0) then
    raise exception 'An event can only appear once in Hero.';
  end if;
  if p_mode = 'custom_selection' then
    foreach v_event_id in array coalesce(p_event_ids, '{}'::uuid[]) loop
      if not exists (
        select 1 from public.events event
        where event.id = v_event_id and event.status = 'active' and event.event_date >= current_date
      ) then
        raise exception 'Custom Hero events must be active and upcoming.';
      end if;
    end loop;
  end if;
  insert into public.homepage_hero_configs (id, mode, updated_at)
  values (true, p_mode, now())
  on conflict (id) do update set mode = excluded.mode, updated_at = excluded.updated_at;
  -- Automatic modes retain the last custom choices for later reuse.
  if p_mode = 'custom_selection' then
    delete from public.homepage_hero_slots where slot between 1 and 3;
    insert into public.homepage_hero_slots (slot, event_id)
    select ordinality::smallint, event_id
    from unnest(coalesce(p_event_ids, '{}'::uuid[])) with ordinality as selection(event_id, ordinality);
  end if;
end;
$$;

revoke all on function public.get_ranked_homepage_events(text, integer) from public, anon, authenticated;
revoke all on function public.get_homepage_hero_events() from public;
revoke all on function public.get_homepage_upcoming_shows() from public;
revoke all on function public.get_admin_homepage_hero_config() from public, anon;
revoke all on function public.admin_save_homepage_hero_config(text, uuid[]) from public, anon;
grant execute on function public.get_homepage_hero_events() to anon, authenticated;
grant execute on function public.get_homepage_upcoming_shows() to anon, authenticated;
grant execute on function public.get_admin_homepage_hero_config() to authenticated;
grant execute on function public.admin_save_homepage_hero_config(text, uuid[]) to authenticated;
