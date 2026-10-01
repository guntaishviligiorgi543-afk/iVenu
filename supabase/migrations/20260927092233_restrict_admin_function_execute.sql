revoke execute on function public.admin_update_event_metadata(uuid, jsonb)
from public, anon;

grant execute on function public.admin_update_event_metadata(uuid, jsonb)
to authenticated;

revoke execute on function public.admin_event_inventory_matches(uuid, jsonb)
from public, anon, authenticated;
