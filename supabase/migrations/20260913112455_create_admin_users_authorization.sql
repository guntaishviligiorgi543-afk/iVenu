create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create policy "Admins can read their own authorization row"
on public.admin_users
for select
to authenticated
using (user_id = (select auth.uid()));;
