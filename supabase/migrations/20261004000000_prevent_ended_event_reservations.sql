-- Events currently have only a start date/time. That timestamp is the
-- reservation cutoff and is stored as local Asia/Tbilisi time.
create or replace function public.event_reservation_is_open(p_event_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and e.status = 'active'
      and make_timestamptz(
        extract(year from e.event_date)::integer,
        extract(month from e.event_date)::integer,
        extract(day from e.event_date)::integer,
        extract(hour from e.event_time)::integer,
        extract(minute from e.event_time)::integer,
        extract(second from e.event_time)::double precision,
        'Asia/Tbilisi'
      ) > now()
  );
$$;

revoke execute on function public.event_reservation_is_open(uuid) from public, anon, authenticated;

create or replace function public.reserve_event_seat(p_event_seat_id uuid)
returns table(event_seat_id uuid, reserved_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_ticket_type_id uuid;
  v_event_id uuid;
  v_status text;
  v_reserved_by uuid;
  v_current_reserved_until timestamptz;
  v_reserved_until timestamptz := now() + interval '10 minutes';
begin
  if v_user_id is null then
    raise exception 'Authentication is required to reserve a seat.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select es.event_id, es.ticket_type_id, es.status, es.reserved_by, es.reserved_until
    into v_event_id, v_ticket_type_id, v_status, v_reserved_by, v_current_reserved_until
  from public.event_seats es
  where es.id = p_event_seat_id
    and public.event_reservation_is_open(es.event_id)
  for update of es;

  if v_event_id is null then
    raise exception 'This event has ended or the seat is no longer available.' using errcode = 'P0001';
  end if;
  if v_status <> 'available' and not (
    v_status = 'reserved'
    and (v_current_reserved_until <= now() or v_reserved_by = v_user_id)
  ) then
    raise exception 'This seat is no longer available.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.event_seats active_seat
    join public.cart_items active_cart
      on active_cart.event_seat_id = active_seat.id
     and active_cart.user_id = v_user_id
    where active_seat.reserved_by = v_user_id
      and active_seat.status = 'reserved'
      and active_seat.reserved_until > now()
      and active_seat.event_id <> v_event_id
  ) then
    raise exception 'ACTIVE_RESERVATION_FOR_ANOTHER_EVENT' using errcode = 'P0001';
  end if;

  update public.event_seats
  set status = 'reserved', reserved_by = v_user_id,
      reserved_until = v_reserved_until, sold_at = null, updated_at = now()
  where id = p_event_seat_id;

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

  create temporary table if not exists pg_temp.checkout_event_seats on commit drop as
  select es.id, es.event_id, es.ticket_type_id, es.unit_price
  from public.event_seats es
  where es.status = 'reserved'
    and es.reserved_by = v_user_id
    and es.reserved_until > now()
  for update;

  if exists (
    select 1
    from pg_temp.checkout_event_seats reserved
    where not public.event_reservation_is_open(reserved.event_id)
  ) then
    raise exception 'This event has ended. Ticket reservations are no longer available for checkout.';
  end if;

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
  from pg_temp.checkout_event_seats reserved
  where es.id = reserved.id;

  delete from public.cart_items
  where user_id = v_user_id
    and event_seat_id in (select id from pg_temp.checkout_event_seats);
  return v_order_id;
end;
$$;
