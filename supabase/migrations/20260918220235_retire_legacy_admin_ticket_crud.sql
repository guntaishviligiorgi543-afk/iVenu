-- Ticket inventory is now managed only through admin_save_event_with_inventory.
-- These event-scoped CRUD endpoints backed the removed standalone admin UI.
revoke execute on function public.admin_upsert_event_ticket_type(uuid, uuid, text, numeric, boolean) from authenticated;
revoke execute on function public.admin_set_event_ticket_type_color(uuid, uuid, text) from authenticated;
revoke execute on function public.admin_upsert_event_zone(uuid, uuid, text, text, uuid, integer, integer, integer, boolean) from authenticated;
revoke execute on function public.admin_delete_event_zone(uuid) from authenticated;
