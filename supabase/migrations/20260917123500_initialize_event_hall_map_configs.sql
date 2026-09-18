-- Give subsequently created events the same presentation-only focal metadata as existing events.
create or replace function public.initialize_event_hall_map_config()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template text;
begin
  select hall_map_template into v_template
  from public.venues
  where id = new.venue_id;

  insert into public.event_hall_map_configs (
    event_id, focal_type, focal_label, focal_x, focal_y,
    focal_width, focal_height, focal_rotation, focal_shape
  ) values (
    new.id,
    case when coalesce(v_template, 'generic') = 'stadium' then 'field' else 'stage' end,
    case when coalesce(v_template, 'generic') = 'stadium' then 'FIELD' else 'STAGE' end,
    case coalesce(v_template, 'generic') when 'stadium' then 28 when 'generic' then 35 else 35 end,
    case coalesce(v_template, 'generic') when 'stadium' then 27 when 'generic' then 40 else 6 end,
    case coalesce(v_template, 'generic') when 'stadium' then 44 when 'generic' then 30 else 30 end,
    case coalesce(v_template, 'generic') when 'stadium' then 45 when 'generic' then 12 else 10 end,
    0,
    case when coalesce(v_template, 'generic') = 'stadium' then 'oval' else 'rounded' end
  ) on conflict (event_id) do nothing;
  return new;
end;
$$;

drop trigger if exists initialize_event_hall_map_config on public.events;
create trigger initialize_event_hall_map_config
after insert on public.events
for each row execute function public.initialize_event_hall_map_config();
