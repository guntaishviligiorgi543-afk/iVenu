-- The event wizard submits one payload. This function validates and applies the
-- event plus its canonical inventory in one database transaction.

create or replace function public.get_admin_event_creation_context()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not exists (
    select 1 from public.admin_users admin where admin.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;

  select jsonb_build_object(
    'venues', coalesce((
      select jsonb_agg(to_jsonb(venue_row) order by venue_row.name)
      from (
        select
          venue.id,
          venue.name,
          venue.city_area,
          venue.region,
          venue.country,
          venue.address,
          count(venue_seat.id)::integer as physical_capacity,
          coalesce((
            select jsonb_object_agg(section_capacity.canonical_tier, section_capacity.capacity)
            from (
              select
                case section.code
                  when 'STANDARD' then 'cheap'
                  when 'PREMIUM' then 'medium'
                  when 'EXPENSIVE' then 'expensive'
                  when 'VIP' then 'vip'
                end as canonical_tier,
                count(section_seat.id)::integer as capacity
              from public.venue_sections section
              left join public.venue_seats section_seat
                on section_seat.section_id = section.id and section_seat.is_active
              where section.venue_id = venue.id
                and section.code in ('STANDARD', 'PREMIUM', 'EXPENSIVE', 'VIP')
              group by section.code
            ) section_capacity
          ), '{}'::jsonb) as tier_capacities
        from public.venues venue
        left join public.venue_seats venue_seat
          on venue_seat.venue_id = venue.id and venue_seat.is_active
        group by venue.id
      ) venue_row
    ), '[]'::jsonb),
    'ticket_colors', coalesce((
      select jsonb_object_agg(color_row.canonical_tier, color_row.display_color)
      from (
        select distinct on (ticket.canonical_tier)
          ticket.canonical_tier,
          ticket.display_color
        from public.ticket_types ticket
        where ticket.canonical_tier in ('cheap', 'medium', 'expensive', 'vip')
          and ticket.display_color ~ '^#[0-9A-Fa-f]{6}$'
        order by ticket.canonical_tier, ticket.created_at, ticket.id
      ) color_row
    ), '{}'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.admin_save_event_with_inventory(
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
  v_existing_event public.events%rowtype;
  v_venue public.venues%rowtype;
  v_title text;
  v_performer text;
  v_description text;
  v_category_id uuid;
  v_event_date date;
  v_event_time time;
  v_doors_open time;
  v_image_url text;
  v_status text;
  v_total_quantity integer;
  v_physical_capacity integer;
  v_ticket_id uuid;
  v_display_color text;
  v_protected_count integer;
  v_mutable_count integer;
  v_tier record;
begin
  if not exists (
    select 1 from public.admin_users admin where admin.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;

  if jsonb_typeof(p_event) <> 'object' or jsonb_typeof(p_ticket_inventory) <> 'array' then
    raise exception 'A complete event and ticket inventory are required.';
  end if;

  v_title := nullif(btrim(coalesce(p_event->>'title', '')), '');
  v_performer := nullif(btrim(coalesce(p_event->>'performer', '')), '');
  v_description := nullif(btrim(coalesce(p_event->>'description', '')), '');
  v_category_id := nullif(p_event->>'category_id', '')::uuid;
  v_event_date := nullif(p_event->>'event_date', '')::date;
  v_event_time := nullif(p_event->>'event_time', '')::time;
  v_doors_open := nullif(p_event->>'doors_open', '')::time;
  v_image_url := nullif(btrim(coalesce(p_event->>'image_url', '')), '');
  v_status := coalesce(nullif(p_event->>'status', ''), 'active');

  if v_title is null or v_performer is null or v_description is null
    or v_category_id is null or v_event_date is null or v_event_time is null
    or v_doors_open is null or v_image_url is null then
    raise exception 'Complete the required event details, schedule, venue, and media fields.';
  end if;
  if v_status not in ('active', 'cancelled', 'completed') then
    raise exception 'Choose a valid event status.';
  end if;
  if not exists (select 1 from public.categories category where category.id = v_category_id) then
    raise exception 'Choose a valid event category.';
  end if;

  select * into v_venue
  from public.venues venue
  where venue.id = nullif(p_event->>'venue_id', '')::uuid;
  if not found then
    raise exception 'Choose a valid venue.';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(p_ticket_inventory) as inventory(canonical_tier text, quantity integer, price numeric)
  ) <> 4
  or (
    select count(distinct inventory.canonical_tier)
    from jsonb_to_recordset(p_ticket_inventory) as inventory(canonical_tier text, quantity integer, price numeric)
    where inventory.canonical_tier in ('cheap', 'medium', 'expensive', 'vip')
  ) <> 4 then
    raise exception 'Configure Cheap / Standard, Medium / Premium, Expensive, and VIP exactly once.';
  end if;

  select count(venue_seat.id)::integer into v_physical_capacity
  from public.venue_seats venue_seat
  where venue_seat.venue_id = v_venue.id and venue_seat.is_active;
  if v_physical_capacity <= 0 then
    raise exception 'This venue has no active canonical seats.';
  end if;

  select coalesce(sum(inventory.quantity), 0)::integer into v_total_quantity
  from jsonb_to_recordset(p_ticket_inventory) as inventory(canonical_tier text, quantity integer, price numeric);
  if v_total_quantity > v_physical_capacity then
    raise exception 'Configured ticket quantity exceeds venue capacity by % seats.', v_total_quantity - v_physical_capacity;
  end if;

  for v_tier in
    select inventory.canonical_tier, inventory.quantity, inventory.price
    from jsonb_to_recordset(p_ticket_inventory) as inventory(canonical_tier text, quantity integer, price numeric)
    order by case inventory.canonical_tier
      when 'cheap' then 1 when 'medium' then 2 when 'expensive' then 3 when 'vip' then 4 else 5 end
  loop
    if v_tier.canonical_tier not in ('cheap', 'medium', 'expensive', 'vip')
      or v_tier.quantity is null or v_tier.quantity < 0
      or v_tier.price is null or v_tier.price < 0 then
      raise exception 'Each ticket tier needs a non-negative quantity and price.';
    end if;

    if v_tier.quantity > coalesce((
      select count(venue_seat.id)::integer
      from public.venue_seats venue_seat
      join public.venue_sections section on section.id = venue_seat.section_id
      where venue_seat.venue_id = v_venue.id
        and venue_seat.is_active
        and section.code = case v_tier.canonical_tier
          when 'cheap' then 'STANDARD'
          when 'medium' then 'PREMIUM'
          when 'expensive' then 'EXPENSIVE'
          when 'vip' then 'VIP'
        end
    ), 0) then
      raise exception 'Configured % seats exceed that tier''s physical venue inventory.', v_tier.canonical_tier;
    end if;
  end loop;

  if p_event_id is null then
    insert into public.events (
      title, performer, category_id, description, event_date, event_time, doors_open,
      venue_id, venue, city, country, image_url, status
    ) values (
      v_title, v_performer, v_category_id, v_description, v_event_date, v_event_time, v_doors_open,
      v_venue.id, v_venue.name, coalesce(v_venue.city_area, v_venue.region), v_venue.country,
      v_image_url, v_status
    ) returning id into v_event_id;
  else
    select * into v_existing_event
    from public.events event
    where event.id = p_event_id
    for update;
    if not found then
      raise exception 'Event not found.';
    end if;
    if v_existing_event.venue_id <> v_venue.id then
      raise exception 'Venue cannot be changed after canonical event inventory has been created.';
    end if;
    v_event_id := v_existing_event.id;
    update public.events event
    set title = v_title,
        performer = v_performer,
        category_id = v_category_id,
        description = v_description,
        event_date = v_event_date,
        event_time = v_event_time,
        doors_open = v_doors_open,
        venue = v_venue.name,
        city = coalesce(v_venue.city_area, v_venue.region),
        country = v_venue.country,
        image_url = v_image_url,
        status = v_status
    where event.id = v_event_id;
  end if;

  for v_tier in
    select inventory.canonical_tier, inventory.quantity, inventory.price
    from jsonb_to_recordset(p_ticket_inventory) as inventory(canonical_tier text, quantity integer, price numeric)
  loop
    select ticket.display_color into v_display_color
    from public.ticket_types ticket
    where ticket.canonical_tier = v_tier.canonical_tier
      and ticket.display_color ~ '^#[0-9A-Fa-f]{6}$'
    order by ticket.created_at, ticket.id
    limit 1;
    if v_display_color is null then
      raise exception 'No configured map color exists for the % ticket tier.', v_tier.canonical_tier;
    end if;

    select ticket.id into v_ticket_id
    from public.ticket_types ticket
    where ticket.event_id = v_event_id and ticket.canonical_tier = v_tier.canonical_tier
    for update;

    if v_ticket_id is null then
      insert into public.ticket_types (
        event_id, name, canonical_tier, price, display_color,
        total_quantity, available_quantity, is_active
      ) values (
        v_event_id,
        case v_tier.canonical_tier
          when 'cheap' then 'Cheap / Standard'
          when 'medium' then 'Medium / Premium'
          when 'expensive' then 'Expensive'
          when 'vip' then 'VIP'
        end,
        v_tier.canonical_tier,
        v_tier.price,
        v_display_color,
        0,
        0,
        true
      ) returning id into v_ticket_id;
    else
      update public.ticket_types ticket
      set price = v_tier.price,
          display_color = v_display_color,
          is_active = true
      where ticket.id = v_ticket_id;
    end if;
  end loop;

  if p_event_id is null then
    with physical_seats as (
      select
        venue_seat.id as venue_seat_id,
        case section.code
          when 'STANDARD' then 'cheap'
          when 'PREMIUM' then 'medium'
          when 'EXPENSIVE' then 'expensive'
          when 'VIP' then 'vip'
        end as canonical_tier,
        row_number() over (
          partition by section.code
          order by venue_seat.row_number, venue_seat.seat_number, venue_seat.id
        ) as seat_rank
      from public.venue_seats venue_seat
      join public.venue_sections section on section.id = venue_seat.section_id
      where venue_seat.venue_id = v_venue.id
        and venue_seat.is_active
        and section.code in ('STANDARD', 'PREMIUM', 'EXPENSIVE', 'VIP')
    ), inventory as (
      select inventory.canonical_tier, inventory.quantity, inventory.price
      from jsonb_to_recordset(p_ticket_inventory) as inventory(canonical_tier text, quantity integer, price numeric)
    )
    insert into public.event_seats (event_id, venue_seat_id, ticket_type_id, unit_price, status)
    select
      v_event_id,
      physical_seat.venue_seat_id,
      ticket.id,
      inventory.price,
      case when physical_seat.seat_rank <= inventory.quantity then 'available' else 'blocked' end
    from physical_seats physical_seat
    join inventory on inventory.canonical_tier = physical_seat.canonical_tier
    join public.ticket_types ticket
      on ticket.event_id = v_event_id and ticket.canonical_tier = physical_seat.canonical_tier;

    insert into public.event_seat_layouts (
      event_seat_id, event_id, venue_section_id, row_number, seat_number
    )
    select event_seat.id, event_seat.event_id, venue_seat.section_id, venue_seat.row_number, venue_seat.seat_number
    from public.event_seats event_seat
    join public.venue_seats venue_seat on venue_seat.id = event_seat.venue_seat_id
    where event_seat.event_id = v_event_id;
  else
    for v_tier in
      select inventory.canonical_tier, inventory.quantity, inventory.price
      from jsonb_to_recordset(p_ticket_inventory) as inventory(canonical_tier text, quantity integer, price numeric)
    loop
      select ticket.id into v_ticket_id
      from public.ticket_types ticket
      where ticket.event_id = v_event_id and ticket.canonical_tier = v_tier.canonical_tier;

      select count(*)::integer into v_protected_count
      from public.event_seats event_seat
      where event_seat.event_id = v_event_id
        and event_seat.ticket_type_id = v_ticket_id
        and event_seat.status in ('reserved', 'sold');
      if v_tier.quantity < v_protected_count then
        raise exception 'Cannot reduce % inventory below its % sold or reserved seats.', v_tier.canonical_tier, v_protected_count;
      end if;

      with mutable_seats as (
        select
          event_seat.id,
          row_number() over (order by venue_seat.row_number, venue_seat.seat_number, event_seat.id) as mutable_rank
        from public.event_seats event_seat
        join public.venue_seats venue_seat on venue_seat.id = event_seat.venue_seat_id
        where event_seat.event_id = v_event_id
          and event_seat.ticket_type_id = v_ticket_id
          and event_seat.status in ('available', 'blocked')
      )
      update public.event_seats event_seat
      set status = case
            when mutable_seats.mutable_rank <= v_tier.quantity - v_protected_count then 'available'
            else 'blocked'
          end,
          unit_price = v_tier.price,
          updated_at = now()
      from mutable_seats
      where event_seat.id = mutable_seats.id;

      select count(*)::integer into v_mutable_count
      from public.event_seats event_seat
      where event_seat.event_id = v_event_id and event_seat.ticket_type_id = v_ticket_id;
      if v_mutable_count < v_tier.quantity then
        raise exception 'The existing % inventory cannot provide % seats.', v_tier.canonical_tier, v_tier.quantity;
      end if;
    end loop;
  end if;

  insert into public.event_section_configs (
    event_id, venue_section_id, name, display_order, ticket_type_id,
    rows, seats_per_row, is_enabled
  )
  select
    v_event_id,
    section.id,
    section.name,
    section.display_order,
    ticket.id,
    greatest(max(venue_seat.row_number), 1),
    greatest(max(venue_seat.seat_number), 1),
    true
  from public.venue_sections section
  join public.venue_seats venue_seat on venue_seat.section_id = section.id and venue_seat.is_active
  join public.ticket_types ticket
    on ticket.event_id = v_event_id
    and ticket.canonical_tier = case section.code
      when 'STANDARD' then 'cheap'
      when 'PREMIUM' then 'medium'
      when 'EXPENSIVE' then 'expensive'
      when 'VIP' then 'vip'
    end
  where section.venue_id = v_venue.id
    and section.code in ('STANDARD', 'PREMIUM', 'EXPENSIVE', 'VIP')
  group by section.id, section.name, section.display_order, ticket.id
  on conflict (event_id, venue_section_id) do update
  set name = excluded.name,
      display_order = excluded.display_order,
      ticket_type_id = excluded.ticket_type_id,
      rows = excluded.rows,
      seats_per_row = excluded.seats_per_row,
      is_enabled = true,
      updated_at = now();

  return v_event_id;
end;
$$;

-- The wizard inserts its event and canonical tiers in the same transaction.
-- Deferring the active-event assertion makes that valid while retaining the
-- protection at transaction commit. Zero-quantity tiers are valid and simply
-- receive no sellable seats; their physical event seats remain blocked.
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
    ) required_tier(canonical_tier)
    left join public.ticket_types ticket
      on ticket.event_id = new.id and ticket.canonical_tier = required_tier.canonical_tier
    where ticket.id is null
      or not ticket.is_active
      or ticket.price is null
      or ticket.price < 0
      or coalesce(ticket.display_color, '') !~ '^#[0-9A-Fa-f]{6}$'
  ) then
    raise exception 'An active event requires all four canonical ticket tiers to be active, priced, and colored.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_active_event_ticket_tiers on public.events;
create constraint trigger enforce_active_event_ticket_tiers
after insert or update of status on public.events
deferrable initially deferred
for each row execute function public.enforce_active_event_ticket_tiers();

revoke all on function public.get_admin_event_creation_context() from public, anon;
revoke all on function public.admin_save_event_with_inventory(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.get_admin_event_creation_context() to authenticated;
grant execute on function public.admin_save_event_with_inventory(uuid, jsonb, jsonb) to authenticated;
