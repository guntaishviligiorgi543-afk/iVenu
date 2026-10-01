-- Fix only the PL/pgSQL output-column ambiguity in the policy consent RPC.
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
  on conflict on constraint user_policy_acceptances_user_policy_version_key do nothing;

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
