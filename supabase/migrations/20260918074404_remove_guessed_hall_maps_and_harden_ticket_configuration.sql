-- Remove the superseded guessed Hall Map presentation system.  This migration is
-- intentionally forward-only and never changes canonical seats, ticket assignments,
-- reservations, carts, orders, prices locked on seats, or capacity.

-- The public map RPC remains tied to canonical event_seats and exposes every field
-- needed for selection, reservation countdowns, and data-driven ticket styling.
drop function if exists public.get_event_seat_map(uuid);
create function public.get_event_seat_map(p_event_id uuid)
returns table (
  event_seat_id uuid,
  section_id uuid,
  section_code text,
  section_name text,
  section_order integer,
  row_number integer,
  seat_number integer,
  position_x numeric,
  position_y numeric,
  status text,
  reserved_until timestamptz,
  ticket_type_id uuid,
  ticket_type_name text,
  price numeric,
  ticket_color text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.events e where e.id = p_event_id and e.status = 'active'
  ) then
    raise exception 'Event is unavailable.';
  end if;

  perform public.expire_event_seat_reservations(p_event_id);

  return query
  select
    es.id,
    section.id,
    section.code,
    coalesce(config.name, section.name),
    coalesce(config.display_order, section.display_order),
    coalesce(layout.row_number, venue_seat.row_number),
    coalesce(layout.seat_number, venue_seat.seat_number),
    venue_seat.position_x,
    venue_seat.position_y,
    es.status,
    es.reserved_until,
    ticket_type.id,
    ticket_type.name,
    es.unit_price,
    ticket_type.display_color
  from public.event_seats es
  join public.venue_seats venue_seat on venue_seat.id = es.venue_seat_id
  join public.venue_sections section on section.id = venue_seat.section_id
  join public.ticket_types ticket_type on ticket_type.id = es.ticket_type_id
  left join public.event_section_configs config
    on config.event_id = es.event_id and config.venue_section_id = venue_seat.section_id
  left join public.event_seat_layouts layout on layout.event_seat_id = es.id
  where es.event_id = p_event_id and venue_seat.is_active
  order by
    coalesce(config.display_order, section.display_order),
    section.code,
    coalesce(layout.row_number, venue_seat.row_number),
    coalesce(layout.seat_number, venue_seat.seat_number);
end;
$$;

revoke all on function public.get_event_seat_map(uuid) from public;
grant execute on function public.get_event_seat_map(uuid) to anon, authenticated;

-- One canonical, event-scoped source for the public legend and ticket-type filter.
-- It does not derive tiers, prices, or colors from rendered seat DOM nodes.
create or replace function public.get_event_ticket_legend(p_event_id uuid)
returns table (
  ticket_type_id uuid,
  ticket_type_name text,
  canonical_tier text,
  price numeric,
  display_color text,
  is_active boolean,
  canonical_seat_count integer,
  available_seat_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.events e where e.id = p_event_id and e.status = 'active'
  ) then
    raise exception 'Event is unavailable.';
  end if;

  perform public.expire_event_seat_reservations(p_event_id);

  return query
  select
    ticket_type.id,
    ticket_type.name,
    ticket_type.canonical_tier,
    ticket_type.price,
    ticket_type.display_color,
    ticket_type.is_active,
    count(event_seat.id)::integer,
    count(event_seat.id) filter (where event_seat.status = 'available')::integer
  from public.ticket_types ticket_type
  left join public.event_seats event_seat on event_seat.ticket_type_id = ticket_type.id
  where ticket_type.event_id = p_event_id
    and ticket_type.canonical_tier is not null
  group by ticket_type.id
  order by case ticket_type.canonical_tier
    when 'cheap' then 1
    when 'medium' then 2
    when 'expensive' then 3
    when 'vip' then 4
    else 5
  end, ticket_type.name;
end;
$$;

revoke all on function public.get_event_ticket_legend(uuid) from public;
grant execute on function public.get_event_ticket_legend(uuid) to anon, authenticated;

