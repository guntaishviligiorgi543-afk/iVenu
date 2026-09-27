-- Newsletter subscriber records remain private. These RPCs provide the only
-- dashboard access path and enforce the existing trusted admin_users check.

create or replace function public.get_admin_newsletter_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.admin_users admin where admin.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;

  return (
    select jsonb_build_object(
      'total_subscribers', count(*)::integer,
      'active_subscribers', count(*) filter (where is_active)::integer,
      'inactive_subscribers', count(*) filter (where not is_active)::integer,
      'new_subscribers_last_30_days', count(*) filter (where subscribed_at >= now() - interval '30 days')::integer
    )
    from public.newsletter_subscribers
  );
end;
$$;

create or replace function public.get_admin_newsletter_subscribers(
  p_search text default null,
  p_is_active boolean default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := nullif(lower(btrim(p_search)), '');
begin
  if not exists (
    select 1 from public.admin_users admin where admin.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;

  return (
    with filtered as (
      select email, is_active, subscribed_at
      from public.newsletter_subscribers
      where (p_is_active is null or is_active = p_is_active)
        and (v_search is null or lower(email) like '%' || v_search || '%')
    ), page_rows as (
      select email, is_active, subscribed_at
      from filtered
      order by subscribed_at desc, email asc
      limit v_page_size
      offset (v_page - 1) * v_page_size
    )
    select jsonb_build_object(
      'total', (select count(*)::integer from filtered),
      'subscribers', coalesce(
        (select jsonb_agg(jsonb_build_object(
          'email', email,
          'is_active', is_active,
          'subscribed_at', subscribed_at
        ) order by subscribed_at desc, email asc) from page_rows),
        '[]'::jsonb
      )
    )
  );
end;
$$;

create or replace function public.admin_set_newsletter_subscriber_status(
  p_email text,
  p_is_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if not exists (
    select 1 from public.admin_users admin where admin.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;

  if v_email is null or v_email = '' or p_is_active is null then
    raise exception 'A subscriber email and status are required.' using errcode = '22023';
  end if;

  update public.newsletter_subscribers
  set is_active = p_is_active
  where email = v_email;

  if not found then
    raise exception 'Subscriber not found.' using errcode = 'P0002';
  end if;

  return true;
end;
$$;

revoke all on function public.get_admin_newsletter_overview() from public, anon;
revoke all on function public.get_admin_newsletter_subscribers(text, boolean, integer, integer) from public, anon;
revoke all on function public.admin_set_newsletter_subscriber_status(text, boolean) from public, anon;

grant execute on function public.get_admin_newsletter_overview() to authenticated;
grant execute on function public.get_admin_newsletter_subscribers(text, boolean, integer, integer) to authenticated;
grant execute on function public.admin_set_newsletter_subscriber_status(text, boolean) to authenticated;
