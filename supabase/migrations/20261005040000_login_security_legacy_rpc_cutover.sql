-- Final cutover only. Apply after the protected Edge Functions and frontend
-- have been deployed and verified in production.

revoke execute on function public.reserve_event_seat(uuid)
  from public, anon, authenticated;
revoke execute on function public.release_event_seat(uuid)
  from public, anon, authenticated;
revoke execute on function public.checkout_reserved_event_seats()
  from public, anon, authenticated;

drop function if exists public.reserve_event_seat(uuid);
drop function if exists public.release_event_seat(uuid);
drop function if exists public.checkout_reserved_event_seats();
drop function if exists public.reserve_event_seat(uuid, text);
drop function if exists public.release_event_seat(uuid, text);
drop function if exists public.checkout_reserved_event_seats(text);
