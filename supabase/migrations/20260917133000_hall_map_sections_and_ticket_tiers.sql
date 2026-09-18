-- Presentation-only Hall Map sections. This migration deliberately does not insert,
-- delete, or update public.event_seats, reservations, orders, or order_items.

alter table public.ticket_types
  add column if not exists canonical_tier text;

update public.ticket_types
set canonical_tier = case lower(btrim(name))
  when 'cheap / standard' then 'cheap'
  when 'medium / premium' then 'medium'
  when 'expensive' then 'expensive'
  when 'vip' then 'vip'
  else canonical_tier
end
where canonical_tier is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ticket_types_canonical_tier_check') then
    alter table public.ticket_types add constraint ticket_types_canonical_tier_check
      check (canonical_tier is null or canonical_tier in ('cheap', 'medium', 'expensive', 'vip'));
  end if;
end;
$$;

create unique index if not exists ticket_types_event_canonical_tier_unique_idx
  on public.ticket_types (event_id, canonical_tier)
  where canonical_tier is not null;

-- Fixed visual colors are keyed by canonical tier, not by ticket-type display text.
update public.ticket_types
set display_color = case canonical_tier
  when 'cheap' then '#2878ff'
  when 'medium' then '#16a085'
  when 'expensive' then '#e63232'
  when 'vip' then '#8e44ad'
  else display_color
end
where canonical_tier is not null;

alter table public.event_hall_map_configs
  add column if not exists decorations jsonb not null default '[]'::jsonb;

create table public.event_hall_map_sections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  ticket_type_id uuid not null,
  slot_key text not null,
  display_label text not null,
  display_order integer not null,
  position_x numeric(6,2) not null,
  position_y numeric(6,2) not null,
  layout_width numeric(6,2) not null,
  layout_height numeric(6,2) not null,
  rotation numeric(7,2) not null default 0,
  layout_shape text not null default 'rounded',
  is_custom boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (event_id, slot_key),
  foreign key (ticket_type_id, event_id)
    references public.ticket_types(id, event_id) on delete restrict,
  check (position_x between 0 and 100 and position_y between 0 and 100),
  check (layout_width > 0 and layout_width <= 100 and layout_height > 0 and layout_height <= 100),
  check (rotation between -180 and 180),
  check (layout_shape in ('rectangle', 'rounded', 'trapezoid', 'arc'))
);

create index event_hall_map_sections_event_order_idx
  on public.event_hall_map_sections (event_id, display_order);
create index event_hall_map_sections_ticket_event_idx
  on public.event_hall_map_sections (ticket_type_id, event_id);

alter table public.event_hall_map_sections enable row level security;
create policy "Admins manage hall map sections" on public.event_hall_map_sections
for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

