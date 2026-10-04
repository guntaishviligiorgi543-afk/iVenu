-- Support lifecycle: customer-side hiding with delayed, server-side retention cleanup.
alter table public.support_requests
  add column customer_deleted_at timestamptz;

create index support_requests_customer_deleted_idx
  on public.support_requests (customer_deleted_at, resolved_at)
  where customer_deleted_at is not null or status = 'resolved';

drop policy "Customers view their own support requests"
  on public.support_requests;

create policy "Customers view their visible support requests"
on public.support_requests
for select
to authenticated
using (
  customer_user_id = (select auth.uid())
  and customer_deleted_at is null
);

drop policy "Customers view messages on their own support requests"
  on public.support_messages;

create policy "Customers view messages on their visible support requests"
on public.support_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.support_requests r
    where r.id = support_messages.support_request_id
      and r.customer_user_id = (select auth.uid())
      and r.customer_deleted_at is null
  )
);

create function public.delete_customer_support_request(p_support_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := (select auth.uid());
begin
  if v_customer_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  update public.support_requests
  set customer_deleted_at = now(),
      updated_at = now()
  where id = p_support_request_id
    and customer_user_id = v_customer_id
    and customer_deleted_at is null;

  if not found then
    raise exception 'Support Request not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_customer_support_request(uuid)
  from public, anon;
grant execute on function public.delete_customer_support_request(uuid)
  to authenticated;

-- Customer-hidden requests are no longer active work. Resolved history and
-- customer-hidden history are retained for 90 days, using the later timestamp
-- when both exist. The existing cascading FKs remove messages and read states
-- with the parent request, so cleanup cannot leave child rows orphaned.
create or replace function public.cleanup_support_history()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.support_requests
  where (
    status = 'resolved'
    or customer_deleted_at is not null
  )
  and greatest(
    coalesce(resolved_at, '-infinity'::timestamptz),
    coalesce(customer_deleted_at, '-infinity'::timestamptz)
  ) <= now() - interval '90 days';
$$;

revoke all on function public.cleanup_support_history()
  from public, anon, authenticated;

create function public.prevent_support_lifecycle_updates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'resolved'
     and new.status is distinct from old.status then
    raise exception 'Resolved Support Requests cannot be reopened.' using errcode = '55000';
  end if;
  if old.customer_deleted_at is not null
     and (select auth.uid()) = old.customer_user_id then
    raise exception 'This Support Request is hidden and cannot be changed.' using errcode = '55000';
  end if;
  if old.customer_deleted_at is not null
     and (
       new.status is distinct from old.status
       or new.assigned_support_user_id is distinct from old.assigned_support_user_id
     ) then
    raise exception 'This Support Request is hidden by the customer and is no longer active.' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger support_requests_prevent_lifecycle_updates
before update on public.support_requests
for each row
execute function public.prevent_support_lifecycle_updates();

revoke all on function public.prevent_support_lifecycle_updates()
  from public, anon, authenticated;

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'cleanup-support-history-daily',
  '15 2 * * *',
  $$select public.cleanup_support_history();$$
);
