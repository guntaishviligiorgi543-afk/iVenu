-- Phase 3 (local only): make Auth-driven account deletion safe for seat inventory
-- and preserve newsletter campaign history when an author account is deleted.

-- This is the current live function body, made narrowly SECURITY DEFINER so an
-- auth.users -> profiles FK cascade can finish its event_seats inventory trigger.
create or replace function public.refresh_ticket_type_inventory(p_ticket_type_ids uuid[])
returns void
language sql
security definer
set search_path to ''
as $$
  with ids as (
    select distinct id from unnest(coalesce(p_ticket_type_ids, '{}'::uuid[])) as id
    where id is not null
  ), counts as (
    select ids.id,
      count(es.id)::integer as total_count,
      count(es.id) filter (where es.status = 'available')::integer as available_count
    from ids
    left join public.event_seats es on es.ticket_type_id = ids.id
    group by ids.id
  )
  update public.ticket_types tt
  set total_quantity = counts.total_count,
      available_quantity = counts.available_count
  from counts
  where tt.id = counts.id
    and (tt.total_quantity, tt.available_quantity)
      is distinct from (counts.total_count, counts.available_count);
$$;

revoke all on function public.refresh_ticket_type_inventory(uuid[]) from public, anon, authenticated;
grant execute on function public.refresh_ticket_type_inventory(uuid[]) to supabase_auth_admin, service_role;

-- Release only an account's still-reserved seats before a profile is removed.
-- This keeps the event_seats reservation check constraint valid during the FK cascade.
create or replace function public.release_profile_reservations_before_delete()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.event_seats
  set status = 'available',
      reserved_by = null,
      reserved_until = null,
      updated_at = now()
  where reserved_by = old.id
    and status = 'reserved';

  return old;
end;
$$;

revoke all on function public.release_profile_reservations_before_delete() from public, anon, authenticated;

create trigger release_profile_reservations_before_delete
before delete on public.profiles
for each row
execute function public.release_profile_reservations_before_delete();

-- Campaign content and delivery history stay intact when its creator is deleted.
alter table public.newsletter_campaigns
  alter column created_by drop not null;

alter table public.newsletter_campaigns
  drop constraint newsletter_campaigns_created_by_fkey;

alter table public.newsletter_campaigns
  add constraint newsletter_campaigns_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
