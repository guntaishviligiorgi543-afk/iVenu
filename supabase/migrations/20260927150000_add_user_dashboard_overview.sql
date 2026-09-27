-- Dashboard aggregates are computed server-side so the browser only receives the
-- authenticated member's results and an aggregate ranking, never peer records.
create or replace function public.get_user_dashboard_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_active_users integer := 0;
  v_higher_scores integer := 0;
  v_user_score integer := 0;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  with completed_orders as (
    select o.id, o.created_at, o.total_price
    from public.orders o
    where o.user_id = v_user_id
      and lower(coalesce(o.status, '')) in ('paid', 'completed', 'confirmed', 'success')
  ), purchased_events as (
    select distinct tt.event_id
    from completed_orders o
    join public.order_items oi on oi.order_id = o.id
    join public.ticket_types tt on tt.id = oi.ticket_type_id
  ), event_ticket_counts as (
    select tt.event_id, sum(oi.quantity)::integer as ticket_count
    from completed_orders o
    join public.order_items oi on oi.order_id = o.id
    join public.ticket_types tt on tt.id = oi.ticket_type_id
    group by tt.event_id
  ), event_seat_details as (
    select tt.event_id,
      string_agg(distinct concat_ws(' ', s.name, 'Row ' || vs.row_number, 'Seat ' || vs.seat_number), ', ' order by concat_ws(' ', s.name, 'Row ' || vs.row_number, 'Seat ' || vs.seat_number)) as seats
    from completed_orders o
    join public.order_items oi on oi.order_id = o.id and oi.event_seat_id is not null
    join public.ticket_types tt on tt.id = oi.ticket_type_id
    join public.event_seats es on es.id = oi.event_seat_id
    join public.venue_seats vs on vs.id = es.venue_seat_id
    join public.venue_sections s on s.id = vs.section_id
    group by tt.event_id
  ), active_reservation as (
    select e.title, e.performer, e.event_date, e.event_time,
      coalesce(v.name, e.venue) as venue, es.reserved_until,
      count(*)::integer as seat_count,
      string_agg(distinct concat_ws(' ', s.name, 'Row ' || vs.row_number, 'Seat ' || vs.seat_number), ', ' order by concat_ws(' ', s.name, 'Row ' || vs.row_number, 'Seat ' || vs.seat_number)) as seats
    from public.event_seats es
    join public.events e on e.id = es.event_id
    left join public.venues v on v.id = e.venue_id
    join public.venue_seats vs on vs.id = es.venue_seat_id
    join public.venue_sections s on s.id = vs.section_id
    where es.reserved_by = v_user_id and es.status = 'reserved' and es.reserved_until > now()
    group by e.id, e.title, e.performer, e.event_date, e.event_time, v.name, e.venue, es.reserved_until
    order by es.reserved_until asc
    limit 1
  ), recent_orders as (
    select o.created_at, o.total_price, o.status,
      coalesce(string_agg(distinct coalesce(e.title, e.performer, 'Event'), ', '), 'Event') as event_name,
      coalesce(sum(oi.quantity), 0)::integer as ticket_count
    from completed_orders o
    left join public.order_items oi on oi.order_id = o.id
    left join public.ticket_types tt on tt.id = oi.ticket_type_id
    left join public.events e on e.id = tt.event_id
    group by o.id, o.created_at, o.total_price, o.status
    order by o.created_at desc
    limit 5
  )
  select jsonb_build_object(
    'tickets', (select coalesce(sum(oi.quantity), 0)::integer from completed_orders o join public.order_items oi on oi.order_id = o.id join public.ticket_types tt on tt.id = oi.ticket_type_id join public.events e on e.id = tt.event_id where (e.event_date + coalesce(e.event_time, time '00:00')) >= now()),
    'upcoming_events', (select count(*)::integer from purchased_events pe join public.events e on e.id = pe.event_id where (e.event_date + coalesce(e.event_time, time '00:00')) >= now()),
    'past_events', (select count(*)::integer from purchased_events pe join public.events e on e.id = pe.event_id where (e.event_date + coalesce(e.event_time, time '00:00')) < now()),
    'total_orders', (select count(*)::integer from completed_orders),
    'total_spent', (select coalesce(sum(total_price), 0) from completed_orders),
    'this_year_spent', (select coalesce(sum(total_price), 0) from completed_orders where created_at >= date_trunc('year', now())),
    'next_event', (select jsonb_build_object('name', coalesce(e.title, e.performer, 'Event'), 'date', e.event_date, 'time', e.event_time, 'venue', coalesce(v.name, e.venue), 'tickets', etc.ticket_count, 'seats', esd.seats) from event_ticket_counts etc join public.events e on e.id = etc.event_id left join public.venues v on v.id = e.venue_id left join event_seat_details esd on esd.event_id = etc.event_id where (e.event_date + coalesce(e.event_time, time '00:00')) >= now() order by e.event_date, e.event_time nulls last limit 1),
    'reservation', (select to_jsonb(active_reservation) from active_reservation),
    'recent_orders', (select coalesce(jsonb_agg(to_jsonb(recent_orders) order by created_at desc), '[]'::jsonb) from recent_orders),
    'activity', jsonb_build_object(
      'last_7_days', (select count(*)::integer from completed_orders where created_at >= now() - interval '7 days'),
      'last_30_days', (select count(*)::integer from completed_orders where created_at >= now() - interval '30 days'),
      'this_year', (select count(*)::integer from completed_orders where created_at >= date_trunc('year', now()))
    )
  ) into v_result;

  with scores as (
    select o.user_id, count(*)::integer as score
    from public.orders o
    where lower(coalesce(o.status, '')) in ('paid', 'completed', 'confirmed', 'success')
      and o.created_at >= now() - interval '30 days'
    group by o.user_id
  )
  select count(*), coalesce(max(score) filter (where user_id = v_user_id), 0),
    count(*) filter (where score > coalesce((select score from scores where user_id = v_user_id), 0))
  into v_active_users, v_user_score, v_higher_scores
  from scores;

  return v_result || jsonb_build_object('ranking', case
    when v_active_users < 5 or v_user_score = 0 then jsonb_build_object('available', false)
    else jsonb_build_object('available', true, 'percentile', round(100.0 * (v_active_users - v_higher_scores) / v_active_users)::integer, 'top_percent', greatest(1, ceil(100.0 * v_higher_scores / v_active_users)::integer))
  end);
end;
$$;

revoke all on function public.get_user_dashboard_overview() from public, anon;
grant execute on function public.get_user_dashboard_overview() to authenticated;
