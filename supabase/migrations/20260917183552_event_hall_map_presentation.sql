-- Hall-map presentation only. Canonical inventory and reservation records are intentionally untouched.

alter table public.venues
  add column if not exists hall_map_template text;

update public.venues
set hall_map_template = case
  when lower(name) = 'black sea arena' then 'black_sea_arena'
  when lower(name) = 'dinamo arena' then 'stadium'
  when lower(name) = 'rustaveli national theatre' then 'theatre'
  else 'generic'
end
where hall_map_template is null;

alter table public.venues
  alter column hall_map_template set default 'generic',
  alter column hall_map_template set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'venues_hall_map_template_check'
  ) then
    alter table public.venues add constraint venues_hall_map_template_check
      check (hall_map_template in ('black_sea_arena', 'stadium', 'theatre', 'generic'));
  end if;
end;
$$;

alter table public.ticket_types
  add column if not exists display_color text not null default '#2878ff';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ticket_types_display_color_check'
  ) then
    alter table public.ticket_types add constraint ticket_types_display_color_check
      check (display_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end;
$$;

alter table public.event_section_configs
  add column if not exists position_x numeric(6,2) not null default 40,
  add column if not exists position_y numeric(6,2) not null default 40,
  add column if not exists layout_width numeric(6,2) not null default 20,
  add column if not exists layout_height numeric(6,2) not null default 12,
  add column if not exists rotation numeric(7,2) not null default 0,
  add column if not exists layout_shape text not null default 'rounded',
  add column if not exists layout_is_custom boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_section_configs_position_x_check') then
    alter table public.event_section_configs add constraint event_section_configs_position_x_check check (position_x between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_section_configs_position_y_check') then
    alter table public.event_section_configs add constraint event_section_configs_position_y_check check (position_y between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_section_configs_layout_width_check') then
    alter table public.event_section_configs add constraint event_section_configs_layout_width_check check (layout_width > 0 and layout_width <= 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_section_configs_layout_height_check') then
    alter table public.event_section_configs add constraint event_section_configs_layout_height_check check (layout_height > 0 and layout_height <= 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_section_configs_rotation_check') then
    alter table public.event_section_configs add constraint event_section_configs_rotation_check check (rotation between -180 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_section_configs_layout_shape_check') then
    alter table public.event_section_configs add constraint event_section_configs_layout_shape_check check (layout_shape in ('rectangle', 'rounded', 'trapezoid', 'arc'));
  end if;
end;
$$;

create table public.event_hall_map_configs (
  event_id uuid primary key references public.events(id) on delete cascade,
  -- NULL means that the event inherits its default template from venues.hall_map_template.
  layout_template text,
  focal_type text not null default 'stage',
  focal_label text not null default 'STAGE',
  focal_x numeric(6,2) not null default 35,
  focal_y numeric(6,2) not null default 6,
  focal_width numeric(6,2) not null default 30,
  focal_height numeric(6,2) not null default 10,
  focal_rotation numeric(7,2) not null default 0,
  focal_shape text not null default 'rounded',
  updated_at timestamptz not null default now(),
  check (layout_template is null or layout_template in ('black_sea_arena', 'stadium', 'theatre', 'generic')),
  check (focal_type in ('stage', 'field')),
  check (focal_x between 0 and 100 and focal_y between 0 and 100),
  check (focal_width > 0 and focal_width <= 100 and focal_height > 0 and focal_height <= 100),
  check (focal_rotation between -180 and 180),
  check (focal_shape in ('rectangle', 'rounded', 'oval'))
);

alter table public.event_hall_map_configs enable row level security;

create policy "Admins manage event hall map configs" on public.event_hall_map_configs
for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

-- Presentation colors are deterministic by price rank, not ticket-type name.
with ranked as (
  select id, row_number() over (partition by event_id order by price, id) as color_rank
  from public.ticket_types
)
update public.ticket_types tt
set display_color = case ((ranked.color_rank - 1) % 6)
  when 0 then '#2878ff'
  when 1 then '#16a085'
  when 2 then '#f5be1e'
  when 3 then '#e63232'
  when 4 then '#8e44ad'
  else '#d35400'
end
from ranked
where ranked.id = tt.id;

-- Existing events inherit the venue template. The focal element is only visual metadata.
insert into public.event_hall_map_configs (
  event_id, focal_type, focal_label, focal_x, focal_y, focal_width, focal_height, focal_rotation, focal_shape
)
select e.id,
  case when v.hall_map_template = 'stadium' then 'field' else 'stage' end,
  case when v.hall_map_template = 'stadium' then 'FIELD' else 'STAGE' end,
  case v.hall_map_template when 'stadium' then 28 when 'generic' then 35 else 35 end,
  case v.hall_map_template when 'stadium' then 27 when 'generic' then 40 else 6 end,
  case v.hall_map_template when 'stadium' then 44 when 'generic' then 30 else 30 end,
  case v.hall_map_template when 'stadium' then 45 when 'generic' then 12 else 10 end,
  0,
  case when v.hall_map_template = 'stadium' then 'oval' else 'rounded' end
from public.events e
join public.venues v on v.id = e.venue_id
on conflict (event_id) do nothing;

-- Initial positions are a one-time template default. Ticket-price rank supplies hierarchy;
-- ticket type names and inventory counts have no part in this calculation.
with ranked as (
  select cfg.id, v.hall_map_template,
    dense_rank() over (partition by cfg.event_id order by tt.price desc, cfg.display_order, cfg.id) as price_rank
  from public.event_section_configs cfg
  join public.events e on e.id = cfg.event_id
  join public.venues v on v.id = e.venue_id
  join public.ticket_types tt on tt.id = cfg.ticket_type_id
)
update public.event_section_configs cfg
set
  position_x = case ranked.hall_map_template
    when 'black_sea_arena' then case ranked.price_rank when 1 then 40 when 2 then 27 when 3 then 20 else 12 end
    when 'stadium' then case ranked.price_rank when 1 then 40 when 2 then 27 when 3 then 7 else 77 end
    when 'theatre' then case ranked.price_rank when 1 then 5 when 2 then 25 when 3 then 8 else 8 end
    else case ranked.price_rank when 1 then 42 when 2 then 30 when 3 then 12 else 63 end
  end,
  position_y = case ranked.hall_map_template
    when 'black_sea_arena' then case ranked.price_rank when 1 then 23 when 2 then 38 when 3 then 56 else 74 end
    when 'stadium' then case ranked.price_rank when 1 then 76 when 2 then 10 when 3 then 30 else 30 end
    when 'theatre' then case ranked.price_rank when 1 then 23 when 2 then 30 when 3 then 56 else 76 end
    else case ranked.price_rank when 1 then 51 when 2 then 65 when 3 then 32 else 32 end
  end,
  layout_width = case ranked.hall_map_template
    when 'black_sea_arena' then case ranked.price_rank when 1 then 20 when 2 then 46 when 3 then 60 else 76 end
    when 'stadium' then case ranked.price_rank when 1 then 20 when 2 then 46 else 16 end
    when 'theatre' then case ranked.price_rank when 1 then 14 when 2 then 50 else 84 end
    else case ranked.price_rank when 1 then 16 when 2 then 40 else 25 end
  end,
  layout_height = case ranked.hall_map_template
    when 'black_sea_arena' then case ranked.price_rank when 1 then 10 when 2 then 12 when 3 then 13 else 15 end
    when 'stadium' then case ranked.price_rank when 1 then 11 when 2 then 12 else 44 end
    when 'theatre' then case ranked.price_rank when 1 then 38 when 2 then 16 else 14 end
    else case ranked.price_rank when 1 then 10 when 2 then 14 else 15 end
  end,
  rotation = case ranked.hall_map_template
    when 'generic' then case ranked.price_rank when 3 then -15 when 4 then 15 else 0 end
    else 0
  end,
  layout_shape = case ranked.hall_map_template
    when 'black_sea_arena' then case ranked.price_rank when 1 then 'rounded' when 2 then 'trapezoid' when 3 then 'arc' else 'arc' end
    when 'stadium' then case ranked.price_rank when 3 then 'arc' when 4 then 'arc' else 'rounded' end
    when 'generic' then case ranked.price_rank when 3 then 'trapezoid' when 4 then 'trapezoid' else 'rounded' end
    else 'rounded'
  end
from ranked
where cfg.id = ranked.id and not cfg.layout_is_custom;

create or replace function public.get_event_hall_map_presentation(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not exists (select 1 from public.events e where e.id = p_event_id and e.status = 'active') then
    raise exception 'Event is unavailable.';
  end if;

  select jsonb_build_object(
    'layout_template', coalesce(map.layout_template, v.hall_map_template),
    'focal', jsonb_build_object(
      'type', map.focal_type, 'label', map.focal_label,
      'x', map.focal_x, 'y', map.focal_y, 'width', map.focal_width,
      'height', map.focal_height, 'rotation', map.focal_rotation, 'shape', map.focal_shape
    ),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'config_id', cfg.id, 'section_id', cfg.venue_section_id,
        'x', cfg.position_x, 'y', cfg.position_y,
        'width', cfg.layout_width, 'height', cfg.layout_height,
        'rotation', cfg.rotation, 'shape', cfg.layout_shape,
        'display_order', cfg.display_order, 'ticket_type_id', cfg.ticket_type_id,
        'ticket_color', tt.display_color
      ) order by cfg.display_order, cfg.name)
      from public.event_section_configs cfg
      join public.ticket_types tt on tt.id = cfg.ticket_type_id
      where cfg.event_id = e.id
    ), '[]'::jsonb)
  ) into v_result
  from public.events e
  join public.venues v on v.id = e.venue_id
  join public.event_hall_map_configs map on map.event_id = e.id
  where e.id = p_event_id;
  return v_result;
end;
$$;

create or replace function public.admin_set_event_ticket_type_color(
  p_event_id uuid,
  p_ticket_type_id uuid,
  p_display_color text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'Administrator access is required.';
  end if;
  if coalesce(p_display_color, '') !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Display color must be a six-digit hexadecimal color.';
  end if;
  update public.ticket_types
  set display_color = lower(p_display_color)
  where id = p_ticket_type_id and event_id = p_event_id;
  if not found then
    raise exception 'Ticket type does not belong to this event.';
  end if;
  return true;
end;
$$;

create or replace function public.admin_save_event_hall_map_layout(
  p_event_id uuid,
  p_layout_template text,
  p_focal jsonb,
  p_sections jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_focal_type text;
  v_focal_label text;
  v_focal_shape text;
  v_focal_x numeric;
  v_focal_y numeric;
  v_focal_width numeric;
  v_focal_height numeric;
  v_focal_rotation numeric;
  v_section record;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'Administrator access is required.';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found.';
  end if;
  if p_layout_template not in ('black_sea_arena', 'stadium', 'theatre', 'generic') then
    raise exception 'Choose a valid hall map template.';
  end if;
  if jsonb_typeof(p_focal) <> 'object' or jsonb_typeof(p_sections) <> 'array' then
    raise exception 'Hall map focal element and sections are required.';
  end if;

  v_focal_type := coalesce(p_focal ->> 'type', case when p_layout_template = 'stadium' then 'field' else 'stage' end);
  v_focal_label := nullif(btrim(coalesce(p_focal ->> 'label', '')), '');
  v_focal_shape := coalesce(p_focal ->> 'shape', 'rounded');
  v_focal_x := (p_focal ->> 'x')::numeric;
  v_focal_y := (p_focal ->> 'y')::numeric;
  v_focal_width := (p_focal ->> 'width')::numeric;
  v_focal_height := (p_focal ->> 'height')::numeric;
  v_focal_rotation := coalesce((p_focal ->> 'rotation')::numeric, 0);
  if v_focal_type not in ('stage', 'field') or v_focal_label is null
    or v_focal_shape not in ('rectangle', 'rounded', 'oval')
    or v_focal_x not between 0 and 100 or v_focal_y not between 0 and 100
    or v_focal_width not between 0.01 and 100 or v_focal_height not between 0.01 and 100
    or v_focal_rotation not between -180 and 180 then
    raise exception 'The focal element has invalid presentation values.';
  end if;

  insert into public.event_hall_map_configs (
    event_id, layout_template, focal_type, focal_label, focal_x, focal_y,
    focal_width, focal_height, focal_rotation, focal_shape, updated_at
  ) values (
    p_event_id, p_layout_template, v_focal_type, v_focal_label, v_focal_x, v_focal_y,
    v_focal_width, v_focal_height, v_focal_rotation, v_focal_shape, now()
  ) on conflict (event_id) do update set
    layout_template = excluded.layout_template,
    focal_type = excluded.focal_type,
    focal_label = excluded.focal_label,
    focal_x = excluded.focal_x, focal_y = excluded.focal_y,
    focal_width = excluded.focal_width, focal_height = excluded.focal_height,
    focal_rotation = excluded.focal_rotation, focal_shape = excluded.focal_shape,
    updated_at = now();

  for v_section in
    select * from jsonb_to_recordset(p_sections) as section_input(
      id uuid, position_x numeric, position_y numeric, layout_width numeric,
      layout_height numeric, rotation numeric, layout_shape text
    )
  loop
    if v_section.id is null or v_section.position_x not between 0 and 100
      or v_section.position_y not between 0 and 100
      or v_section.layout_width not between 0.01 and 100
      or v_section.layout_height not between 0.01 and 100
      or coalesce(v_section.rotation, 0) not between -180 and 180
      or v_section.layout_shape not in ('rectangle', 'rounded', 'trapezoid', 'arc') then
      raise exception 'A section has invalid presentation values.';
    end if;
    update public.event_section_configs
    set position_x = v_section.position_x, position_y = v_section.position_y,
        layout_width = v_section.layout_width, layout_height = v_section.layout_height,
        rotation = coalesce(v_section.rotation, 0), layout_shape = v_section.layout_shape,
        layout_is_custom = true, updated_at = now()
    where id = v_section.id and event_id = p_event_id;
    if not found then
      raise exception 'A section does not belong to this event.';
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.get_admin_event_seating_configuration(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'Administrator access is required.';
  end if;
  perform public.expire_event_seat_reservations(p_event_id);
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found.';
  end if;

  select jsonb_build_object(
    'event_id', e.id, 'event_title', e.title, 'venue_id', e.venue_id, 'venue_name', v.name,
    'hall_map', jsonb_build_object(
      'layout_template', coalesce(map.layout_template, v.hall_map_template),
      'uses_venue_default', map.layout_template is null,
      'focal', jsonb_build_object(
        'type', map.focal_type, 'label', map.focal_label, 'x', map.focal_x, 'y', map.focal_y,
        'width', map.focal_width, 'height', map.focal_height, 'rotation', map.focal_rotation, 'shape', map.focal_shape
      )
    ),
    'inventory', coalesce((
      select jsonb_build_object(
        'total', count(*)::integer, 'available', count(*) filter (where es.status = 'available')::integer,
        'reserved', count(*) filter (where es.status = 'reserved')::integer,
        'sold', count(*) filter (where es.status = 'sold')::integer,
        'blocked', count(*) filter (where es.status = 'blocked')::integer
      ) from public.event_seats es where es.event_id = e.id
    ), '{}'::jsonb),
    'ticket_types', coalesce((
      select jsonb_agg(to_jsonb(type_row) order by type_row.created_at, type_row.name)
      from (
        select tt.id, tt.name, tt.price, tt.is_active, tt.created_at, tt.display_color,
          count(es.id)::integer as capacity,
          count(es.id) filter (where es.status = 'available')::integer as available
        from public.ticket_types tt
        left join public.event_seats es on es.ticket_type_id = tt.id
        where tt.event_id = e.id
        group by tt.id
      ) type_row
    ), '[]'::jsonb),
    'zones', coalesce((
      select jsonb_agg(to_jsonb(zone_row) order by zone_row.display_order, zone_row.name)
      from (
        select cfg.id, cfg.venue_section_id as section_id, cfg.name, s.code,
          cfg.display_order, cfg.ticket_type_id, tt.name as ticket_type_name, tt.price,
          cfg.rows, cfg.seats_per_row, cfg.is_enabled, cfg.position_x, cfg.position_y,
          cfg.layout_width, cfg.layout_height, cfg.rotation, cfg.layout_shape, cfg.layout_is_custom,
          count(es.id)::integer as capacity,
          count(es.id) filter (where es.status = 'available')::integer as available,
          count(es.id) filter (where es.status = 'reserved')::integer as reserved,
          count(es.id) filter (where es.status = 'sold')::integer as sold,
          count(es.id) filter (where es.status = 'blocked')::integer as blocked
        from public.event_section_configs cfg
        join public.venue_sections s on s.id = cfg.venue_section_id
        join public.ticket_types tt on tt.id = cfg.ticket_type_id
        left join public.venue_seats vs on vs.section_id = cfg.venue_section_id
        left join public.event_seats es on es.event_id = cfg.event_id and es.venue_seat_id = vs.id
        where cfg.event_id = e.id
        group by cfg.id, s.code, tt.name, tt.price
      ) zone_row
    ), '[]'::jsonb)
  ) into v_result
  from public.events e
  join public.venues v on v.id = e.venue_id
  left join public.event_hall_map_configs map on map.event_id = e.id
  where e.id = p_event_id;
  return v_result;
end;
$$;

revoke all on function public.get_event_hall_map_presentation(uuid) from public;
revoke all on function public.admin_set_event_ticket_type_color(uuid, uuid, text) from public, anon;
revoke all on function public.admin_save_event_hall_map_layout(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.get_event_hall_map_presentation(uuid) to anon, authenticated;
grant execute on function public.admin_set_event_ticket_type_color(uuid, uuid, text) to authenticated;
grant execute on function public.admin_save_event_hall_map_layout(uuid, text, jsonb, jsonb) to authenticated;