-- Private helper: explicit, manually tuned slots derived from the supplied drawings.
create or replace function public.replace_event_hall_map_template(
  p_event_id uuid,
  p_template text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slots jsonb;
  v_focal jsonb;
  v_decorations jsonb := '[]'::jsonb;
  v_slot record;
  v_ticket_type_id uuid;
begin
  if p_template not in ('black_sea_arena', 'stadium', 'theatre', 'generic') then
    raise exception 'Choose a valid hall map template.';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found.';
  end if;

  case p_template
    when 'black_sea_arena' then
      v_focal := '{"type":"stage","label":"STAGE","x":35,"y":6,"width":30,"height":14,"rotation":0,"shape":"oval"}'::jsonb;
      v_slots := '[
        {"slot_key":"vip-front","tier":"vip","label":"VIP","order":10,"x":39,"y":23,"width":22,"height":9,"rotation":0,"shape":"rounded"},
        {"slot_key":"expensive-left-upper","tier":"expensive","label":"EXPENSIVE","order":20,"x":21,"y":20,"width":14,"height":10,"rotation":-38,"shape":"rounded"},
        {"slot_key":"expensive-right-upper","tier":"expensive","label":"EXPENSIVE","order":21,"x":66,"y":20,"width":14,"height":10,"rotation":38,"shape":"rounded"},
        {"slot_key":"expensive-left-inner","tier":"expensive","label":"EXPENSIVE","order":22,"x":26,"y":33,"width":14,"height":10,"rotation":-26,"shape":"rounded"},
        {"slot_key":"expensive-right-inner","tier":"expensive","label":"EXPENSIVE","order":23,"x":60,"y":33,"width":14,"height":10,"rotation":26,"shape":"rounded"},
        {"slot_key":"medium-left-upper","tier":"medium","label":"MEDIUM","order":30,"x":9,"y":31,"width":17,"height":15,"rotation":-42,"shape":"rounded"},
        {"slot_key":"medium-right-upper","tier":"medium","label":"MEDIUM","order":31,"x":74,"y":31,"width":17,"height":15,"rotation":42,"shape":"rounded"},
        {"slot_key":"medium-left-lower","tier":"medium","label":"MEDIUM","order":32,"x":20,"y":48,"width":19,"height":13,"rotation":-23,"shape":"rounded"},
        {"slot_key":"medium-centre","tier":"medium","label":"MEDIUM","order":33,"x":38,"y":47,"width":24,"height":13,"rotation":0,"shape":"rounded"},
        {"slot_key":"medium-right-lower","tier":"medium","label":"MEDIUM","order":34,"x":61,"y":48,"width":19,"height":13,"rotation":23,"shape":"rounded"},
        {"slot_key":"cheap-left-outer","tier":"cheap","label":"CHEAP","order":40,"x":3,"y":55,"width":16,"height":24,"rotation":-40,"shape":"rounded"},
        {"slot_key":"cheap-right-outer","tier":"cheap","label":"CHEAP","order":41,"x":81,"y":55,"width":16,"height":24,"rotation":40,"shape":"rounded"},
        {"slot_key":"cheap-left-lower","tier":"cheap","label":"CHEAP","order":42,"x":14,"y":75,"width":24,"height":18,"rotation":24,"shape":"trapezoid"},
        {"slot_key":"cheap-centre-lower","tier":"cheap","label":"CHEAP","order":43,"x":39,"y":78,"width":22,"height":16,"rotation":0,"shape":"rounded"},
        {"slot_key":"cheap-right-lower","tier":"cheap","label":"CHEAP","order":44,"x":62,"y":75,"width":24,"height":18,"rotation":-24,"shape":"trapezoid"}
      ]'::jsonb;
    when 'stadium' then
      v_focal := '{"type":"field","label":"FIELD","x":30,"y":30,"width":40,"height":36,"rotation":0,"shape":"rectangle"}'::jsonb;
      v_decorations := '[{"label":"RESERVED\nMEMBERS","x":72,"y":31,"width":7,"height":23,"shape":"rounded"}]'::jsonb;
      v_slots := '[
        {"slot_key":"cheap-top","tier":"cheap","label":"CHEAP","order":10,"x":24,"y":7,"width":52,"height":8,"rotation":0,"shape":"rounded"},
        {"slot_key":"cheap-top-left","tier":"cheap","label":"CHEAP","order":11,"x":20,"y":17,"width":12,"height":10,"rotation":-6,"shape":"rounded"},
        {"slot_key":"cheap-top-right","tier":"cheap","label":"CHEAP","order":12,"x":68,"y":17,"width":12,"height":10,"rotation":6,"shape":"rounded"},
        {"slot_key":"cheap-left-stand","tier":"cheap","label":"CHEAP","order":13,"x":7,"y":22,"width":11,"height":53,"rotation":0,"shape":"arc"},
        {"slot_key":"cheap-right-stand","tier":"cheap","label":"CHEAP","order":14,"x":82,"y":22,"width":11,"height":53,"rotation":0,"shape":"arc"},
        {"slot_key":"cheap-bottom-left","tier":"cheap","label":"CHEAP","order":15,"x":20,"y":76,"width":12,"height":10,"rotation":6,"shape":"rounded"},
        {"slot_key":"cheap-bottom-right","tier":"cheap","label":"CHEAP","order":16,"x":68,"y":76,"width":12,"height":10,"rotation":-6,"shape":"rounded"},
        {"slot_key":"cheap-bottom","tier":"cheap","label":"CHEAP","order":17,"x":24,"y":87,"width":52,"height":8,"rotation":0,"shape":"rounded"},
        {"slot_key":"medium-top","tier":"medium","label":"MEDIUM / PREMIUM","order":30,"x":34,"y":17,"width":32,"height":7,"rotation":0,"shape":"rounded"},
        {"slot_key":"medium-bottom","tier":"medium","label":"MEDIUM / PREMIUM","order":31,"x":34,"y":77,"width":32,"height":7,"rotation":0,"shape":"rounded"},
        {"slot_key":"expensive-top","tier":"expensive","label":"EXPENSIVE","order":40,"x":34,"y":25,"width":32,"height":5,"rotation":0,"shape":"rounded"},
        {"slot_key":"expensive-left-narrow","tier":"expensive","label":"EXPENSIVE","order":41,"x":24,"y":31,"width":5,"height":27,"rotation":0,"shape":"rounded"},
        {"slot_key":"expensive-right-narrow","tier":"expensive","label":"EXPENSIVE","order":42,"x":71,"y":55,"width":5,"height":10,"rotation":0,"shape":"rounded"},
        {"slot_key":"expensive-bottom-left","tier":"expensive","label":"EXPENSIVE","order":43,"x":30,"y":67,"width":10,"height":6,"rotation":0,"shape":"rounded"},
        {"slot_key":"expensive-bottom-right","tier":"expensive","label":"EXPENSIVE","order":44,"x":60,"y":67,"width":10,"height":6,"rotation":0,"shape":"rounded"},
        {"slot_key":"vip-bottom-centre","tier":"vip","label":"VIP","order":50,"x":40,"y":67,"width":20,"height":6,"rotation":0,"shape":"rounded"}
      ]'::jsonb;
    when 'theatre' then
      v_focal := '{"type":"stage","label":"STAGE","x":30,"y":8,"width":40,"height":10,"rotation":0,"shape":"rectangle"}'::jsonb;
      v_slots := '[
        {"slot_key":"vip-left","tier":"vip","label":"VIP","order":10,"x":4,"y":25,"width":12,"height":32,"rotation":0,"shape":"rounded"},
        {"slot_key":"vip-right","tier":"vip","label":"VIP","order":11,"x":84,"y":25,"width":12,"height":32,"rotation":0,"shape":"rounded"},
        {"slot_key":"expensive-front","tier":"expensive","label":"EXPENSIVE","order":20,"x":20,"y":30,"width":60,"height":16,"rotation":0,"shape":"rounded"},
        {"slot_key":"medium-main","tier":"medium","label":"MEDIUM / PREMIUM","order":30,"x":5,"y":59,"width":90,"height":15,"rotation":0,"shape":"rounded"},
        {"slot_key":"cheap-rear","tier":"cheap","label":"CHEAP / STANDARD","order":40,"x":5,"y":77,"width":90,"height":16,"rotation":0,"shape":"rounded"}
      ]'::jsonb;
    else
      v_focal := '{"type":"stage","label":"STAGE","x":37,"y":7,"width":26,"height":12,"rotation":0,"shape":"oval"}'::jsonb;
      v_slots := '[
        {"slot_key":"vip-front","tier":"vip","label":"VIP","order":10,"x":39,"y":24,"width":22,"height":9,"rotation":0,"shape":"rounded"},
        {"slot_key":"expensive-left-upper","tier":"expensive","label":"EXPENSIVE","order":20,"x":18,"y":11,"width":12,"height":11,"rotation":-42,"shape":"rounded"},
        {"slot_key":"expensive-right-upper","tier":"expensive","label":"EXPENSIVE","order":21,"x":70,"y":11,"width":12,"height":11,"rotation":42,"shape":"rounded"},
        {"slot_key":"expensive-left-inner","tier":"expensive","label":"EXPENSIVE","order":22,"x":24,"y":27,"width":13,"height":10,"rotation":-35,"shape":"rounded"},
        {"slot_key":"expensive-right-inner","tier":"expensive","label":"EXPENSIVE","order":23,"x":63,"y":27,"width":13,"height":10,"rotation":35,"shape":"rounded"},
        {"slot_key":"medium-left-outer","tier":"medium","label":"MEDIUM","order":30,"x":8,"y":25,"width":18,"height":19,"rotation":-40,"shape":"rounded"},
        {"slot_key":"medium-right-outer","tier":"medium","label":"MEDIUM","order":31,"x":74,"y":25,"width":18,"height":19,"rotation":40,"shape":"rounded"},
        {"slot_key":"medium-left-inner","tier":"medium","label":"MEDIUM","order":32,"x":19,"y":45,"width":19,"height":13,"rotation":-24,"shape":"rounded"},
        {"slot_key":"medium-centre","tier":"medium","label":"MEDIUM","order":33,"x":38,"y":44,"width":24,"height":13,"rotation":0,"shape":"rounded"},
        {"slot_key":"medium-right-inner","tier":"medium","label":"MEDIUM","order":34,"x":62,"y":45,"width":19,"height":13,"rotation":24,"shape":"rounded"},
        {"slot_key":"cheap-left-outer","tier":"cheap","label":"CHEAP","order":40,"x":2,"y":51,"width":17,"height":23,"rotation":-42,"shape":"rounded"},
        {"slot_key":"cheap-right-outer","tier":"cheap","label":"CHEAP","order":41,"x":81,"y":51,"width":17,"height":23,"rotation":42,"shape":"rounded"},
        {"slot_key":"cheap-left-lower","tier":"cheap","label":"CHEAP","order":42,"x":12,"y":69,"width":25,"height":20,"rotation":25,"shape":"trapezoid"},
        {"slot_key":"cheap-centre-lower","tier":"cheap","label":"CHEAP","order":43,"x":39,"y":77,"width":22,"height":16,"rotation":0,"shape":"rounded"},
        {"slot_key":"cheap-right-lower","tier":"cheap","label":"CHEAP","order":44,"x":63,"y":69,"width":25,"height":20,"rotation":-25,"shape":"trapezoid"}
      ]'::jsonb;
  end case;

  -- Focal metadata and decoration blocks never represent inventory.
  insert into public.event_hall_map_configs (
    event_id, layout_template, focal_type, focal_label, focal_x, focal_y,
    focal_width, focal_height, focal_rotation, focal_shape, decorations, updated_at
  ) values (
    p_event_id, p_template, v_focal->>'type', v_focal->>'label',
    (v_focal->>'x')::numeric, (v_focal->>'y')::numeric,
    (v_focal->>'width')::numeric, (v_focal->>'height')::numeric,
    coalesce((v_focal->>'rotation')::numeric, 0), v_focal->>'shape', v_decorations, now()
  ) on conflict (event_id) do update set
    layout_template=excluded.layout_template, focal_type=excluded.focal_type,
    focal_label=excluded.focal_label, focal_x=excluded.focal_x, focal_y=excluded.focal_y,
    focal_width=excluded.focal_width, focal_height=excluded.focal_height,
    focal_rotation=excluded.focal_rotation, focal_shape=excluded.focal_shape,
    decorations=excluded.decorations, updated_at=now();

  delete from public.event_hall_map_sections where event_id = p_event_id;
  for v_slot in select * from jsonb_to_recordset(v_slots) as s(
    slot_key text, tier text, label text, "order" integer,
    x numeric, y numeric, width numeric, height numeric, rotation numeric, shape text
  ) loop
    select id into v_ticket_type_id
    from public.ticket_types
    where event_id = p_event_id and canonical_tier = v_slot.tier;
    if v_ticket_type_id is null then
      raise exception 'Event must have the % ticket tier before its Hall Map can be applied.', v_slot.tier;
    end if;
    insert into public.event_hall_map_sections (
      event_id, ticket_type_id, slot_key, display_label, display_order,
      position_x, position_y, layout_width, layout_height, rotation, layout_shape
    ) values (
      p_event_id, v_ticket_type_id, v_slot.slot_key, v_slot.label, v_slot."order",
      v_slot.x, v_slot.y, v_slot.width, v_slot.height, coalesce(v_slot.rotation, 0), v_slot.shape
    );
  end loop;
  return true;
