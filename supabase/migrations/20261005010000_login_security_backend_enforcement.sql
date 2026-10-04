create table if not exists public.login_security_proofs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_token_hash text not null,
  proof_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists login_security_proofs_lookup_idx
  on public.login_security_proofs(user_id, device_token_hash, expires_at desc);

alter table public.login_security_proofs enable row level security;
revoke all on public.login_security_proofs from anon, authenticated;

create table if not exists public.login_otp_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_token_hash text not null,
  window_started_at timestamptz not null default now(),
  last_requested_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0),
  primary key (user_id, device_token_hash)
);

alter table public.login_otp_rate_limits enable row level security;
revoke all on public.login_otp_rate_limits from anon, authenticated;

create or replace function public.login_security_allow_otp_request(
  p_user_id uuid,
  p_device_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit public.login_otp_rate_limits%rowtype;
begin
  if p_user_id is null or p_device_token_hash is null then
    return false;
  end if;
  select *
    into v_limit
  from public.login_otp_rate_limits
  where user_id = p_user_id and device_token_hash = p_device_token_hash
  for update;
  if not found then
    insert into public.login_otp_rate_limits(user_id, device_token_hash)
    values (p_user_id, p_device_token_hash);
    return true;
  end if;
  if v_limit.last_requested_at > now() - interval '60 seconds'
     or v_limit.window_started_at > now() - interval '15 minutes'
        and v_limit.request_count >= 5 then
    return false;
  end if;
  if v_limit.window_started_at <= now() - interval '15 minutes' then
    update public.login_otp_rate_limits
    set window_started_at = now(), last_requested_at = now(), request_count = 1
    where user_id = p_user_id and device_token_hash = p_device_token_hash;
  else
    update public.login_otp_rate_limits
    set last_requested_at = now(), request_count = request_count + 1
    where user_id = p_user_id and device_token_hash = p_device_token_hash;
  end if;
  return true;
end;
$$;

create or replace function public.login_security_record_failed_attempt(
  p_challenge_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  update public.login_otp_challenges
  set attempts = attempts + 1,
      consumed_at = case when attempts + 1 >= max_attempts then now() else consumed_at end
  where id = p_challenge_id
    and consumed_at is null
    and expires_at > now()
    and attempts < max_attempts
  returning attempts into v_attempts;
  return coalesce(v_attempts, -1);
end;
$$;

create or replace function public.login_security_consume_challenge(
  p_challenge_id uuid,
  p_otp_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.login_otp_challenges
  set consumed_at = now()
  where id = p_challenge_id
    and otp_hash = p_otp_hash
    and consumed_at is null
    and expires_at > now()
    and attempts < max_attempts;
  return found;
end;
$$;

revoke all on function public.login_security_allow_otp_request(uuid, text)
  from public, anon, authenticated;
revoke all on function public.login_security_record_failed_attempt(uuid)
  from public, anon, authenticated;
revoke all on function public.login_security_consume_challenge(uuid, text)
  from public, anon, authenticated;
grant execute on function public.login_security_allow_otp_request(uuid, text)
  to service_role;
grant execute on function public.login_security_record_failed_attempt(uuid)
  to service_role;
grant execute on function public.login_security_consume_challenge(uuid, text)
  to service_role;

create or replace function public.login_security_reserve_event_seat(
  p_user_id uuid,
  p_event_seat_id uuid
)
returns table(event_seat_id uuid, reserved_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket_type_id uuid;
  v_event_id uuid;
  v_status text;
  v_reserved_by uuid;
  v_current_reserved_until timestamptz;
  v_reserved_until timestamptz := now() + interval '10 minutes';
begin
  if p_user_id is null then
    raise exception 'Authentication is required to reserve a seat.';
  end if;
  perform public.assert_current_user_not_banned_for_user(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
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
    and (v_current_reserved_until <= now() or v_reserved_by = p_user_id)
  ) then
    raise exception 'This seat is no longer available.' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.event_seats active_seat
    join public.cart_items active_cart
      on active_cart.event_seat_id = active_seat.id
     and active_cart.user_id = p_user_id
    where active_seat.reserved_by = p_user_id
      and active_seat.status = 'reserved'
      and active_seat.reserved_until > now()
      and active_seat.event_id <> v_event_id
  ) then
    raise exception 'ACTIVE_RESERVATION_FOR_ANOTHER_EVENT' using errcode = 'P0001';
  end if;
  update public.event_seats
  set status = 'reserved', reserved_by = p_user_id,
      reserved_until = v_reserved_until, sold_at = null, updated_at = now()
  where id = p_event_seat_id;
  update public.cart_items
  set updated_at = now()
  where user_id = p_user_id and event_seat_id = p_event_seat_id;
  if not found then
    insert into public.cart_items (user_id, ticket_type_id, event_seat_id, quantity)
    values (p_user_id, v_ticket_type_id, p_event_seat_id, 1);
  end if;
  return query select p_event_seat_id, v_reserved_until;
end;
$$;

create or replace function public.login_security_release_event_seat(
  p_user_id uuid,
  p_event_seat_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released boolean;
begin
  if p_user_id is null then
    raise exception 'Authentication is required to release a seat.';
  end if;
  perform public.assert_current_user_not_banned_for_user(p_user_id);
  update public.event_seats
  set status = 'available', reserved_by = null, reserved_until = null, updated_at = now()
  where id = p_event_seat_id and status = 'reserved' and reserved_by = p_user_id;
  v_released := found;
  delete from public.cart_items
  where user_id = p_user_id and event_seat_id = p_event_seat_id;
  return v_released;
end;
$$;

create or replace function public.login_security_checkout_reserved_event_seats(
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_total numeric := 0;
  v_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'Authentication is required to checkout.';
  end if;
  perform public.assert_current_user_not_banned_for_user(p_user_id);
  perform public.expire_event_seat_reservations();
  create temporary table if not exists pg_temp.checkout_event_seats on commit drop as
  select es.id, es.event_id, es.ticket_type_id, es.unit_price
  from public.event_seats es
  where es.status = 'reserved'
    and es.reserved_by = p_user_id
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
  values (p_user_id, v_total, 'paid')
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
  where user_id = p_user_id
    and event_seat_id in (select id from pg_temp.checkout_event_seats);
  return v_order_id;
end;
$$;

-- The Edge Function is the only caller. The helper below is intentionally
-- service-role-only and preserves the existing ban check through its user ID.
create or replace function public.assert_current_user_not_banned_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or exists (
    select 1
    from public.user_bans
    where user_id = p_user_id
      and unbanned_at is null
      and (is_permanent or banned_until > now())
  ) then
    raise exception 'This account is currently restricted.';
  end if;
end;
$$;

revoke all on function public.assert_current_user_not_banned_for_user(uuid)
  from public, anon, authenticated;
revoke all on function public.login_security_reserve_event_seat(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.login_security_release_event_seat(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.login_security_checkout_reserved_event_seats(uuid)
  from public, anon, authenticated;
grant execute on function public.assert_current_user_not_banned_for_user(uuid) to service_role;
grant execute on function public.login_security_reserve_event_seat(uuid, uuid) to service_role;
grant execute on function public.login_security_release_event_seat(uuid, uuid) to service_role;
grant execute on function public.login_security_checkout_reserved_event_seats(uuid) to service_role;
