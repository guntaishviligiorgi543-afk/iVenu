-- Transactional notifications only. Existing Support RPCs, RLS and lifecycle stay intact.
-- Delivery runs after commit, independently of the customer's saved conversation.
create table public.support_email_notifications (
  id uuid primary key default gen_random_uuid(),
  support_request_id uuid not null references public.support_requests(id) on delete cascade,
  support_message_id uuid references public.support_messages(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('reply', 'resolved')),
  status text not null default 'pending' check (status in ('pending','sending','retry','sent','skipped','failed')),
  created_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts between 0 and 6),
  next_attempt_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  payload jsonb,
  provider_message_id text,
  last_error_code text,
  completed_at timestamptz,
  check ((kind = 'reply' and support_message_id is not null) or (kind = 'resolved' and support_message_id is null))
);
create unique index support_email_reply_once_idx on public.support_email_notifications (support_message_id) where kind = 'reply';
create unique index support_email_resolution_once_idx on public.support_email_notifications (support_request_id) where kind = 'resolved';
create index support_email_due_idx on public.support_email_notifications (next_attempt_at, created_at, id) where status in ('pending','retry','sending');
create index support_email_request_idx on public.support_email_notifications (support_request_id);
create index support_email_actor_idx on public.support_email_notifications (actor_user_id);

alter table public.support_email_notifications enable row level security;
revoke all on public.support_email_notifications from public, anon, authenticated;
grant select, update on public.support_email_notifications to service_role;
-- No browser policies: customers, Support employees and Admins cannot enqueue,
-- choose a recipient, read the delivery payload, retry, or manually send email.

create function public.enqueue_support_email_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.is_current_user_support_employee() then return new; end if;
  if tg_table_name = 'support_messages' then
    if new.sender_type = 'support' and new.sender_user_id = v_actor and exists (
      select 1 from public.support_requests r where r.id = new.support_request_id
      and r.customer_user_id is not null and r.customer_deleted_at is null
      and r.status in ('open', 'waiting_for_user')
    ) then
      insert into public.support_email_notifications (support_request_id, support_message_id, actor_user_id, kind)
      values (new.support_request_id, new.id, v_actor, 'reply') on conflict do nothing;
    end if;
  elsif old.status <> 'resolved' and new.status = 'resolved'
    and new.resolved_by_user_id = v_actor and new.customer_user_id is not null
    and new.customer_deleted_at is null then
    insert into public.support_email_notifications (support_request_id, actor_user_id, kind)
    values (new.id, v_actor, 'resolved') on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_support_email_notification() from public, anon, authenticated;
create trigger support_reply_email_after_insert after insert on public.support_messages
for each row execute function public.enqueue_support_email_notification();
create trigger support_resolved_email_after_update after update of status on public.support_requests
for each row execute function public.enqueue_support_email_notification();

create function public.claim_support_email_notifications()
returns setof public.support_email_notifications
language plpgsql security definer set search_path = '' as $$
begin
  -- Resend remembers keys for 24h. Never automatically retry beyond 23h or six
  -- attempts, including a worker crash after a provider accepted the message.
  update public.support_email_notifications set status = 'failed', completed_at = now(),
    payload = null, last_error_code = 'RETRY_LIMIT', lease_token = null, lease_expires_at = null
  where status in ('pending','retry','sending')
    and (status <> 'sending' or lease_expires_at < now())
    and (attempts >= 6 or first_attempt_at <= now() - interval '23 hours');
  return query
  with due as (
    select n.id from public.support_email_notifications n
    where ((n.status in ('pending','retry') and n.next_attempt_at <= now())
      or (n.status = 'sending' and n.lease_expires_at < now()))
      and n.attempts < 6
      and (n.first_attempt_at is null or n.first_attempt_at > now() - interval '23 hours')
    order by n.created_at, n.id limit 5 for update skip locked
  )
  update public.support_email_notifications n
  set status = 'sending', attempts = n.attempts + 1,
    first_attempt_at = coalesce(n.first_attempt_at, now()),
    lease_token = gen_random_uuid(), lease_expires_at = now() + interval '5 minutes'
  from due where n.id = due.id returning n.*;
end;
$$;

create function public.finish_support_email_notification(
  p_id uuid, p_lease_token uuid, p_status text,
  p_error_code text default null, p_provider_message_id text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('sent','skipped','retry','failed') then
    raise exception 'Invalid delivery outcome.' using errcode = '22023';
  end if;
  update public.support_email_notifications n set
    status = case when p_status = 'retry' and (n.attempts >= 6 or n.first_attempt_at <= now() - interval '23 hours')
      then 'failed' else p_status end,
    last_error_code = left(p_error_code, 64), provider_message_id = left(p_provider_message_id, 200),
    next_attempt_at = now() + make_interval(secs => (30 * power(2, n.attempts))::integer),
    completed_at = case when p_status <> 'retry' or n.attempts >= 6 or n.first_attempt_at <= now() - interval '23 hours' then now() end,
    payload = case when p_status = 'retry' and n.attempts < 6 and n.first_attempt_at > now() - interval '23 hours' then n.payload end,
    lease_token = null, lease_expires_at = null
  where n.id = p_id and n.status = 'sending' and n.lease_token = p_lease_token
    and n.lease_expires_at > now();
  return found;
end;
$$;
revoke all on function public.claim_support_email_notifications(),
  public.finish_support_email_notification(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.claim_support_email_notifications(),
  public.finish_support_email_notification(uuid,uuid,text,text,text) to service_role;

-- The scheduler only wakes a private worker; no provider secrets live in SQL.
-- Configure the dedicated Vault entries and matching Edge worker key before
-- enabling delivery. Missing configuration leaves events queued, not discarded.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;
create function public.dispatch_support_email_notifications()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text; v_key text;
begin
  if not exists (select 1 from public.support_email_notifications
    where (status in ('pending','retry') and next_attempt_at <= now())
       or (status = 'sending' and lease_expires_at < now())) then return null; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'support_notifications_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'support_notifications_worker_key';
  if v_url is null or v_url !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/support-notifications$'
     or v_key is null or char_length(v_key) < 32 then
    raise warning 'Support notification worker configuration is missing or invalid.';
    return null;
  end if;
  return net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','X-Support-Worker-Key',v_key),
    timeout_milliseconds := 120000);
end;
$$;
revoke all on function public.dispatch_support_email_notifications() from public, anon, authenticated;
grant execute on function public.dispatch_support_email_notifications() to service_role;
select cron.schedule('support-transactional-email-worker','* * * * *',
  $$select public.dispatch_support_email_notifications();$$);
notify pgrst, 'reload schema';
