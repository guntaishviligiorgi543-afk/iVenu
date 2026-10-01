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

  -- Serializes reservation attempts for this user across browser tabs. The lock
  -- is released automatically at the end of this RPC transaction.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  -- Lock the requested inventory row before checking or changing its state.
  select es.event_id, es.ticket_type_id, es.status, es.reserved_by, es.reserved_until
    into v_event_id, v_ticket_type_id, v_status, v_reserved_by, v_current_reserved_until
  from public.event_seats es
  join public.events e on e.id = es.event_id and e.status = 'active'
  where es.id = p_event_seat_id
  for update of es;

  if v_event_id is null then
    raise exception 'This seat is no longer available.' using errcode = 'P0001';
  end if;

  if v_status <> 'available'
     and not (
       v_status = 'reserved'
       and (v_current_reserved_until <= now() or v_reserved_by = v_user_id)
     ) then
    raise exception 'This seat is no longer available.' using errcode = 'P0001';
  end if;

  -- Only a live, canonical seat reservation with its matching cart row counts.
  -- Seats from the current event remain allowed; another event is rejected.
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
  set status = 'reserved',
      reserved_by = v_user_id,
      reserved_until = v_reserved_until,
      sold_at = null,
      updated_at = now()
  where id = p_event_seat_id;

  update public.cart_items ci
  set updated_at = now()
  where ci.user_id = v_user_id
    and ci.event_seat_id = p_event_seat_id;

  if not found then
    insert into public.cart_items (user_id, ticket_type_id, event_seat_id, quantity)
    values (v_user_id, v_ticket_type_id, p_event_seat_id, 1);
  end if;

  return query select p_event_seat_id, v_reserved_until;
end;
$$;;
