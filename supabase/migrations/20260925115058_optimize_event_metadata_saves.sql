-- Metadata-only event edits must not touch canonical seat inventory.
create or replace function public.refresh_ticket_type_inventory(p_ticket_type_ids uuid[])
returns void language sql set search_path to '' as $$
  with ids as (
    select distinct id from unnest(coalesce(p_ticket_type_ids, '{}'::uuid[])) as id
    where id is not null
  ), counts as (
    select ids.id, count(es.id)::integer as total_count,
      count(es.id) filter (where es.status = 'available')::integer as available_count
    from ids left join public.event_seats es on es.ticket_type_id = ids.id
    group by ids.id
  )
  update public.ticket_types tt
  set total_quantity = counts.total_count, available_quantity = counts.available_count
  from counts
  where tt.id = counts.id
    and (tt.total_quantity, tt.available_quantity)
      is distinct from (counts.total_count, counts.available_count);
$$;

create or replace function public.sync_ticket_inventory_after_insert()
returns trigger language plpgsql set search_path to '' as $$
begin
  perform public.refresh_ticket_type_inventory(array(
    select distinct ticket_type_id from new_rows where ticket_type_id is not null
  ));
  return null;
end;
$$;

create or replace function public.sync_ticket_inventory_after_delete()
returns trigger language plpgsql set search_path to '' as $$
begin
  perform public.refresh_ticket_type_inventory(array(
    select distinct ticket_type_id from old_rows where ticket_type_id is not null
  ));
  return null;
end;
$$;

create or replace function public.sync_ticket_inventory_after_update()
returns trigger language plpgsql set search_path to '' as $$
begin
  perform public.refresh_ticket_type_inventory(array(
    select distinct ticket_type_id from (
      select n.ticket_type_id from new_rows n join old_rows o using (id)
      where n.status is distinct from o.status or n.ticket_type_id is distinct from o.ticket_type_id
      union
      select o.ticket_type_id from new_rows n join old_rows o using (id)
      where n.status is distinct from o.status or n.ticket_type_id is distinct from o.ticket_type_id
    ) changed where ticket_type_id is not null
  ));
  return null;
end;
$$;

drop trigger if exists sync_legacy_ticket_inventory on public.event_seats;
create trigger sync_ticket_inventory_after_insert
after insert on public.event_seats referencing new table as new_rows
for each statement execute function public.sync_ticket_inventory_after_insert();
create trigger sync_ticket_inventory_after_delete
after delete on public.event_seats referencing old table as old_rows
for each statement execute function public.sync_ticket_inventory_after_delete();
create trigger sync_ticket_inventory_after_update
after update on public.event_seats referencing old table as old_rows new table as new_rows
for each statement execute function public.sync_ticket_inventory_after_update();

create or replace function public.admin_event_inventory_matches(p_event_id uuid, p_ticket_inventory jsonb)
returns boolean language sql security definer set search_path to '' as $$
  with requested as (
    select canonical_tier, quantity, price from jsonb_to_recordset(p_ticket_inventory)
      as inventory(canonical_tier text, quantity integer, price numeric)
  ), current as (
    select tt.canonical_tier, tt.price,
      count(es.id) filter (where es.status in ('available', 'reserved', 'sold'))::integer as quantity
    from public.ticket_types tt left join public.event_seats es on es.ticket_type_id = tt.id
    where tt.event_id = p_event_id group by tt.id
  )
  select (select count(*) from requested) = 4
    and (select count(*) from requested where canonical_tier in ('cheap','medium','expensive','vip')) = 4
    and not exists (
      select 1 from (values ('cheap'::text), ('medium'::text), ('expensive'::text), ('vip'::text)) tiers(canonical_tier)
      left join requested r using (canonical_tier)
      left join current c using (canonical_tier)
      where r.canonical_tier is null or c.canonical_tier is null
        or r.quantity is distinct from c.quantity or r.price is distinct from c.price
    );
$$;

