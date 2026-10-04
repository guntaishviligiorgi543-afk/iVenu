create policy "Public can view all event lifecycle statuses"
on public.events for select
to anon, authenticated
using (status in ('active', 'completed', 'cancelled'));
