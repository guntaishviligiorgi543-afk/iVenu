alter function public.update_updated_at_column() set search_path = '';
alter function public.capture_cart_addition() set search_path = '';
alter function public.is_event_favorited(uuid) set search_path = '';
alter function public.record_event_view(uuid) set search_path = '';

revoke execute on function public.capture_cart_addition()
from public, anon, authenticated;

revoke execute on function public.is_event_favorited(uuid)
from public, anon;

grant execute on function public.is_event_favorited(uuid)
to authenticated;

revoke execute on function public.toggle_favorite(uuid)
from public, anon;

grant execute on function public.toggle_favorite(uuid)
to authenticated;

revoke execute on function public.record_event_view(uuid)
from public;

grant execute on function public.record_event_view(uuid)
to anon, authenticated;

drop policy "Public can view iVenue images" on storage.objects;
