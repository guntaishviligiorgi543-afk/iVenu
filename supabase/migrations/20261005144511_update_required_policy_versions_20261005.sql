-- Local only: publish with the October 5, 2026 legal-page update.
-- Preserve prior acceptance history and the existing RPC/security contract.
CREATE OR REPLACE FUNCTION public.accept_current_policy_versions()
 RETURNS TABLE(policy_type text, policy_version text, accepted_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'An authenticated user is required.' using errcode = '28000';
  end if;

  insert into public.user_policy_acceptances (user_id, policy_type, policy_version)
  values
    (v_user_id, 'terms_of_use', '2026-10-05'),
    (v_user_id, 'privacy_policy', '2026-10-05')
  on conflict on constraint user_policy_acceptances_user_policy_version_key do nothing;

  return query
  select acceptance.policy_type, acceptance.policy_version, acceptance.accepted_at
  from public.user_policy_acceptances acceptance
  where acceptance.user_id = v_user_id
    and (acceptance.policy_type, acceptance.policy_version) in (
      ('terms_of_use', '2026-10-05'),
      ('privacy_policy', '2026-10-05')
    )
  order by acceptance.policy_type;
end;
$function$;

revoke all on function public.accept_current_policy_versions() from public, anon;
grant execute on function public.accept_current_policy_versions() to authenticated;
notify pgrst, 'reload schema';
