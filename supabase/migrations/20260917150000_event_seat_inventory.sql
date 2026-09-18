-- Database-backed venue layouts and event-seat inventory.
-- Initial venue layouts are generated from the current ticket configuration because
-- no verified physical seating plans are available in the source project.

create table if not exists public.venue_sections (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  code text not null,
  display_order integer not null default 0 check (display_order >= 0),
  layout_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, code)
);

create table if not exists public.venue_seats (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  section_id uuid not null references public.venue_sections(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  seat_number integer not null check (seat_number > 0),
  position_x numeric,
  position_y numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, section_id, row_number, seat_number)
);

alter table public.ticket_types
  add constraint ticket_types_id_event_id_key unique (id, event_id);

create table if not exists public.event_seats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  venue_seat_id uuid not null references public.venue_seats(id) on delete restrict,
  ticket_type_id uuid not null,
  unit_price numeric not null check (unit_price >= 0),
  status text not null default 'available'
    check (status in ('available', 'reserved', 'sold', 'blocked')),
  reserved_by uuid references public.profiles(id) on delete set null,
  reserved_until timestamptz,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, venue_seat_id),
  foreign key (ticket_type_id, event_id)
    references public.ticket_types(id, event_id) on delete restrict,
  check (
    (status = 'reserved' and reserved_by is not null and reserved_until is not null)
    or (status <> 'reserved' and reserved_by is null and reserved_until is null)
  ),
  check ((status = 'sold' and sold_at is not null) or (status <> 'sold' and sold_at is null))
);

create index if not exists venue_sections_venue_order_idx
  on public.venue_sections (venue_id, display_order);
create index if not exists venue_seats_section_row_seat_idx
  on public.venue_seats (section_id, row_number, seat_number);
create index if not exists event_seats_event_map_idx
  on public.event_seats (event_id, status, venue_seat_id);
create index if not exists event_seats_ticket_status_idx
  on public.event_seats (ticket_type_id, status);
create index if not exists event_seats_ticket_event_idx
  on public.event_seats (ticket_type_id, event_id);
create index if not exists event_seats_venue_seat_idx
  on public.event_seats (venue_seat_id);
create index if not exists event_seats_reserved_by_idx
  on public.event_seats (reserved_by)
  where reserved_by is not null;
create index if not exists event_seats_expiring_reservations_idx
  on public.event_seats (reserved_until)
  where status = 'reserved';

create or replace function public.validate_event_seat_relationships()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.events e
    join public.venue_seats vs on vs.id = new.venue_seat_id
    where e.id = new.event_id and e.venue_id = vs.venue_id
  ) then
    raise exception 'The event seat must use a physical seat from its event venue.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_event_seat_relationships on public.event_seats;
create trigger validate_event_seat_relationships
before insert or update of event_id, venue_seat_id on public.event_seats
for each row execute function public.validate_event_seat_relationships();

-- Four generated sections are initial configuration, not a global frontend rule.
-- They make every existing ticket tier representable until real venue plans are imported.
insert into public.venue_sections (venue_id, name, code, display_order, layout_metadata)
select distinct e.venue_id,
  tt.name,
  case tt.name
    when 'Cheap / Standard' then 'STANDARD'
    when 'Medium / Premium' then 'PREMIUM'
    when 'Expensive' then 'EXPENSIVE'
    when 'VIP' then 'VIP'
  end,
  case tt.name
    when 'Cheap / Standard' then 10
    when 'Medium / Premium' then 20
    when 'Expensive' then 30
    when 'VIP' then 40
  end,
  jsonb_build_object('source', 'generated_from_ticket_capacities', 'seats_per_row', 100)
from public.events e
join public.ticket_types tt on tt.event_id = e.id
on conflict (venue_id, code) do nothing;

with section_capacity as (
  select e.venue_id,
    case tt.name
      when 'Cheap / Standard' then 'STANDARD'
      when 'Medium / Premium' then 'PREMIUM'
      when 'Expensive' then 'EXPENSIVE'
      when 'VIP' then 'VIP'
    end as section_code,
    max(tt.total_quantity) as seats_needed
  from public.events e
  join public.ticket_types tt on tt.event_id = e.id
  group by e.venue_id, tt.name
)
insert into public.venue_seats (venue_id, section_id, row_number, seat_number)
select sc.venue_id, s.id,
  ((n.seat_index - 1) / 100) + 1,
  ((n.seat_index - 1) % 100) + 1
from section_capacity sc
join public.venue_sections s
  on s.venue_id = sc.venue_id and s.code = sc.section_code
cross join lateral generate_series(1, sc.seats_needed) as n(seat_index)
on conflict (venue_id, section_id, row_number, seat_number) do nothing;

