-- An expired reservation no longer authorizes an exact cart entry. Keep the
-- canonical event_seats state and cart_items synchronized in one operation.
create or replace function public.expire_event_seat_reservations(p_event_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired_seats as (
    update public.event_seats
    set status = 'available',
        reserved_by = null,
        reserved_until = null,
        updated_at = now()
    where status = 'reserved'
      and reserved_until <= now()
      and (p_event_id is null or event_id = p_event_id)
    returning id
  ), removed_exact_cart_rows as (
    delete from public.cart_items as ci
    using expired_seats as es
    where ci.event_seat_id = es.id
    returning ci.id
  )
  select count(*) into v_count from expired_seats;

  return v_count;
end;
$$;