create or replace function public.admin_update_event_metadata(p_event_id uuid, p_event jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_event public.events%rowtype; v_venue_id uuid; v_title text; v_performer text;
  v_description text; v_category_id uuid; v_event_date date; v_event_time time;
  v_doors_open time; v_image_url text; v_status text;
begin
  if not exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())) then
    raise exception 'Administrator access is required.';
  end if;
  if jsonb_typeof(p_event) <> 'object' then raise exception 'A complete event payload is required.'; end if;
  v_title := nullif(btrim(coalesce(p_event->>'title','')), '');
  v_performer := nullif(btrim(coalesce(p_event->>'performer','')), '');
  v_description := nullif(btrim(coalesce(p_event->>'description','')), '');
  v_category_id := nullif(p_event->>'category_id','')::uuid;
  v_event_date := nullif(p_event->>'event_date','')::date;
  v_event_time := nullif(p_event->>'event_time','')::time;
  v_doors_open := nullif(p_event->>'doors_open','')::time;
  v_image_url := nullif(btrim(coalesce(p_event->>'image_url','')), '');
  v_status := coalesce(nullif(p_event->>'status',''),'active');
  v_venue_id := nullif(p_event->>'venue_id','')::uuid;
  if v_title is null or v_performer is null or v_description is null or v_category_id is null
    or v_event_date is null or v_event_time is null or v_doors_open is null
    or v_image_url is null or v_venue_id is null then
    raise exception 'Complete the required event details, schedule, venue, and media fields.';
  end if;
  if v_status not in ('active','cancelled','completed') then raise exception 'Choose a valid event status.'; end if;
  if not exists (select 1 from public.categories c where c.id=v_category_id) then raise exception 'Choose a valid event category.'; end if;
  select * into v_event from public.events e where e.id=p_event_id for update;
  if not found then raise exception 'Event not found.'; end if;
  if v_event.venue_id <> v_venue_id then raise exception 'Venue cannot be changed after canonical event inventory has been created.'; end if;
  update public.events e
  set title=v_title, performer=v_performer, category_id=v_category_id, description=v_description,
      event_date=v_event_date, event_time=v_event_time, doors_open=v_doors_open,
      image_url=v_image_url, status=v_status
  where e.id=p_event_id
    and (e.title,e.performer,e.category_id,e.description,e.event_date,e.event_time,e.doors_open,e.image_url,e.status)
      is distinct from (v_title,v_performer,v_category_id,v_description,v_event_date,v_event_time,v_doors_open,v_image_url,v_status);
  return p_event_id;
end;
$$;

create or replace function public.admin_save_event_with_display_order(p_event_id uuid, p_event jsonb, p_ticket_inventory jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_event_id uuid; v_placement jsonb; v_mode text; v_position_text text; v_position integer;
begin
  if not exists (select 1 from public.admin_users admin where admin.user_id = (select auth.uid())) then raise exception 'Administrator access is required.'; end if;
  if jsonb_typeof(p_event) <> 'object' then raise exception 'A complete event payload is required.'; end if;
  v_placement := coalesce(p_event -> 'placement', jsonb_build_object('mode','automatic'));
  if jsonb_typeof(v_placement) <> 'object' then raise exception 'Choose a valid listing placement.'; end if;
  v_mode := lower(coalesce(nullif(btrim(v_placement->>'mode'),''),'automatic'));
  if v_mode not in ('automatic','first','last','custom') then raise exception 'Choose Automatic, First, Last, or Custom placement.'; end if;
  v_position_text := nullif(btrim(coalesce(v_placement->>'position','')),'');
  if v_position_text is not null then
    if v_position_text !~ '^[1-9][0-9]*$' then raise exception 'Listing position must be a positive whole number.'; end if;
    v_position := v_position_text::integer;
  end if;
  if v_mode='custom' and v_position is null then raise exception 'Choose a page and position for custom placement.'; end if;
  lock table public.events in share row exclusive mode;
  if p_event_id is not null and public.admin_event_inventory_matches(p_event_id,p_ticket_inventory) then
    v_event_id := public.admin_update_event_metadata(p_event_id,p_event - 'placement');
  else
    v_event_id := public.admin_save_event_with_inventory(p_event_id,p_event - 'placement',p_ticket_inventory);
  end if;
  perform public.admin_reposition_event_display_order(v_event_id,v_mode,v_position);
  return v_event_id;
end;
$$;