with ranked_venue_seats as (
  select vs.id, vs.venue_id, s.code,
    row_number() over (
      partition by vs.venue_id, s.code
      order by vs.row_number, vs.seat_number
    ) as seat_rank
  from public.venue_seats vs
  join public.venue_sections s on s.id = vs.section_id
),
ticket_sections as (
  select tt.id as ticket_type_id, tt.event_id, tt.price, tt.total_quantity,
    e.venue_id,
    case tt.name
      when 'Cheap / Standard' then 'STANDARD'
      when 'Medium / Premium' then 'PREMIUM'
      when 'Expensive' then 'EXPENSIVE'
      when 'VIP' then 'VIP'
    end as section_code
  from public.ticket_types tt
  join public.events e on e.id = tt.event_id
)
insert into public.event_seats (event_id, venue_seat_id, ticket_type_id, unit_price)
select ts.event_id, rvs.id, ts.ticket_type_id, ts.price
from ticket_sections ts
join ranked_venue_seats rvs
  on rvs.venue_id = ts.venue_id
  and rvs.code = ts.section_code
  and rvs.seat_rank <= ts.total_quantity
on conflict (event_id, venue_seat_id) do nothing;

alter table public.cart_items
  add column if not exists event_seat_id uuid references public.event_seats(id) on delete cascade;
alter table public.cart_items
  add constraint cart_items_event_seat_quantity_check
  check (event_seat_id is null or quantity = 1);
create unique index if not exists cart_items_user_event_seat_key
  on public.cart_items (user_id, event_seat_id)
  where event_seat_id is not null;
create index if not exists cart_items_event_seat_idx
  on public.cart_items (event_seat_id)
  where event_seat_id is not null;

alter table public.order_items
  add column if not exists event_seat_id uuid references public.event_seats(id) on delete restrict;
alter table public.order_items
  add constraint order_items_event_seat_quantity_check
  check (event_seat_id is null or quantity = 1);
create unique index if not exists order_items_event_seat_key
  on public.order_items (event_seat_id)
  where event_seat_id is not null;

create or replace function public.sync_legacy_ticket_inventory()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ticket_type_id uuid := coalesce(new.ticket_type_id, old.ticket_type_id);
begin
  update public.ticket_types tt
  set total_quantity = counts.total_count,
      available_quantity = counts.available_count
  from (
    select count(*)::integer as total_count,
      count(*) filter (where status = 'available')::integer as available_count
    from public.event_seats
    where ticket_type_id = v_ticket_type_id
  ) counts
  where tt.id = v_ticket_type_id;
  return null;
end;
$$;

drop trigger if exists sync_legacy_ticket_inventory on public.event_seats;
create trigger sync_legacy_ticket_inventory
after insert or update of status, ticket_type_id or delete on public.event_seats
for each row execute function public.sync_legacy_ticket_inventory();

