-- The helper is invoked by an events trigger and is not part of the public RPC surface.
revoke all on function public.initialize_event_hall_map_config() from public, anon, authenticated;
