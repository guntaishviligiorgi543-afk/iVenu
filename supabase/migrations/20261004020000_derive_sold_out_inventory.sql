-- SOLD OUT is derived from current purchasable inventory, never stored as an
-- event lifecycle status. Expired holds are released before each public read.
create or replace function public.event_has_purchasable_inventory(p_event_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select
    case
      when exists (select 1 from public.event_seats where event_id = p_event_id)
        then exists (
          select 1
          from public.event_seats es
          join public.ticket_types tt on tt.id = es.ticket_type_id
          where es.event_id = p_event_id
            and tt.is_active
            and es.status = 'available'
        )
      else exists (
        select 1 from public.ticket_types
        where event_id = p_event_id
          and is_active
          and total_quantity > 0
          and available_quantity > 0
      )
    end;
$function$;

create or replace function public.get_public_event_inventory(p_event_id uuid default null)
returns table (
  event_id uuid,
  has_inventory boolean,
  available_count integer,
  reserved_count integer,
  sold_count integer
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.expire_event_seat_reservations(p_event_id);
  return query
  with event_ids as (
    select event.id
    from public.events event
    where p_event_id is null or event.id = p_event_id
  ), seat_counts as (
    select es.event_id,
      count(*)::integer as total_count,
      count(*) filter (where es.status = 'available')::integer as available_count,
      count(*) filter (where es.status = 'reserved')::integer as reserved_count,
      count(*) filter (where es.status = 'sold')::integer as sold_count
    from public.event_seats es
    join public.ticket_types tt on tt.id = es.ticket_type_id
    join event_ids on event_ids.id = es.event_id
    where tt.is_active
    group by es.event_id
  ), ticket_counts as (
    select tt.event_id,
      count(*)::integer as total_count,
      coalesce(sum(tt.available_quantity), 0)::integer as available_count
    from public.ticket_types tt
    join event_ids on event_ids.id = tt.event_id
    where tt.is_active
      and tt.total_quantity > 0
      and not exists (
      select 1 from public.event_seats es where es.event_id = tt.event_id
    )
    group by tt.event_id
  )
  select event_ids.id,
    (coalesce(seat_counts.total_count, ticket_counts.total_count, 0) > 0),
    coalesce(seat_counts.available_count, ticket_counts.available_count, 0),
    coalesce(seat_counts.reserved_count, 0),
    coalesce(seat_counts.sold_count, 0)
  from event_ids
  left join seat_counts on seat_counts.event_id = event_ids.id
  left join ticket_counts on ticket_counts.event_id = event_ids.id;
end;
$function$;

create or replace function public.get_admin_event_inventory()
returns table (
  event_id uuid,
  total_capacity integer,
  available_capacity integer,
  reserved_capacity integer,
  sold_capacity integer
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  ) then
    raise exception 'Administrator access is required.';
  end if;
  perform public.expire_event_seat_reservations();
  return query
  select es.event_id,
    count(*)::integer,
    count(*) filter (where es.status = 'available')::integer,
    count(*) filter (where es.status = 'reserved')::integer,
    count(*) filter (where es.status = 'sold')::integer
  from public.event_seats es
  join public.ticket_types tt on tt.id = es.ticket_type_id
  where tt.is_active
  group by es.event_id;
end;
$function$;

create or replace function public.get_ranked_homepage_events(p_mode text, p_limit integer)
returns table (
  id uuid, performer text, title text, description text, event_date date,
  event_time time without time zone, venue text, city text, country text,
  image_url text, category text, display_position integer
)
language sql
security definer
set search_path = ''
as $function$
  with expired as (
    select public.expire_event_seat_reservations() as released
  ), eligible as (
    select event.id, event.performer, event.title, event.description,
      event.event_date, event.event_time,
      coalesce(venue_row.name, event.venue) as venue,
      coalesce(venue_row.city_area, event.city) as city,
      coalesce(venue_row.country, event.country) as country,
      event.image_url, category_row.name as category, event.created_at
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
  select id, performer, title, description, event_date, event_time, venue, city,
    country, image_url, category, display_position
  from ranked
  where display_position <= greatest(p_limit, 0)
  order by display_position, id;
$function$;

create or replace function public.get_homepage_hero_events()
returns table (
  id uuid, performer text, title text, event_date date, event_time time without time zone,
  venue text, city text, country text, image_url text, slot smallint
)
language sql
security definer
set search_path = ''
as $function$
  with config as (
    select
      coalesce((select mode from public.homepage_hero_configs where id), 'latest_added') as mode,
      coalesce((select display_limit from public.homepage_hero_configs where id), 3) as display_limit
  ), expired as (
    select public.expire_event_seat_reservations() as released
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
      coalesce(venue_row.country, event.country) as country, event.image_url,
      hero_slot.slot
    from public.homepage_hero_slots hero_slot
    join public.events event on event.id = hero_slot.event_id
    left join public.venues venue_row on venue_row.id = event.venue_id
    cross join config
    cross join expired
    where config.mode = 'custom_selection'
      and hero_slot.slot <= config.display_limit
      and event.status = 'active'
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
  )
  select * from automatic
  union all
  select * from custom
  order by slot, id;
$function$;

create or replace function public.get_homepage_upcoming_shows()
returns table (
  id uuid, performer text, title text, description text, event_date date,
  event_time time without time zone, venue text, city text, country text,
  image_url text, category text
)
language sql
security definer
set search_path = ''
as $function$
  with settings as (
    select coalesce((select mode from public.homepage_upcoming_shows_configs where id), 'latest_added') as mode
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
  where display_position <= 4
  order by display_position, id;
$function$;

revoke all on function public.event_has_purchasable_inventory(uuid) from public, anon, authenticated;
revoke all on function public.get_public_event_inventory(uuid) from public, anon;
grant execute on function public.get_public_event_inventory(uuid) to anon, authenticated;
revoke all on function public.get_ranked_homepage_events(text, integer) from public, anon, authenticated;
revoke all on function public.get_homepage_hero_events() from public;
grant execute on function public.get_homepage_hero_events() to anon, authenticated;
revoke all on function public.get_homepage_upcoming_shows() from public;
grant execute on function public.get_homepage_upcoming_shows() to anon, authenticated;
