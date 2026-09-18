create index event_seat_layouts_venue_section_idx
  on public.event_seat_layouts (venue_section_id);

create index event_section_configs_ticket_event_idx
  on public.event_section_configs (ticket_type_id, event_id);

create index event_section_configs_venue_section_idx
  on public.event_section_configs (venue_section_id);