end;
$$;

-- Every existing event already has the four canonical tiers; create its explicit visual slots.
select public.replace_event_hall_map_template(
  e.id,
  coalesce(map.layout_template, v.hall_map_template)
)
from public.events e
join public.venues v on v.id = e.venue_id
left join public.event_hall_map_configs map on map.event_id = e.id;

create or replace function public.admin_apply_event_hall_map_template(
  p_event_id uuid,
  p_layout_template text
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
  return public.replace_event_hall_map_template(p_event_id, p_layout_template);
end;
$$;

create or replace function public.get_event_hall_map_presentation(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not exists (select 1 from public.events e where e.id = p_event_id and e.status = 'active') then
    raise exception 'Event is unavailable.';
  end if;
  select jsonb_build_object(
    'layout_template', coalesce(map.layout_template, v.hall_map_template),
    'focal', jsonb_build_object('type', map.focal_type, 'label', map.focal_label,
      'x', map.focal_x, 'y', map.focal_y, 'width', map.focal_width,
      'height', map.focal_height, 'rotation', map.focal_rotation, 'shape', map.focal_shape),
    'decorations', map.decorations,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', section.id, 'ticket_type_id', section.ticket_type_id,
        'ticket_color', type.display_color, 'display_label', section.display_label,
        'display_order', section.display_order, 'x', section.position_x, 'y', section.position_y,
        'width', section.layout_width, 'height', section.layout_height,
        'rotation', section.rotation, 'shape', section.layout_shape
      ) order by section.display_order)
      from public.event_hall_map_sections section
      join public.ticket_types type on type.id = section.ticket_type_id
      where section.event_id = e.id
    ), '[]'::jsonb)
  ) into v_result
  from public.events e
  join public.venues v on v.id = e.venue_id
  join public.event_hall_map_configs map on map.event_id = e.id
  where e.id = p_event_id;
  return v_result;
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
    raise exception 'Hall Map focal element and sections are required.';
  end if;
  v_focal_type := coalesce(p_focal->>'type', 'stage');
  v_focal_label := nullif(btrim(coalesce(p_focal->>'label', '')), '');
  v_focal_shape := coalesce(p_focal->>'shape', 'rounded');
  v_focal_x := (p_focal->>'x')::numeric;
  v_focal_y := (p_focal->>'y')::numeric;
  v_focal_width := (p_focal->>'width')::numeric;
  v_focal_height := (p_focal->>'height')::numeric;
  v_focal_rotation := coalesce((p_focal->>'rotation')::numeric, 0);
  if v_focal_type not in ('stage', 'field') or v_focal_label is null
    or v_focal_shape not in ('rectangle', 'rounded', 'oval')
    or v_focal_x not between 0 and 100 or v_focal_y not between 0 and 100
    or v_focal_width not between 0.01 and 100 or v_focal_height not between 0.01 and 100
    or v_focal_rotation not between -180 and 180 then
    raise exception 'The focal element has invalid presentation values.';
  end if;
  update public.event_hall_map_configs set
    layout_template=p_layout_template, focal_type=v_focal_type, focal_label=v_focal_label,
    focal_x=v_focal_x, focal_y=v_focal_y, focal_width=v_focal_width,
    focal_height=v_focal_height, focal_rotation=v_focal_rotation,
    focal_shape=v_focal_shape, updated_at=now()
  where event_id=p_event_id;

  for v_section in select * from jsonb_to_recordset(p_sections) as s(
    id uuid, ticket_type_id uuid, position_x numeric, position_y numeric,
    layout_width numeric, layout_height numeric, rotation numeric, layout_shape text
  ) loop
    if v_section.id is null or v_section.ticket_type_id is null
      or v_section.position_x not between 0 and 100 or v_section.position_y not between 0 and 100
      or v_section.layout_width not between 0.01 and 100 or v_section.layout_height not between 0.01 and 100
      or coalesce(v_section.rotation, 0) not between -180 and 180
      or v_section.layout_shape not in ('rectangle','rounded','trapezoid','arc') then
      raise exception 'A Hall Map section has invalid presentation values.';
    end if;
    if not exists (select 1 from public.ticket_types where id=v_section.ticket_type_id and event_id=p_event_id) then
      raise exception 'A Hall Map section ticket type does not belong to this event.';
    end if;
    update public.event_hall_map_sections set
      ticket_type_id=v_section.ticket_type_id, position_x=v_section.position_x,
      position_y=v_section.position_y, layout_width=v_section.layout_width,
      layout_height=v_section.layout_height, rotation=coalesce(v_section.rotation,0),
      layout_shape=v_section.layout_shape, is_custom=true, updated_at=now()
    where id=v_section.id and event_id=p_event_id;
    if not found then raise exception 'A Hall Map section does not belong to this event.'; end if;
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
declare v_result jsonb;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'Administrator access is required.';
  end if;
  perform public.expire_event_seat_reservations(p_event_id);
  if not exists (select 1 from public.events where id=p_event_id) then raise exception 'Event not found.'; end if;
  select jsonb_build_object(
    'event_id',e.id,'event_title',e.title,'venue_id',e.venue_id,'venue_name',v.name,
    'hall_map',jsonb_build_object('layout_template',coalesce(map.layout_template,v.hall_map_template),
      'uses_venue_default',map.layout_template is null,
      'focal',jsonb_build_object('type',map.focal_type,'label',map.focal_label,'x',map.focal_x,'y',map.focal_y,
        'width',map.focal_width,'height',map.focal_height,'rotation',map.focal_rotation,'shape',map.focal_shape)),
    'inventory',(select jsonb_build_object('total',count(*)::integer,'available',count(*) filter(where status='available')::integer,
      'reserved',count(*) filter(where status='reserved')::integer,'sold',count(*) filter(where status='sold')::integer,
      'blocked',count(*) filter(where status='blocked')::integer) from public.event_seats where event_id=e.id),
    'ticket_types',coalesce((select jsonb_agg(to_jsonb(type_row) order by type_row.price,type_row.name) from (
      select type.id,type.name,type.canonical_tier,type.price,type.display_color,type.is_active,
        count(seat.id)::integer as capacity,count(seat.id) filter(where seat.status='available')::integer as available
      from public.ticket_types type left join public.event_seats seat on seat.ticket_type_id=type.id
      where type.event_id=e.id group by type.id
    ) type_row),'[]'::jsonb),
    'sections',coalesce((select jsonb_agg(to_jsonb(section_row) order by section_row.display_order,section_row.name) from (
      select config.id,config.venue_section_id as section_id,config.name,physical.code,config.display_order,
        config.ticket_type_id,type.name as ticket_type_name,type.canonical_tier,type.price,
        config.rows,config.seats_per_row,config.is_enabled,
        count(seat.id)::integer as capacity,count(seat.id) filter(where seat.status='available')::integer as available,
        count(seat.id) filter(where seat.status='reserved')::integer as reserved,
        count(seat.id) filter(where seat.status='sold')::integer as sold,
        count(seat.id) filter(where seat.status='blocked')::integer as blocked
      from public.event_section_configs config
      join public.venue_sections physical on physical.id=config.venue_section_id
      join public.ticket_types type on type.id=config.ticket_type_id
      left join public.venue_seats physical_seat on physical_seat.section_id=config.venue_section_id
      left join public.event_seats seat on seat.event_id=config.event_id and seat.venue_seat_id=physical_seat.id
      where config.event_id=e.id
      group by config.id,physical.code,type.name,type.canonical_tier,type.price
    ) section_row),'[]'::jsonb),
    'hall_map_sections',coalesce((select jsonb_agg(to_jsonb(map_row) order by map_row.display_order) from (
      select section.id,section.ticket_type_id,section.slot_key,section.display_label,section.display_order,
        section.position_x,section.position_y,section.layout_width,section.layout_height,
        section.rotation,section.layout_shape,section.is_custom,type.name as ticket_type_name,type.display_color
      from public.event_hall_map_sections section
      join public.ticket_types type on type.id=section.ticket_type_id
      where section.event_id=e.id
    ) map_row),'[]'::jsonb)
  ) into v_result
  from public.events e join public.venues v on v.id=e.venue_id
  join public.event_hall_map_configs map on map.event_id=e.id
  where e.id=p_event_id;
  return v_result;
