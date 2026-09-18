-- Event-specific seating configuration layered over canonical event_seats.
-- This migration does not regenerate, truncate, or recreate existing event inventory.

alter table public.ticket_types
  add column if not exists is_active boolean not null default true;

create table public.event_section_configs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  venue_section_id uuid not null references public.venue_sections(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  display_order integer not null default 0 check (display_order >= 0),
  ticket_type_id uuid not null,
  rows integer not null check (rows > 0 and rows <= 500),
  seats_per_row integer not null check (seats_per_row > 0 and seats_per_row <= 500),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, venue_section_id),
  foreign key (ticket_type_id, event_id)
    references public.ticket_types(id, event_id) on delete restrict
);

create table public.event_seat_layouts (
  event_seat_id uuid primary key references public.event_seats(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  venue_section_id uuid not null references public.venue_sections(id) on delete restrict,
  row_number integer not null check (row_number > 0),
  seat_number integer not null check (seat_number > 0),
  unique (event_id, venue_section_id, row_number, seat_number)
);

create index event_section_configs_event_order_idx
  on public.event_section_configs (event_id, display_order);
create index event_seat_layouts_event_section_idx
  on public.event_seat_layouts (event_id, venue_section_id, row_number, seat_number);

create or replace function public.validate_event_section_config_relationship()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.events e
    join public.venue_sections s on s.id = new.venue_section_id
    where e.id = new.event_id and e.venue_id = s.venue_id
  ) then
    raise exception 'The configured zone must belong to the event venue.';
  end if;
  return new;
end;
$$;

create trigger validate_event_section_config_relationship
before insert or update of event_id, venue_section_id on public.event_section_configs
for each row execute function public.validate_event_section_config_relationship();

create or replace function public.validate_event_seat_layout_relationship()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.event_seats es
    join public.venue_seats vs on vs.id = es.venue_seat_id
    where es.id = new.event_seat_id
      and es.event_id = new.event_id
      and vs.section_id = new.venue_section_id
  ) then
    raise exception 'The seat layout must match the event seat and venue section.';
  end if;
  return new;
end;
$$;

create trigger validate_event_seat_layout_relationship
before insert or update on public.event_seat_layouts
for each row execute function public.validate_event_seat_layout_relationship();

-- Preserve every current event seat and derive its initial per-event configuration.
insert into public.event_section_configs (
  event_id, venue_section_id, name, display_order, ticket_type_id, rows, seats_per_row
)
select
  es.event_id,
  vs.section_id,
  min(s.name),
  min(s.display_order),
  (array_agg(es.ticket_type_id order by es.ticket_type_id))[1],
  greatest(max(vs.row_number), 1),
  greatest(max(vs.seat_number), 1)
from public.event_seats es
join public.venue_seats vs on vs.id = es.venue_seat_id
join public.venue_sections s on s.id = vs.section_id
group by es.event_id, vs.section_id
on conflict (event_id, venue_section_id) do nothing;

insert into public.event_seat_layouts (
  event_seat_id, event_id, venue_section_id, row_number, seat_number
)
select es.id, es.event_id, vs.section_id, vs.row_number, vs.seat_number
from public.event_seats es
join public.venue_seats vs on vs.id = es.venue_seat_id
on conflict (event_seat_id) do nothing;

alter table public.event_section_configs enable row level security;
alter table public.event_seat_layouts enable row level security;

