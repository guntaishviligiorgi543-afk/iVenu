-- Support System Phase 2: authenticated support-request foundation.
-- Contact-form, anonymous submission, notification, and workspace UI wiring are
-- deliberately outside this migration.

create table public.support_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text not null check (char_length(btrim(user_name)) between 1 and 200),
  user_email text not null check (char_length(btrim(user_email)) between 3 and 320),
  created_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  granted_by_name text not null check (char_length(btrim(granted_by_name)) between 1 and 200),
  granted_by_email text not null check (char_length(btrim(granted_by_email)) between 3 and 320),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_by_name text,
  revoked_by_email text,
  check (revoked_at is null or revoked_at >= created_at),
  check (
    (revoked_at is null and revoked_by is null and revoked_by_name is null and revoked_by_email is null)
    or
    (revoked_at is not null and nullif(btrim(coalesce(revoked_by_name, '')), '') is not null
      and nullif(btrim(coalesce(revoked_by_email, '')), '') is not null)
  )
);

create unique index support_users_one_active_membership_idx
  on public.support_users (user_id)
  where user_id is not null and revoked_at is null;

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid references auth.users(id) on delete set null,
  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 200),
  customer_email text not null check (char_length(btrim(customer_email)) between 3 and 320),
  subject text not null check (char_length(btrim(subject)) between 1 and 200),
  category text not null default 'general' check (category in ('general', 'account', 'event', 'reservation', 'order', 'technical', 'other')),
  status text not null default 'open' check (status in ('open', 'waiting_for_user', 'resolved')),
  assigned_support_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_by_name text,
  resolved_by_email text,
  check (updated_at >= created_at),
  check (
    (status = 'resolved'
      and resolved_at is not null
      and nullif(btrim(coalesce(resolved_by_name, '')), '') is not null
      and nullif(btrim(coalesce(resolved_by_email, '')), '') is not null)
    or
    (status <> 'resolved'
      and resolved_at is null
      and resolved_by_user_id is null
      and resolved_by_name is null
      and resolved_by_email is null)
  )
);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  support_request_id uuid not null references public.support_requests(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_type text not null check (sender_type in ('customer', 'support', 'system')),
  sender_name text not null check (char_length(btrim(sender_name)) between 1 and 200),
  sender_email text check (sender_email is null or char_length(btrim(sender_email)) between 3 and 320),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  check (sender_type <> 'system' or sender_user_id is null)
);

create index support_requests_customer_updated_idx
  on public.support_requests (customer_user_id, updated_at desc)
  where customer_user_id is not null;
create index support_requests_status_updated_idx
  on public.support_requests (status, updated_at desc);
create index support_requests_assignee_status_updated_idx
  on public.support_requests (assigned_support_user_id, status, updated_at desc)
  where assigned_support_user_id is not null;
create index support_messages_request_created_idx
  on public.support_messages (support_request_id, created_at, id);

alter table public.support_users enable row level security;
alter table public.support_requests enable row level security;
alter table public.support_messages enable row level security;

revoke all on table public.support_users, public.support_requests, public.support_messages
  from public, anon, authenticated;
grant select on table public.support_users, public.support_requests, public.support_messages
  to authenticated;

-- These helpers are intentionally private primitives. They bypass membership
-- table RLS only to answer the caller's own authorization question.
create function public.is_current_user_support_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.admin_users a where a.user_id = (select auth.uid())
    );
$$;

create function public.is_current_user_support_employee()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and not public.is_current_user_support_admin()
    and exists (
      select 1
      from public.support_users s
      where s.user_id = (select auth.uid())
        and s.revoked_at is null
    );
$$;

create function public.assert_current_user_is_support_employee()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if public.is_current_user_support_admin() then
    raise exception 'Administrators cannot act as Support.' using errcode = '42501';
  end if;

  perform 1
  from public.support_users s
  where s.user_id = v_actor and s.revoked_at is null
  for share;
  if not found then
    raise exception 'Active Support membership is required.' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

revoke all on function public.is_current_user_support_admin(), public.is_current_user_support_employee(), public.assert_current_user_is_support_employee()
  from public, anon, authenticated;
grant execute on function public.is_current_user_support_admin(), public.is_current_user_support_employee()
  to authenticated;

create policy "Support administrators view support memberships"
on public.support_users
for select
to authenticated
using ((select public.is_current_user_support_admin()));

create policy "Support employees view their own membership"
on public.support_users
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Customers view their own support requests"
on public.support_requests
for select
to authenticated
using (customer_user_id = (select auth.uid()));

create policy "Support employees view all support requests"
on public.support_requests
for select
to authenticated
using ((select public.is_current_user_support_employee()));

create policy "Support administrators view all support requests"
on public.support_requests
for select
to authenticated
using ((select public.is_current_user_support_admin()));

create policy "Customers view messages on their own support requests"
on public.support_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.support_requests r
    where r.id = support_messages.support_request_id
      and r.customer_user_id = (select auth.uid())
  )
);

create policy "Support employees view all support messages"
on public.support_messages
for select
to authenticated
using ((select public.is_current_user_support_employee()));