-- Replace the admin response before dropping visual presentation relations.
create or replace function public.get_admin_event_seating_configuration(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'Administrator access is required.';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found.';
  end if;

  perform public.expire_event_seat_reservations(p_event_id);

  select jsonb_build_object(
    'event_id', event.id,
    'event_title', event.title,
    'venue_id', event.venue_id,
    'venue_name', venue.name,
    'inventory', coalesce((
      select jsonb_build_object(
        'total', count(*)::integer,
        'available', count(*) filter (where event_seat.status = 'available')::integer,
        'reserved', count(*) filter (where event_seat.status = 'reserved')::integer,
        'sold', count(*) filter (where event_seat.status = 'sold')::integer,
        'blocked', count(*) filter (where event_seat.status = 'blocked')::integer
      )
      from public.event_seats event_seat
      where event_seat.event_id = event.id
    ), '{}'::jsonb),
    'ticket_types', coalesce((
      select jsonb_agg(to_jsonb(type_row) order by type_row.tier_order, type_row.name)
      from (
        select
          ticket_type.id,
          ticket_type.name,
          ticket_type.canonical_tier,
          ticket_type.price,
          ticket_type.display_color,
          ticket_type.is_active,
          count(event_seat.id)::integer as capacity,
          count(event_seat.id) filter (where event_seat.status = 'available')::integer as available,
          count(event_seat.id) filter (where event_seat.status = 'reserved')::integer as reserved,
          count(event_seat.id) filter (where event_seat.status = 'sold')::integer as sold,
          count(event_seat.id) filter (where event_seat.status = 'blocked')::integer as blocked,
          (ticket_type.price is not null and ticket_type.price >= 0) as has_valid_price,
          (coalesce(ticket_type.display_color, '') ~ '^#[0-9A-Fa-f]{6}$') as has_valid_color,
          (count(event_seat.id) > 0) as has_canonical_seats,
          case ticket_type.canonical_tier
            when 'cheap' then 1 when 'medium' then 2 when 'expensive' then 3 when 'vip' then 4 else 5
          end as tier_order
        from public.ticket_types ticket_type
        left join public.event_seats event_seat on event_seat.ticket_type_id = ticket_type.id
        where ticket_type.event_id = event.id
        group by ticket_type.id
      ) type_row
    ), '[]'::jsonb),
    'sections', coalesce((
      select jsonb_agg(to_jsonb(section_row) order by section_row.display_order, section_row.name)
      from (
        select
          config.id,
          config.venue_section_id as section_id,
          config.name,
          physical_section.code,
          config.display_order,
          config.ticket_type_id,
          ticket_type.name as ticket_type_name,
          ticket_type.canonical_tier,
          ticket_type.price,
          config.rows,
          config.seats_per_row,
          config.is_enabled,
          count(event_seat.id)::integer as capacity,
          count(event_seat.id) filter (where event_seat.status = 'available')::integer as available,
          count(event_seat.id) filter (where event_seat.status = 'reserved')::integer as reserved,
          count(event_seat.id) filter (where event_seat.status = 'sold')::integer as sold,
          count(event_seat.id) filter (where event_seat.status = 'blocked')::integer as blocked
        from public.event_section_configs config
        join public.venue_sections physical_section on physical_section.id = config.venue_section_id
        join public.ticket_types ticket_type on ticket_type.id = config.ticket_type_id
        left join public.venue_seats venue_seat on venue_seat.section_id = config.venue_section_id
        left join public.event_seats event_seat
          on event_seat.event_id = config.event_id and event_seat.venue_seat_id = venue_seat.id
        where config.event_id = event.id
        group by config.id, physical_section.code, ticket_type.name, ticket_type.canonical_tier, ticket_type.price
      ) section_row
    ), '[]'::jsonb),
    'validation', jsonb_build_object(
      'is_complete', not exists (
        select 1
        from (
          values
            ('cheap'::text, 1),
            ('medium'::text, 2),
            ('expensive'::text, 3),
            ('vip'::text, 4)
        ) as required_tier(canonical_tier, tier_order)
        left join public.ticket_types ticket_type
          on ticket_type.event_id = event.id
          and ticket_type.canonical_tier = required_tier.canonical_tier
        where ticket_type.id is null
          or not ticket_type.is_active
          or ticket_type.price is null
          or ticket_type.price < 0
          or coalesce(ticket_type.display_color, '') !~ '^#[0-9A-Fa-f]{6}$'
          or not exists (
            select 1 from public.event_seats event_seat
            where event_seat.event_id = event.id and event_seat.ticket_type_id = ticket_type.id
          )
      ),
      'issues', coalesce((
        select jsonb_agg(jsonb_build_object(
          'canonical_tier', required_tier.canonical_tier,
          'message', concat_ws(' ',
            case when ticket_type.id is null then 'Required tier is missing.' end,
            case when ticket_type.id is not null and not ticket_type.is_active then 'Tier is inactive.' end,
            case when ticket_type.id is not null and (ticket_type.price is null or ticket_type.price < 0) then 'Tier needs a valid non-negative price.' end,
            case when ticket_type.id is not null and coalesce(ticket_type.display_color, '') !~ '^#[0-9A-Fa-f]{6}$' then 'Tier needs a valid map color.' end,
            case when ticket_type.id is not null and not exists (
              select 1 from public.event_seats event_seat
              where event_seat.event_id = event.id and event_seat.ticket_type_id = ticket_type.id
            ) then 'Tier has no canonical seats assigned.' end
          )
        ) order by required_tier.tier_order)
        from (
          values
            ('cheap'::text, 1),
            ('medium'::text, 2),
            ('expensive'::text, 3),
            ('vip'::text, 4)
        ) as required_tier(canonical_tier, tier_order)
        left join public.ticket_types ticket_type
          on ticket_type.event_id = event.id
          and ticket_type.canonical_tier = required_tier.canonical_tier
        where ticket_type.id is null
          or not ticket_type.is_active
          or ticket_type.price is null
          or ticket_type.price < 0
          or coalesce(ticket_type.display_color, '') !~ '^#[0-9A-Fa-f]{6}$'
          or not exists (
            select 1 from public.event_seats event_seat
            where event_seat.event_id = event.id and event_seat.ticket_type_id = ticket_type.id
          )
      ), '[]'::jsonb)
    )
  ) into v_result
  from public.events event
  join public.venues venue on venue.id = event.venue_id
  where event.id = p_event_id;

  return v_result;
end;
$$;

revoke all on function public.get_admin_event_seating_configuration(uuid) from public, anon;
grant execute on function public.get_admin_event_seating_configuration(uuid) to authenticated;

-- Publishing an active event now requires all four canonical tiers to have an
-- active row, valid price, valid color, and at least one canonical event seat.
create or replace function public.enforce_active_event_ticket_tiers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and exists (
    select 1
    from (
      values ('cheap'::text), ('medium'::text), ('expensive'::text), ('vip'::text)
    ) as required_tier(canonical_tier)
    left join public.ticket_types ticket_type
      on ticket_type.event_id = new.id
      and ticket_type.canonical_tier = required_tier.canonical_tier
    where ticket_type.id is null
      or not ticket_type.is_active
      or ticket_type.price is null
      or ticket_type.price < 0
      or coalesce(ticket_type.display_color, '') !~ '^#[0-9A-Fa-f]{6}$'
      or not exists (
        select 1 from public.event_seats event_seat
        where event_seat.event_id = new.id and event_seat.ticket_type_id = ticket_type.id
      )
  ) then
    raise exception 'An active event requires all four canonical ticket tiers to be active, priced, colored, and assigned at least one seat.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_active_event_ticket_tiers() from public, anon, authenticated;

-- Remove only hall-map template/focal/slot presentation objects.  Their values
-- were never authoritative inventory and their removal leaves venue seats,
-- event seats, layouts, ticket types, reservations, carts, and orders intact.
drop trigger if exists initialize_event_hall_map_config on public.events;
drop function if exists public.initialize_event_hall_map_config();
drop function if exists public.admin_apply_event_hall_map_template(uuid, text);
drop function if exists public.admin_save_event_hall_map_layout(uuid, text, jsonb, jsonb);
drop function if exists public.get_event_hall_map_presentation(uuid);
drop function if exists public.replace_event_hall_map_template(uuid, text);

drop table if exists public.event_hall_map_sections;
drop table if exists public.event_hall_map_configs;

alter table public.event_section_configs
  drop column if exists position_x,
  drop column if exists position_y,
  drop column if exists layout_width,
  drop column if exists layout_height,
  drop column if exists rotation,
  drop column if exists layout_shape,
  drop column if exists layout_is_custom;

alter table public.venues drop column if exists hall_map_template;
