create table public.user_policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_type text not null check (policy_type in ('terms_of_use', 'privacy_policy')),
  policy_version text not null check (char_length(btrim(policy_version)) > 0),
  accepted_at timestamptz not null default now(),
  constraint user_policy_acceptances_user_policy_version_key
    unique (user_id, policy_type, policy_version)
);

create index user_policy_acceptances_user_id_idx
  on public.user_policy_acceptances (user_id, policy_type, policy_version);

alter table public.user_policy_acceptances enable row level security;

revoke all on table public.user_policy_acceptances from public, anon, authenticated;
grant select on table public.user_policy_acceptances to authenticated;

create policy "Users can view their own policy acceptances"
  on public.user_policy_acceptances
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.accept_current_policy_versions()
returns table (
  policy_type text,
  policy_version text,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'An authenticated user is required.' using errcode = '28000';
  end if;

  insert into public.user_policy_acceptances (user_id, policy_type, policy_version)
  values
    (v_user_id, 'terms_of_use', '2026-09-29'),
    (v_user_id, 'privacy_policy', '2026-09-29')
  on conflict (user_id, policy_type, policy_version) do nothing;

  return query
  select acceptance.policy_type, acceptance.policy_version, acceptance.accepted_at
  from public.user_policy_acceptances acceptance
  where acceptance.user_id = v_user_id
    and (acceptance.policy_type, acceptance.policy_version) in (
      ('terms_of_use', '2026-09-29'),
      ('privacy_policy', '2026-09-29')
    )
  order by acceptance.policy_type;
end;
$$;

revoke all on function public.accept_current_policy_versions() from public, anon;
grant execute on function public.accept_current_policy_versions() to authenticated;
