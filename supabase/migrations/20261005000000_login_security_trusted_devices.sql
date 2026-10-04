create table if not exists public.login_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_token_hash text not null,
  last_verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (user_id, device_token_hash)
);

create table if not exists public.login_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_token_hash text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  consumed_at timestamptz,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists login_otp_challenges_one_active
  on public.login_otp_challenges(user_id)
  where consumed_at is null;

create index if not exists login_trusted_devices_user_idx
  on public.login_trusted_devices(user_id);

create index if not exists login_otp_challenges_lookup_idx
  on public.login_otp_challenges(user_id, device_token_hash, created_at desc);

alter table public.login_trusted_devices enable row level security;
alter table public.login_otp_challenges enable row level security;

revoke all on public.login_trusted_devices from anon, authenticated;
revoke all on public.login_otp_challenges from anon, authenticated;

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
      and last_verified_at > now() - interval '24 hours'
  );
$$;

revoke all on function public.login_security_check_device(text)
  from public, anon, authenticated;
grant execute on function public.login_security_check_device(text)
  to authenticated;
