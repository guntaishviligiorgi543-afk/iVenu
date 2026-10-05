alter table public.login_trusted_devices
  add column if not exists last_successful_sign_in_at timestamptz;

alter table public.login_trusted_devices
  add column if not exists last_successful_session_id text;

update public.login_trusted_devices
set last_successful_sign_in_at = coalesce(last_successful_sign_in_at, last_verified_at)
where last_successful_sign_in_at is null;

alter table public.login_trusted_devices
  alter column last_successful_sign_in_at set not null;

create table if not exists public.login_signup_trust_intents (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  device_token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  consumed_at timestamptz,
  user_id uuid references auth.users(id) on delete cascade
);

create index if not exists login_signup_trust_intents_lookup_idx
  on public.login_signup_trust_intents(email_hash, device_token_hash, created_at desc);

alter table public.login_signup_trust_intents enable row level security;
revoke all on public.login_signup_trust_intents from anon, authenticated;

create or replace function public.login_security_touch_successful_sign_in(
  p_user_id uuid,
  p_device_token_hash text,
  p_session_id text,
  p_session_started_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.login_trusted_devices%rowtype;
  v_now timestamptz := now();
begin
  if p_user_id is null or p_device_token_hash is null
     or p_session_id is null or p_session_started_at is null then
    return null;
  end if;

  select *
    into v_device
  from public.login_trusted_devices
  where user_id = p_user_id
    and device_token_hash = p_device_token_hash
  for update;

  if not found or v_device.last_successful_session_id = p_session_id
     or p_session_started_at <= v_device.last_successful_sign_in_at then
    return v_device.last_successful_sign_in_at;
  end if;

  update public.login_trusted_devices
  set last_successful_sign_in_at = v_now,
      last_successful_session_id = p_session_id,
      last_verified_at = v_now,
      updated_at = v_now,
      last_used_at = v_now
  where id = v_device.id;

  return v_now;
end;
$$;

revoke all on function public.login_security_touch_successful_sign_in(uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.login_security_touch_successful_sign_in(uuid, text, text, timestamptz)
  to service_role;

create or replace function public.login_security_check_device(
  p_device_token_hash text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.login_trusted_devices
    where user_id = (select auth.uid())
      and device_token_hash = p_device_token_hash
      and last_successful_sign_in_at > now() - interval '24 hours'
  );
$$;

revoke all on function public.login_security_check_device(text)
  from public, anon, authenticated;
grant execute on function public.login_security_check_device(text)
  to authenticated;
