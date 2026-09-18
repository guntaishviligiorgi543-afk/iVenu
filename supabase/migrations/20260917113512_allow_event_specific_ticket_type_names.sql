alter table public.ticket_types
  drop constraint if exists ticket_types_name_check;

alter table public.ticket_types
  add constraint ticket_types_name_required_check
  check (length(btrim(name)) > 0);