create policy "Admins manage event seating configs" on public.event_section_configs
for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy "Admins view event seat layouts" on public.event_seat_layouts
for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

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
  perform public.expire_event_seat_reservations(p_event_id);
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found.';
  end if;

  select jsonb_build_object(
    'event_id', e.id,
    'event_title', e.title,
    'venue_id', e.venue_id,
    'venue_name', v.name,
    'inventory', jsonb_build_object(
      'total', count(es.*)::integer,
      'available', count(es.*) filter (where es.status = 'available')::integer,
      'reserved', count(es.*) filter (where es.status = 'reserved')::integer,
      'sold', count(es.*) filter (where es.status = 'sold')::integer,
      'blocked', count(es.*) filter (where es.status = 'blocked')::integer
    ),
    'ticket_types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tt.id, 'name', tt.name, 'price', tt.price, 'is_active', tt.is_active,
        'capacity', coalesce(count(typed_es.*), 0)::integer,
        'available', coalesce(count(typed_es.*) filter (where typed_es.status = 'available'), 0)::integer
      ) order by tt.created_at, tt.name)
      from public.ticket_types tt
      left join public.event_seats typed_es on typed_es.ticket_type_id = tt.id
      where tt.event_id = e.id
      group by tt.id
    ), '[]'::jsonb),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cfg.id, 'section_id', cfg.venue_section_id, 'name', cfg.name,
        'code', s.code, 'display_order', cfg.display_order, 'ticket_type_id', cfg.ticket_type_id,
        'ticket_type_name', tt.name, 'price', tt.price, 'rows', cfg.rows,
        'seats_per_row', cfg.seats_per_row, 'is_enabled', cfg.is_enabled,
        'capacity', count(zone_es.*)::integer,
        'available', count(zone_es.*) filter (where zone_es.status = 'available')::integer,
        'reserved', count(zone_es.*) filter (where zone_es.status = 'reserved')::integer,
        'sold', count(zone_es.*) filter (where zone_es.status = 'sold')::integer,
        'blocked', count(zone_es.*) filter (where zone_es.status = 'blocked')::integer
      ) order by cfg.display_order, cfg.name)
      from public.event_section_configs cfg
      join public.venue_sections s on s.id = cfg.venue_section_id
      join public.ticket_types tt on tt.id = cfg.ticket_type_id
      left join public.event_seats zone_es on zone_es.event_id = cfg.event_id
        and zone_es.venue_seat_id in (
          select vs.id from public.venue_seats vs where vs.section_id = cfg.venue_section_id
        )
      where cfg.event_id = e.id
      group by cfg.id, s.code, tt.name, tt.price
    ), '[]'::jsonb)
  ) into v_result
  from public.events e
  join public.venues v on v.id = e.venue_id
  left join public.event_seats es on es.event_id = e.id
  where e.id = p_event_id
  group by e.id, v.name;
  return v_result;
end;
$$;

