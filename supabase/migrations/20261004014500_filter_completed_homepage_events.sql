-- Homepage promotion eligibility is based on the full event timestamp.
-- event_date and event_time are stored as Asia/Tbilisi wall-clock values.
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
  with eligible as (
    select event.id, event.performer, event.title, event.description, event.event_date,
      event.event_time, coalesce(venue_row.name, event.venue) as venue,
      coalesce(venue_row.city_area, event.city) as city,
      coalesce(venue_row.country, event.country) as country, event.image_url,
      category_row.name as category, event.created_at
    from public.events event
    left join public.venues venue_row on venue_row.id = event.venue_id
    left join public.categories category_row on category_row.id = event.category_id
    where event.status = 'active'
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
  select id, performer, title, description, event_date, event_time, venue, city, country,
    image_url, category, display_position
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
  with eligible as (
    select event.id, event.performer, event.title, event.description, event.event_date,
      event.event_time, coalesce(venue_row.name, event.venue) as venue,
      coalesce(venue_row.city_area, event.city) as city,
      coalesce(venue_row.country, event.country) as country, event.image_url,
      category_row.name as category
    from public.events event
    left join public.venues venue_row on venue_row.id = event.venue_id
    left join public.categories category_row on category_row.id = event.category_id
    where event.status = 'active'
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
  select id, performer, title, description, event_date, event_time, venue, city,
    country, image_url, category
  from eligible
  order by event_date, event_time, id
  limit 4;
$function$;

revoke all on function public.get_ranked_homepage_events(text, integer) from public, anon;
revoke all on function public.get_homepage_hero_events() from public;
grant execute on function public.get_homepage_hero_events() to anon, authenticated;
revoke all on function public.get_homepage_upcoming_shows() from public;
grant execute on function public.get_homepage_upcoming_shows() to anon, authenticated;