create policy "Support administrators view all support messages"
on public.support_messages
for select
to authenticated
using ((select public.is_current_user_support_admin()));

create function public.create_authenticated_support_request(
  p_subject text,
  p_category text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := (select auth.uid());
  v_customer_name text;
  v_customer_email text;
  v_request_id uuid;
begin
  if v_customer_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if public.is_current_user_support_admin()
     or exists (
       select 1
       from public.support_users s
       where s.user_id = v_customer_id and s.revoked_at is null
     ) then
    raise exception 'Support employees and administrators cannot act as customers.' using errcode = '42501';
  end if;
  if nullif(btrim(p_subject), '') is null or char_length(btrim(p_subject)) > 200 then
    raise exception 'A subject of up to 200 characters is required.' using errcode = '22023';
  end if;
  if p_category not in ('general', 'account', 'event', 'reservation', 'order', 'technical', 'other') then
    raise exception 'A valid support category is required.' using errcode = '22023';
  end if;
  if nullif(btrim(p_body), '') is null or char_length(btrim(p_body)) > 10000 then
    raise exception 'A message of up to 10000 characters is required.' using errcode = '22023';
  end if;

  select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), coalesce(nullif(btrim(p.email), ''), nullif(btrim(u.email), ''))
    into v_customer_name, v_customer_email
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = v_customer_id;
  if nullif(btrim(v_customer_name), '') is null or nullif(btrim(v_customer_email), '') is null then
    raise exception 'A complete profile name and email are required to contact Support.' using errcode = '22023';
  end if;

  insert into public.support_requests (
    customer_user_id, customer_name, customer_email, subject, category
  ) values (
    v_customer_id, v_customer_name, v_customer_email, btrim(p_subject), p_category
  ) returning id into v_request_id;

  insert into public.support_messages (
    support_request_id, sender_user_id, sender_type, sender_name, sender_email, body
  ) values (
    v_request_id, v_customer_id, 'customer', v_customer_name, v_customer_email, btrim(p_body)
  );
  return v_request_id;
end;
$$;

create function public.add_customer_support_message(p_support_request_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := (select auth.uid());
  v_message_id uuid;
  v_customer_name text;
  v_customer_email text;
begin
  if v_customer_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if public.is_current_user_support_admin()
     or exists (
       select 1
       from public.support_users s
       where s.user_id = v_customer_id and s.revoked_at is null
     ) then
    raise exception 'Support employees and administrators cannot act as customers.' using errcode = '42501';
  end if;
  if nullif(btrim(p_body), '') is null or char_length(btrim(p_body)) > 10000 then
    raise exception 'A message of up to 10000 characters is required.' using errcode = '22023';
  end if;

  select customer_name, customer_email into v_customer_name, v_customer_email
  from public.support_requests
  where id = p_support_request_id and customer_user_id = v_customer_id
  for update;
  if not found then
    raise exception 'Support Request not found.' using errcode = 'P0002';
  end if;

  insert into public.support_messages (
    support_request_id, sender_user_id, sender_type, sender_name, sender_email, body
  ) values (
    p_support_request_id, v_customer_id, 'customer', v_customer_name, v_customer_email, btrim(p_body)
  ) returning id into v_message_id;

  update public.support_requests
  set status = 'open', updated_at = now(), resolved_at = null,
      resolved_by_user_id = null, resolved_by_name = null, resolved_by_email = null
  where id = p_support_request_id;
  return v_message_id;
end;
$$;

create function public.reply_to_support_request(p_support_request_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_support_id uuid := public.assert_current_user_is_support_employee();
  v_support_name text;
  v_support_email text;
  v_message_id uuid;
begin
  if nullif(btrim(p_body), '') is null or char_length(btrim(p_body)) > 10000 then
    raise exception 'A message of up to 10000 characters is required.' using errcode = '22023';
  end if;
  perform 1 from public.support_requests where id = p_support_request_id for update;
  if not found then
    raise exception 'Support Request not found.' using errcode = 'P0002';
  end if;
  select coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), nullif(btrim(u.email), '')),
         nullif(btrim(u.email), '')
    into v_support_name, v_support_email
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = v_support_id;
  if nullif(btrim(v_support_name), '') is null or nullif(btrim(v_support_email), '') is null then
    raise exception 'A Support profile name and email are required.' using errcode = '22023';
  end if;

  insert into public.support_messages (
    support_request_id, sender_user_id, sender_type, sender_name, sender_email, body
  ) values (
    p_support_request_id, v_support_id, 'support', v_support_name, v_support_email, btrim(p_body)
  ) returning id into v_message_id;
  update public.support_requests
  set status = 'waiting_for_user', updated_at = now(), resolved_at = null,
      resolved_by_user_id = null, resolved_by_name = null, resolved_by_email = null
  where id = p_support_request_id;
  return v_message_id;
end;
$$;