create or replace function public.admin_upsert_event_ticket_type(
  p_event_id uuid,
  p_ticket_type_id uuid,
  p_name text,
  p_price numeric,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket_type_id uuid;
  v_assigned integer;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'Administrator access is required.';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found.';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Ticket type name is required.';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Ticket price cannot be negative.';
  end if;

  if p_ticket_type_id is null then
    insert into public.ticket_types (event_id, name, price, total_quantity, available_quantity, is_active)
    values (p_event_id, btrim(p_name), p_price, 0, 0, coalesce(p_is_active, true))
    returning id into v_ticket_type_id;
  else
    select count(*) into v_assigned
    from public.event_seats
    where event_id = p_event_id and ticket_type_id = p_ticket_type_id;
    if not coalesce(p_is_active, true) and v_assigned > 0 then
      raise exception 'Ticket type is still assigned to % seats. Reassign or remove the zone first.', v_assigned;
    end if;
    update public.ticket_types
    set name = btrim(p_name), price = p_price, is_active = coalesce(p_is_active, true)
    where id = p_ticket_type_id and event_id = p_event_id
    returning id into v_ticket_type_id;
    if v_ticket_type_id is null then
      raise exception 'Ticket type does not belong to this event.';
    end if;
    -- Do not change the price captured by active reservations or completed sales.
    update public.event_seats
    set unit_price = p_price, updated_at = now()
    where event_id = p_event_id and ticket_type_id = v_ticket_type_id
      and status in ('available', 'blocked');
  end if;
  return v_ticket_type_id;
end;
$$;

create or replace function public.admin_upsert_event_zone(
  p_event_id uuid,
  p_config_id uuid,
  p_name text,
  p_code text,
  p_ticket_type_id uuid,
  p_rows integer,
  p_seats_per_row integer,
  p_display_order integer default 0,
  p_is_enabled boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_venue_id uuid;
  v_config public.event_section_configs%rowtype;
  v_section_id uuid;
  v_config_id uuid;
  v_current integer;
  v_target integer;
  v_sold integer;
  v_reserved integer;
  v_price numeric;
  v_available_physical integer;
  v_changed_structure boolean := false;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'Administrator access is required.';
  end if;
  select venue_id into v_event_venue_id from public.events where id = p_event_id;
  if v_event_venue_id is null then raise exception 'Event not found.'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'Zone name is required.'; end if;
  if p_rows is null or p_rows <= 0 or p_rows > 500 then raise exception 'Rows must be between 1 and 500.'; end if;
  if p_seats_per_row is null or p_seats_per_row <= 0 or p_seats_per_row > 500 then raise exception 'Seats per row must be between 1 and 500.'; end if;
  if p_display_order is null or p_display_order < 0 then raise exception 'Display order cannot be negative.'; end if;
  v_target := p_rows * p_seats_per_row;
  if v_target > 100000 then raise exception 'Zone capacity is too large.'; end if;
  select price into v_price from public.ticket_types
    where id = p_ticket_type_id and event_id = p_event_id and is_active;
  if v_price is null then raise exception 'Select an active ticket type from this event.'; end if;

  if p_config_id is null then
    if nullif(btrim(p_code), '') is null or btrim(p_code) !~ '^[A-Za-z0-9_-]+$' then
      raise exception 'Zone code may use letters, numbers, hyphens, and underscores only.';
    end if;
    insert into public.venue_sections (venue_id, name, code, display_order, layout_metadata)
    values (v_event_venue_id, btrim(p_name), upper(btrim(p_code)), p_display_order,
      jsonb_build_object('created_for_event', p_event_id, 'rows', p_rows, 'seats_per_row', p_seats_per_row))
    returning id into v_section_id;
    insert into public.venue_seats (venue_id, section_id, row_number, seat_number)
    select v_event_venue_id, v_section_id,
      ((n - 1) / p_seats_per_row) + 1, ((n - 1) % p_seats_per_row) + 1
    from generate_series(1, v_target) n;
    insert into public.event_section_configs (event_id, venue_section_id, name, display_order, ticket_type_id, rows, seats_per_row, is_enabled)
    values (p_event_id, v_section_id, btrim(p_name), p_display_order, p_ticket_type_id, p_rows, p_seats_per_row, coalesce(p_is_enabled, true))
    returning id into v_config_id;
    insert into public.event_seats (event_id, venue_seat_id, ticket_type_id, unit_price, status)
    select p_event_id, vs.id, p_ticket_type_id, v_price,
      case when coalesce(p_is_enabled, true) then 'available' else 'blocked' end
    from public.venue_seats vs where vs.section_id = v_section_id;
  else
    select * into v_config from public.event_section_configs
      where id = p_config_id and event_id = p_event_id for update;
    if not found then raise exception 'Zone does not belong to this event.'; end if;
    v_config_id := v_config.id;
    v_section_id := v_config.venue_section_id;
    select count(*) into v_current
    from public.event_seats es join public.venue_seats vs on vs.id = es.venue_seat_id
    where es.event_id = p_event_id and vs.section_id = v_section_id;
    v_changed_structure := v_current <> v_target
      or v_config.rows <> p_rows or v_config.seats_per_row <> p_seats_per_row
      or v_config.ticket_type_id <> p_ticket_type_id or v_config.is_enabled <> coalesce(p_is_enabled, true);
    select count(*) filter (where es.status = 'sold'), count(*) filter (where es.status = 'reserved')
    into v_sold, v_reserved
    from public.event_seats es join public.venue_seats vs on vs.id = es.venue_seat_id
    where es.event_id = p_event_id and vs.section_id = v_section_id;
    if v_changed_structure and (v_sold > 0 or v_reserved > 0) then
      raise exception 'Cannot modify this zone because % seats are already sold and % are currently reserved.', v_sold, v_reserved;
    end if;
    if v_target < v_current then
      delete from public.event_seats es
      using (
        select event_seat_id from (
          select es2.id as event_seat_id,
            row_number() over (order by l.row_number, l.seat_number, es2.id) as seat_rank
          from public.event_seats es2
          join public.venue_seats vs2 on vs2.id = es2.venue_seat_id
          join public.event_seat_layouts l on l.event_seat_id = es2.id
          where es2.event_id = p_event_id and vs2.section_id = v_section_id
        ) ranked where seat_rank > v_target
      ) removed
      where es.id = removed.event_seat_id;
    elsif v_target > v_current then
      select count(*) into v_available_physical
      from public.venue_seats vs
      where vs.section_id = v_section_id and vs.is_active
        and not exists (select 1 from public.event_seats es where es.event_id = p_event_id and es.venue_seat_id = vs.id);
      if v_available_physical < (v_target - v_current) then
        raise exception 'This venue zone has only % unused physical seats; create a new zone for additional capacity.', v_available_physical;
      end if;
      insert into public.event_seats (event_id, venue_seat_id, ticket_type_id, unit_price, status)
      select p_event_id, vs.id, p_ticket_type_id, v_price,
        case when coalesce(p_is_enabled, true) then 'available' else 'blocked' end
      from public.venue_seats vs
      where vs.section_id = v_section_id and vs.is_active
        and not exists (select 1 from public.event_seats es where es.event_id = p_event_id and es.venue_seat_id = vs.id)
      order by vs.row_number, vs.seat_number
      limit (v_target - v_current);
    end if;
    update public.event_seats es
    set ticket_type_id = p_ticket_type_id,
        unit_price = v_price,
        status = case
          when coalesce(p_is_enabled, true) and es.status = 'blocked' then 'available'
          when not coalesce(p_is_enabled, true) and es.status = 'available' then 'blocked'
          else es.status end,
        updated_at = now()
    from public.venue_seats vs
    where es.venue_seat_id = vs.id and es.event_id = p_event_id and vs.section_id = v_section_id;
    update public.event_section_configs
    set name = btrim(p_name), display_order = p_display_order, ticket_type_id = p_ticket_type_id,
        rows = p_rows, seats_per_row = p_seats_per_row, is_enabled = coalesce(p_is_enabled, true), updated_at = now()
    where id = v_config_id;
  end if;

  -- Rebuild only this zone's presentation layout; event_seat UUIDs remain unchanged.
  delete from public.event_seat_layouts l
  using public.event_seats es, public.venue_seats vs
  where l.event_seat_id = es.id and es.venue_seat_id = vs.id
    and es.event_id = p_event_id and vs.section_id = v_section_id;
  insert into public.event_seat_layouts (event_seat_id, event_id, venue_section_id, row_number, seat_number)
  select es.id, p_event_id, v_section_id,
    ((row_number() over (order by vs.row_number, vs.seat_number, es.id) - 1) / p_seats_per_row) + 1,
    ((row_number() over (order by vs.row_number, vs.seat_number, es.id) - 1) % p_seats_per_row) + 1
  from public.event_seats es join public.venue_seats vs on vs.id = es.venue_seat_id
  where es.event_id = p_event_id and vs.section_id = v_section_id;
  return v_config_id;
end;
$$;

create or replace function public.admin_delete_event_zone(p_config_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.event_section_configs%rowtype;
  v_sold integer;
  v_reserved integer;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'Administrator access is required.';
  end if;
  select * into v_config from public.event_section_configs where id = p_config_id for update;
  if not found then raise exception 'Zone not found.'; end if;
  select count(*) filter (where es.status = 'sold'), count(*) filter (where es.status = 'reserved')
  into v_sold, v_reserved
  from public.event_seats es join public.venue_seats vs on vs.id = es.venue_seat_id
  where es.event_id = v_config.event_id and vs.section_id = v_config.venue_section_id;
  if v_sold > 0 or v_reserved > 0 then
    raise exception 'Cannot remove this zone because % seats are already sold and % are currently reserved.', v_sold, v_reserved;
  end if;
  delete from public.event_seats es
  using public.venue_seats vs
  where es.venue_seat_id = vs.id and es.event_id = v_config.event_id and vs.section_id = v_config.venue_section_id;
  delete from public.event_section_configs where id = p_config_id;
  return true;
end;
$$;

create or replace function public.get_event_seat_map(p_event_id uuid)
returns table (
  event_seat_id uuid, section_id uuid, section_code text, section_name text,
  section_order integer, row_number integer, seat_number integer,
  position_x numeric, position_y numeric, status text, ticket_type_id uuid,
  ticket_type_name text, price numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.events e where e.id = p_event_id and e.status = 'active') then
    raise exception 'Event is unavailable.';
  end if;
  perform public.expire_event_seat_reservations(p_event_id);
  return query
  select es.id, s.id, s.code, coalesce(cfg.name, s.name),
    coalesce(cfg.display_order, s.display_order),
    coalesce(layout.row_number, vs.row_number), coalesce(layout.seat_number, vs.seat_number),
    vs.position_x, vs.position_y, es.status, tt.id, tt.name, es.unit_price
  from public.event_seats es
  join public.venue_seats vs on vs.id = es.venue_seat_id
  join public.venue_sections s on s.id = vs.section_id
  join public.ticket_types tt on tt.id = es.ticket_type_id
  left join public.event_section_configs cfg on cfg.event_id = es.event_id and cfg.venue_section_id = vs.section_id
  left join public.event_seat_layouts layout on layout.event_seat_id = es.id
  where es.event_id = p_event_id and vs.is_active
  order by coalesce(cfg.display_order, s.display_order), s.code,
    coalesce(layout.row_number, vs.row_number), coalesce(layout.seat_number, vs.seat_number);
end;
$$;

drop function public.get_admin_event_inventory();
create function public.get_admin_event_inventory()
returns table (
  event_id uuid, total_capacity integer, available_capacity integer,
  reserved_capacity integer, sold_capacity integer, blocked_capacity integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admin_users a where a.user_id = auth.uid()) then
    raise exception 'Administrator access is required.';
  end if;
  perform public.expire_event_seat_reservations();
  return query
  select es.event_id, count(*)::integer,
    count(*) filter (where es.status = 'available')::integer,
    count(*) filter (where es.status = 'reserved')::integer,
    count(*) filter (where es.status = 'sold')::integer,
    count(*) filter (where es.status = 'blocked')::integer
  from public.event_seats es group by es.event_id;
end;
$$;

revoke all on function public.get_admin_event_seating_configuration(uuid) from public, anon;
revoke all on function public.admin_upsert_event_ticket_type(uuid, uuid, text, numeric, boolean) from public, anon;
revoke all on function public.admin_upsert_event_zone(uuid, uuid, text, text, uuid, integer, integer, integer, boolean) from public, anon;
revoke all on function public.admin_delete_event_zone(uuid) from public, anon;
revoke all on function public.get_admin_event_inventory() from public, anon;
grant execute on function public.get_admin_event_seating_configuration(uuid) to authenticated;
grant execute on function public.admin_upsert_event_ticket_type(uuid, uuid, text, numeric, boolean) to authenticated;
grant execute on function public.admin_upsert_event_zone(uuid, uuid, text, text, uuid, integer, integer, integer, boolean) to authenticated;
grant execute on function public.admin_delete_event_zone(uuid) to authenticated;
grant execute on function public.get_admin_event_inventory() to authenticated;