create or replace function public.expire_event_seat_reservations(p_event_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.event_seats
  set status = 'available', reserved_by = null, reserved_until = null, updated_at = now()
  where status = 'reserved'
    and reserved_until <= now()
    and (p_event_id is null or event_id = p_event_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.get_event_seat_map(p_event_id uuid)
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
  ticket_type_id uuid,
  ticket_type_name text,
  price numeric
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
  select es.id, s.id, s.code, s.name, s.display_order,
    vs.row_number, vs.seat_number, vs.position_x, vs.position_y,
    es.status, tt.id, tt.name, es.unit_price
  from public.event_seats es
  join public.venue_seats vs on vs.id = es.venue_seat_id
  join public.venue_sections s on s.id = vs.section_id
  join public.ticket_types tt on tt.id = es.ticket_type_id
  where es.event_id = p_event_id and vs.is_active
  order by s.display_order, s.code, vs.row_number, vs.seat_number;
end;
$$;

create or replace function public.reserve_event_seat(p_event_seat_id uuid)
returns table (event_seat_id uuid, reserved_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_ticket_type_id uuid;
  v_reserved_until timestamptz := now() + interval '10 minutes';
begin
  if v_user_id is null then
    raise exception 'Authentication is required to reserve a seat.';
  end if;

  update public.event_seats es
  set status = 'reserved', reserved_by = v_user_id,
      reserved_until = v_reserved_until, sold_at = null, updated_at = now()
  from public.events e
  where es.id = p_event_seat_id
    and e.id = es.event_id
    and e.status = 'active'
    and (
      es.status = 'available'
      or (es.status = 'reserved' and es.reserved_until <= now())
      or (es.status = 'reserved' and es.reserved_by = v_user_id)
    )
  returning es.ticket_type_id into v_ticket_type_id;

  if v_ticket_type_id is null then
    raise exception 'This seat is no longer available.' using errcode = 'P0001';
  end if;

  update public.cart_items ci
  set updated_at = now()
  where ci.user_id = v_user_id and ci.event_seat_id = p_event_seat_id;
  if not found then
    insert into public.cart_items (user_id, ticket_type_id, event_seat_id, quantity)
    values (v_user_id, v_ticket_type_id, p_event_seat_id, 1);
  end if;

  return query select p_event_seat_id, v_reserved_until;
end;
$$;

create or replace function public.release_event_seat(p_event_seat_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required to release a seat.';
  end if;
  update public.event_seats
  set status = 'available', reserved_by = null, reserved_until = null, updated_at = now()
  where id = p_event_seat_id and status = 'reserved' and reserved_by = v_user_id;
  delete from public.cart_items
  where user_id = v_user_id and event_seat_id = p_event_seat_id;
  return found;
end;
$$;

create or replace function public.checkout_reserved_event_seats()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_total numeric := 0;
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to checkout.';
  end if;
  perform public.expire_event_seat_reservations();

  -- Lock all of this customer’s still-valid reservations before creating an order.
  create temporary table if not exists pg_temp.checkout_event_seats on commit drop as
  select es.id, es.ticket_type_id, es.unit_price
  from public.event_seats es
  where es.status = 'reserved'
    and es.reserved_by = v_user_id
    and es.reserved_until > now()
  for update;

  select count(*), coalesce(sum(unit_price), 0)
  into v_count, v_total
  from pg_temp.checkout_event_seats;
  if v_count = 0 then
    raise exception 'There are no active seat reservations to checkout.';
  end if;

  insert into public.orders (user_id, total_price, status)
  values (v_user_id, v_total, 'paid')
  returning id into v_order_id;

  insert into public.order_items (order_id, ticket_type_id, event_seat_id, quantity, unit_price)
  select v_order_id, ticket_type_id, id, 1, unit_price
  from pg_temp.checkout_event_seats;

  update public.event_seats es
  set status = 'sold', reserved_by = null, reserved_until = null,
      sold_at = now(), updated_at = now()
  from pg_temp.checkout_event_seats checkout_seat
  where es.id = checkout_seat.id;

  delete from public.cart_items
  where user_id = v_user_id and event_seat_id in (select id from pg_temp.checkout_event_seats);
  return v_order_id;
end;
$$;

-- Existing aggregate checkout bypasses canonical seats; it must not remain callable.
revoke execute on function public.create_order_atomic(jsonb) from public, anon, authenticated;
revoke execute on function public.expire_event_seat_reservations(uuid) from public, anon, authenticated;
revoke execute on function public.reserve_event_seat(uuid) from public, anon;
revoke execute on function public.release_event_seat(uuid) from public, anon;
revoke execute on function public.checkout_reserved_event_seats() from public, anon;
grant execute on function public.get_event_seat_map(uuid) to anon, authenticated;
grant execute on function public.reserve_event_seat(uuid) to authenticated;
grant execute on function public.release_event_seat(uuid) to authenticated;
grant execute on function public.checkout_reserved_event_seats() to authenticated;

alter table public.venue_sections enable row level security;
alter table public.venue_seats enable row level security;
alter table public.event_seats enable row level security;

create policy "Admins manage venue sections" on public.venue_sections
for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy "Admins manage venue seats" on public.venue_seats
for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy "Admins view all event seats" on public.event_seats
for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy "Users view their reserved event seats" on public.event_seats
for select to authenticated
using (reserved_by = (select auth.uid()));

drop policy if exists "Users manage own cart" on public.cart_items;
drop policy if exists "Users insert own cart" on public.cart_items;
drop policy if exists "Users update own cart" on public.cart_items;
drop policy if exists "Users delete own cart" on public.cart_items;
create policy "Users insert legacy cart items" on public.cart_items
for insert to authenticated with check (
  user_id = (select auth.uid()) and event_seat_id is null
);
create policy "Users update legacy cart items" on public.cart_items
for update to authenticated using (
  user_id = (select auth.uid()) and event_seat_id is null
) with check (
  user_id = (select auth.uid()) and event_seat_id is null
);
create policy "Users delete legacy cart items" on public.cart_items
for delete to authenticated using (
  user_id = (select auth.uid()) and event_seat_id is null
);

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
as $$
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
  group by es.event_id;
end;
$$;
revoke execute on function public.get_admin_event_inventory() from public, anon;
grant execute on function public.get_admin_event_inventory() to authenticated;
