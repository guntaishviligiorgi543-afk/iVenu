-- A customer may hold or purchase no more than four exact seats for one event.
-- The lock is scoped to the account/event pair so concurrent browser tabs cannot
-- both pass the count before either reservation is written.
create index if not exists event_seats_reservation_limit_lookup_idx
  on public.event_seats (reserved_by, event_id)
  where status = 'reserved';

create or replace function public.reserve_event_seat(p_event_seat_id uuid)
returns table (event_seat_id uuid, reserved_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_ticket_type_id uuid;
  v_reserved_until timestamptz := now() + interval '10 minutes';
  v_already_reserved boolean := false;
  v_ticket_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to reserve a seat.';
  end if;

  select es.event_id,
         es.ticket_type_id,
         es.status = 'reserved'
           and es.reserved_by = v_user_id
           and es.reserved_until > now()
    into v_event_id, v_ticket_type_id, v_already_reserved
  from public.event_seats as es
  where es.id = p_event_seat_id
  for update;

  if v_event_id is null then
    raise exception 'This seat is no longer available.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || v_event_id::text, 0)
  );
  perform public.expire_event_seat_reservations(v_event_id);

  if v_already_reserved then
    update public.event_seats
    set reserved_until = v_reserved_until,
        updated_at = now()
    where id = p_event_seat_id
      and status = 'reserved'
      and reserved_by = v_user_id;

    return query select p_event_seat_id, v_reserved_until;
    return;
  end if;

  -- Count unique canonical exact seats only. A live reservation and a completed
  -- order cannot normally represent the same seat, but UNION prevents any
  -- duplicate counting if historical data is inconsistent.
  select count(*) into v_ticket_count
  from (
    select es.id
    from public.event_seats as es
    where es.event_id = v_event_id
      and es.status = 'reserved'
      and es.reserved_by = v_user_id
      and es.reserved_until > now()

    union

    select oi.event_seat_id
    from public.order_items as oi
    join public.orders as o on o.id = oi.order_id
    join public.event_seats as es on es.id = oi.event_seat_id
    where o.user_id = v_user_id
      and es.event_id = v_event_id
      and oi.event_seat_id is not null
  ) as counted_seats;

  if v_ticket_count >= 4 then
    raise exception 'TICKET_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  update public.event_seats as es
  set status = 'reserved',
      reserved_by = v_user_id,
      reserved_until = v_reserved_until,
      sold_at = null,
      updated_at = now()
  from public.events as e
  where es.id = p_event_seat_id
    and e.id = es.event_id
    and e.status = 'active'
    and es.status = 'available'
  returning es.ticket_type_id into v_ticket_type_id;

  if v_ticket_type_id is null then
    raise exception 'This seat is no longer available.' using errcode = 'P0001';
  end if;

  update public.cart_items as ci
  set updated_at = now()
  where ci.user_id = v_user_id
    and ci.event_seat_id = p_event_seat_id;

  if not found then
    insert into public.cart_items (user_id, ticket_type_id, event_seat_id, quantity)
    values (v_user_id, v_ticket_type_id, p_event_seat_id, 1);
  end if;

  return query select p_event_seat_id, v_reserved_until;
end;
$$;

revoke all on function public.reserve_event_seat(uuid) from public, anon;
grant execute on function public.reserve_event_seat(uuid) to authenticated;
