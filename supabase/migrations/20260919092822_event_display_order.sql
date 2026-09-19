-- Canonical global ordering for public event listings. Pagination remains a
-- presentation concern; it is calculated after this order is loaded.

alter table public.events
  add column if not exists display_order integer;

-- Preserve the public order that existed before this column: chronological,
-- with stable created-at and id tie-breakers for events sharing a time.
with ordered_events as (
  select
    event.id,
    row_number() over (
      order by event.event_date asc, event.event_time asc, event.created_at asc, event.id asc
    )::integer as position
  from public.events event
)
update public.events event
set display_order = ordered_events.position
from ordered_events
where event.id = ordered_events.id;

alter table public.events
  alter column display_order set not null;

alter table public.events
  drop constraint if exists events_display_order_positive;

alter table public.events
  add constraint events_display_order_positive check (display_order > 0);

alter table public.events
  drop constraint if exists events_display_order_key;

alter table public.events
  add constraint events_display_order_key
  unique (display_order) deferrable initially deferred;

-- The legacy atomic event-save RPC predates display_order. This trigger keeps
-- its inserts valid while the new wrapper below supplies explicit placement.
create or replace function public.assign_event_display_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.display_order is null then
    -- This is a defensive path for existing admin-only writers. The placement
    -- RPC also locks events before it writes, and this lock covers any direct
    -- legacy writer that omits display_order.
    perform pg_advisory_xact_lock(hashtext('public.events.display_order'));

    select coalesce(max(event.display_order), 0) + 1
    into new.display_order
    from public.events event;
  end if;

  return new;
end;
$$;

drop trigger if exists assign_event_display_order on public.events;
create trigger assign_event_display_order
before insert on public.events
for each row execute function public.assign_event_display_order();

create or replace function public.admin_reposition_event_display_order(
  p_event_id uuid,
  p_mode text,
  p_target_position integer default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_total integer;
  v_target integer;
  v_mode text := lower(coalesce(nullif(btrim(p_mode), ''), 'automatic'));
begin
  if not exists (
    select 1
    from public.admin_users admin
    where admin.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;

  lock table public.events in share row exclusive mode;

  select *
  into v_event
  from public.events event
  where event.id = p_event_id
  for update;
  if not found then
    raise exception 'Event not found.';
  end if;

  select count(*)::integer into v_total from public.events;
  if v_total < 1 then
    raise exception 'No events are available to position.';
  end if;

  case v_mode
    when 'first' then
      v_target := 1;
    when 'last' then
      v_target := v_total;
    when 'custom' then
      if p_target_position is null
        or p_target_position < 1
        or p_target_position > v_total then
        raise exception 'Choose a listing position between 1 and %.', v_total;
      end if;
      v_target := p_target_position;
    when 'automatic' then
      -- Match the previous public default: chronological order.
      select count(*)::integer + 1
      into v_target
      from public.events candidate
      where candidate.id <> p_event_id
        and (
          candidate.event_date,
          candidate.event_time,
          candidate.created_at,
          candidate.id
        ) <= (
          v_event.event_date,
          v_event.event_time,
          v_event.created_at,
          v_event.id
        );
    else
      raise exception 'Choose Automatic, First, Last, or Custom placement.';
  end case;

  -- Rank the remaining rows, open one position at the requested destination,
  -- and assign every final rank in the same transaction. The deferrable unique
  -- constraint permits this collision-free final state to be applied at once.
  with remaining_events as (
    select
      event.id,
      row_number() over (order by event.display_order asc, event.id asc)::integer as position
    from public.events event
    where event.id <> p_event_id
  ), positioned_events as (
    select
      remaining_events.id,
      case
        when remaining_events.position >= v_target then remaining_events.position + 1
        else remaining_events.position
      end as position
    from remaining_events
    union all
    select p_event_id, v_target
  )
  update public.events event
  set display_order = positioned_events.position
  from positioned_events
  where event.id = positioned_events.id;

  return v_target;
end;
$$;

-- This wrapper retains the existing atomic inventory workflow and extends it
-- with server-side placement in the same transaction.
create or replace function public.admin_save_event_with_display_order(
  p_event_id uuid,
  p_event jsonb,
  p_ticket_inventory jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_placement jsonb;
  v_mode text;
  v_position_text text;
  v_position integer;
begin
  if not exists (
    select 1
    from public.admin_users admin
    where admin.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;

  if jsonb_typeof(p_event) <> 'object' then
    raise exception 'A complete event payload is required.';
  end if;

  v_placement := coalesce(p_event -> 'placement', jsonb_build_object('mode', 'automatic'));
  if jsonb_typeof(v_placement) <> 'object' then
    raise exception 'Choose a valid listing placement.';
  end if;

  v_mode := lower(coalesce(nullif(btrim(v_placement ->> 'mode'), ''), 'automatic'));
  if v_mode not in ('automatic', 'first', 'last', 'custom') then
    raise exception 'Choose Automatic, First, Last, or Custom placement.';
  end if;

  v_position_text := nullif(btrim(coalesce(v_placement ->> 'position', '')), '');
  if v_position_text is not null then
    if v_position_text !~ '^[1-9][0-9]*$' then
      raise exception 'Listing position must be a positive whole number.';
    end if;
    v_position := v_position_text::integer;
  end if;
  if v_mode = 'custom' and v_position is null then
    raise exception 'Choose a page and position for custom placement.';
  end if;

  lock table public.events in share row exclusive mode;

  v_event_id := public.admin_save_event_with_inventory(
    p_event_id,
    p_event - 'placement',
    p_ticket_inventory
  );

  perform public.admin_reposition_event_display_order(v_event_id, v_mode, v_position);
  return v_event_id;
end;
$$;

create or replace function public.admin_delete_event_with_display_order(
  p_event_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if not exists (
    select 1
    from public.admin_users admin
    where admin.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;

  lock table public.events in share row exclusive mode;

  select event.id
  into v_event_id
  from public.events event
  where event.id = p_event_id
  for update;
  if not found then
    raise exception 'Event not found.';
  end if;

  delete from public.events event where event.id = v_event_id;

  with resequenced_events as (
    select
      event.id,
      row_number() over (order by event.display_order asc, event.id asc)::integer as position
    from public.events event
  )
  update public.events event
  set display_order = resequenced_events.position
  from resequenced_events
  where event.id = resequenced_events.id;

  return true;
end;
$$;

revoke all on function public.assign_event_display_order() from public, anon, authenticated;
revoke all on function public.admin_reposition_event_display_order(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.admin_save_event_with_display_order(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.admin_delete_event_with_display_order(uuid) from public, anon;
grant execute on function public.admin_save_event_with_display_order(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.admin_delete_event_with_display_order(uuid) to authenticated;