end;
$$;

-- Canonical tier assignment is derived only for the four allowed business-tier names.
create or replace function public.admin_upsert_event_ticket_type(
  p_event_id uuid, p_ticket_type_id uuid, p_name text, p_price numeric, p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_ticket_type_id uuid; v_assigned integer; v_tier text;
begin
  if not exists (select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'Administrator access is required.'; end if;
  if not exists (select 1 from public.events where id=p_event_id) then raise exception 'Event not found.'; end if;
  if nullif(btrim(p_name),'') is null then raise exception 'Ticket type name is required.'; end if;
  if p_price is null or p_price < 0 then raise exception 'Ticket price cannot be negative.'; end if;
  v_tier := case lower(btrim(p_name)) when 'cheap / standard' then 'cheap' when 'medium / premium' then 'medium' when 'expensive' then 'expensive' when 'vip' then 'vip' else null end;
  if p_ticket_type_id is null and v_tier is null then raise exception 'Choose one of the four canonical ticket tiers.'; end if;
  if p_ticket_type_id is null then
    insert into public.ticket_types(event_id,name,canonical_tier,price,total_quantity,available_quantity,is_active)
    values(p_event_id,btrim(p_name),v_tier,p_price,0,0,coalesce(p_is_active,true)) returning id into v_ticket_type_id;
  else
    select count(*) into v_assigned from public.event_seats where event_id=p_event_id and ticket_type_id=p_ticket_type_id;
    if not coalesce(p_is_active,true) and v_assigned>0 then raise exception 'Ticket type is still assigned to % seats. Reassign or remove the section first.',v_assigned; end if;
    update public.ticket_types set name=btrim(p_name),canonical_tier=coalesce(v_tier,canonical_tier),price=p_price,is_active=coalesce(p_is_active,true)
    where id=p_ticket_type_id and event_id=p_event_id returning id into v_ticket_type_id;
    if v_ticket_type_id is null then raise exception 'Ticket type does not belong to this event.'; end if;
    update public.event_seats set unit_price=p_price,updated_at=now()
    where event_id=p_event_id and ticket_type_id=v_ticket_type_id and status in ('available','blocked');
  end if;
  return v_ticket_type_id;
end;
$$;

create or replace function public.enforce_active_event_ticket_tiers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and not exists (
    select 1 from public.ticket_types
    where event_id=new.id
    group by event_id
    having count(*) filter(where canonical_tier='cheap')=1
       and count(*) filter(where canonical_tier='medium')=1
       and count(*) filter(where canonical_tier='expensive')=1
       and count(*) filter(where canonical_tier='vip')=1
  ) then
    raise exception 'An active event requires Cheap / Standard, Medium / Premium, Expensive, and VIP ticket tiers.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_active_event_ticket_tiers on public.events;
create trigger enforce_active_event_ticket_tiers
before insert or update of status on public.events
for each row execute function public.enforce_active_event_ticket_tiers();

revoke all on function public.replace_event_hall_map_template(uuid,text) from public,anon,authenticated;
revoke all on function public.enforce_active_event_ticket_tiers() from public,anon,authenticated;
revoke all on function public.admin_apply_event_hall_map_template(uuid,text) from public,anon;
revoke all on function public.admin_save_event_hall_map_layout(uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.admin_apply_event_hall_map_template(uuid,text) to authenticated;
grant execute on function public.admin_save_event_hall_map_layout(uuid,text,jsonb,jsonb) to authenticated;
