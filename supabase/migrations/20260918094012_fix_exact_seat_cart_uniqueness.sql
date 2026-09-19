-- Exact-seat carts are identified by canonical event_seat_id. The former
-- global (user_id, ticket_type_id) constraint belongs only to legacy
-- aggregate cart rows, whose event_seat_id is NULL.

-- Reconcile only invalid exact cart rows. A valid exact cart entry must still
-- be owned by its user through a live reservation. This leaves valid exact
-- entries and all legacy aggregate rows untouched.
delete from public.cart_items as ci
where ci.event_seat_id is not null
  and not exists (
    select 1
    from public.event_seats as es
    where es.id = ci.event_seat_id
      and es.status = 'reserved'
      and es.reserved_by = ci.user_id
      and es.reserved_until > now()
  );

-- The old table-level constraint blocked a customer from reserving two
-- distinct seats in the same ticket type.
alter table public.cart_items
  drop constraint if exists uq_user_ticket_cart;

-- Replace the weaker per-user exact-seat index with the canonical global
-- exact-seat identity invariant. Reservation ownership remains the first
-- concurrency guard; this is the cart-level backstop.
drop index if exists public.cart_items_user_event_seat_key;
create unique index cart_items_exact_event_seat_key
  on public.cart_items (event_seat_id)
  where event_seat_id is not null;

-- Preserve the previous aggregate-cart identity without applying it to exact
-- seat rows.
create unique index cart_items_legacy_user_ticket_type_key
  on public.cart_items (user_id, ticket_type_id)
  where event_seat_id is null;
