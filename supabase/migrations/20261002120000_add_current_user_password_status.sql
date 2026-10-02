-- Exposes only the current authenticated user's password-presence state.
-- The encrypted password itself is never returned to the client.
create function public.is_current_user_password_configured()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from auth.users
      where id = (select auth.uid())
        and coalesce(encrypted_password, '') <> ''
    );
$$;

revoke all on function public.is_current_user_password_configured()
  from public, anon, authenticated;

grant execute on function public.is_current_user_password_configured()
  to authenticated;
