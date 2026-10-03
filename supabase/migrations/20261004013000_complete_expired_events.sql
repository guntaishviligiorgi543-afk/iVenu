-- Automatically transition only active events past their configured start time.
-- event_date and event_time are stored as Asia/Tbilisi wall-clock values.
create or replace function public.complete_expired_events()
returns void
language sql
security definer
set search_path = ''
as $function$
  update public.events
  set status = 'completed'
  where status = 'active'
    and make_timestamptz(
      extract(year from event_date)::integer,
      extract(month from event_date)::integer,
      extract(day from event_date)::integer,
      extract(hour from event_time)::integer,
      extract(minute from event_time)::integer,
      extract(second from event_time)::double precision,
      'Asia/Tbilisi'
    ) <= now();
$function$;

revoke execute on function public.complete_expired_events() from public, anon, authenticated;

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'complete-expired-events',
  '* * * * *',
  $$select public.complete_expired_events();$$
);