create function public.claim_support_request(p_support_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_support_id uuid := public.assert_current_user_is_support_employee();
begin
  update public.support_requests
  set assigned_support_user_id = v_support_id, updated_at = now()
  where id = p_support_request_id and assigned_support_user_id is null;
  if not found then
    if not exists (select 1 from public.support_requests where id = p_support_request_id) then
      raise exception 'Support Request not found.' using errcode = 'P0002';
    end if;
    raise exception 'This Support Request is already assigned.' using errcode = '23505';
  end if;
end;
$$;

create function public.resolve_support_request(p_support_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_support_id uuid := public.assert_current_user_is_support_employee();
  v_support_name text;
  v_support_email text;
begin
  select coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), nullif(btrim(u.email), '')),
         nullif(btrim(u.email), '')
    into v_support_name, v_support_email
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = v_support_id;
  if nullif(btrim(v_support_name), '') is null or nullif(btrim(v_support_email), '') is null then
    raise exception 'A Support profile name and email are required.' using errcode = '22023';
  end if;
  update public.support_requests
  set status = 'resolved', updated_at = now(), resolved_at = now(),
      resolved_by_user_id = v_support_id, resolved_by_name = v_support_name,
      resolved_by_email = v_support_email
  where id = p_support_request_id;
  if not found then
    raise exception 'Support Request not found.' using errcode = 'P0002';
  end if;
end;
$$;

create function public.assign_support_request(p_support_request_id uuid, p_support_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_support_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_support_user_id is null then
    raise exception 'A Support employee is required.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.support_users s
    where s.user_id = p_support_user_id and s.revoked_at is null
      and not exists (select 1 from public.admin_users a where a.user_id = s.user_id)
  ) then
    raise exception 'The selected user is not an active Support employee.' using errcode = '22023';
  end if;
  update public.support_requests
  set assigned_support_user_id = p_support_user_id, updated_at = now()
  where id = p_support_request_id;
  if not found then
    raise exception 'Support Request not found.' using errcode = 'P0002';
  end if;
end;
$$;

create function public.admin_grant_support_membership(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_target_name text;
  v_target_email text;
  v_admin_name text;
  v_admin_email text;
  v_membership_id uuid;
begin
  if not public.is_current_user_support_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.admin_users a where a.user_id = p_user_id) then
    raise exception 'Administrators cannot be granted Support membership.' using errcode = '42501';
  end if;
  if exists (select 1 from public.support_users s where s.user_id = p_user_id and s.revoked_at is null) then
    raise exception 'The user already has active Support membership.' using errcode = '23505';
  end if;

  select coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), nullif(btrim(u.email), '')),
         nullif(btrim(u.email), '')
    into v_target_name, v_target_email
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = p_user_id;
  select coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), nullif(btrim(u.email), '')),
         nullif(btrim(u.email), '')
    into v_admin_name, v_admin_email
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = v_admin_id;
  if nullif(btrim(v_target_name), '') is null or nullif(btrim(v_target_email), '') is null
     or nullif(btrim(v_admin_name), '') is null or nullif(btrim(v_admin_email), '') is null then
    raise exception 'Both the user and the acting administrator require a profile name and email.' using errcode = '22023';
  end if;

  insert into public.support_users (user_id, user_name, user_email, granted_by, granted_by_name, granted_by_email)
  values (p_user_id, v_target_name, v_target_email, v_admin_id, v_admin_name, v_admin_email)
  returning id into v_membership_id;
  return v_membership_id;
end;
$$;

create function public.admin_revoke_support_membership(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_admin_name text;
  v_admin_email text;
begin
  if not public.is_current_user_support_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  select coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), nullif(btrim(u.email), '')),
         nullif(btrim(u.email), '')
    into v_admin_name, v_admin_email
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = v_admin_id;
  if nullif(btrim(v_admin_name), '') is null or nullif(btrim(v_admin_email), '') is null then
    raise exception 'The acting administrator requires a profile name and email.' using errcode = '22023';
  end if;

  update public.support_users
  set revoked_at = now(), revoked_by = v_admin_id,
      revoked_by_name = v_admin_name, revoked_by_email = v_admin_email
  where user_id = p_user_id and revoked_at is null;
  if not found then
    raise exception 'Active Support membership not found.' using errcode = 'P0002';
  end if;
  update public.support_requests
  set assigned_support_user_id = null, updated_at = now()
  where assigned_support_user_id = p_user_id;
end;
$$;

revoke all on function
  public.create_authenticated_support_request(text, text, text),
  public.add_customer_support_message(uuid, text),
  public.reply_to_support_request(uuid, text),
  public.claim_support_request(uuid),
  public.resolve_support_request(uuid),
  public.assign_support_request(uuid, uuid),
  public.admin_grant_support_membership(uuid),
  public.admin_revoke_support_membership(uuid)
from public, anon;

grant execute on function
  public.create_authenticated_support_request(text, text, text),
  public.add_customer_support_message(uuid, text),
  public.reply_to_support_request(uuid, text),
  public.claim_support_request(uuid),
  public.resolve_support_request(uuid),
  public.assign_support_request(uuid, uuid),
  public.admin_grant_support_membership(uuid),
  public.admin_revoke_support_membership(uuid)
to authenticated;
