create policy "Admins can view all events"
on public.events for select to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "Admins can insert events"
on public.events for insert to authenticated
with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "Admins can update events"
on public.events for update to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "Admins can delete events"
on public.events for delete to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "Admins can view all ticket types"
on public.ticket_types for select to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "Admins can view all orders"
on public.orders for select to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "Admins can view all order items"
on public.order_items for select to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "Admins can view all profiles"
on public.profiles for select to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));;
