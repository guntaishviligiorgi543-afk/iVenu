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
    'event_id', e.id,
    'event_title', e.title,
    'venue_id', e.venue_id,
    'venue_name', v.name,
    'inventory', coalesce((
      select jsonb_build_object(
        'total', count(*)::integer,
        'available', count(*) filter (where es.status = 'available')::integer,
        'reserved', count(*) filter (where es.status = 'reserved')::integer,
        'sold', count(*) filter (where es.status = 'sold')::integer,
        'blocked', count(*) filter (where es.status = 'blocked')::integer
      )
      from public.event_seats es where es.event_id = e.id
    ), '{}'::jsonb),
    'ticket_types', coalesce((
      select jsonb_agg(to_jsonb(type_row) order by type_row.created_at, type_row.name)
      from (
        select tt.id, tt.name, tt.price, tt.is_active, tt.created_at,
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
          cfg.display_order, cfg.ticket_type_id, tt.name as ticket_type_name,
          tt.price, cfg.rows, cfg.seats_per_row, cfg.is_enabled,
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
  where e.id = p_event_id;
  return v_result;
end;
$$;
