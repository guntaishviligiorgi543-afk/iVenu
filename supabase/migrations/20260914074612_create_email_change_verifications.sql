create table if not exists public.email_change_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  new_email text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  consumed_at timestamptz,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists email_change_verifications_user_idx
  on public.email_change_verifications(user_id, created_at desc);

alter table public.email_change_verifications enable row level security;

revoke all on public.email_change_verifications from anon, authenticated;

drop policy if exists "Email change verification is server only" on public.email_change_verifications;;
