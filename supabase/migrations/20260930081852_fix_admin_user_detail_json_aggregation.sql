-- Keep history ordering inside jsonb_agg.  An ORDER BY attached to the
-- correlated aggregate SELECT references an ungrouped row column and raises
-- SQLSTATE 42803 at runtime.
create or replace function public.get_admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not exists (
       select 1
       from public.admin_users a
       where a.user_id = (select auth.uid())
     ) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;

  return (
    select jsonb_build_object(
      'user', jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'joined_at', u.created_at,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'phone', p.phone,
        'is_admin', exists (select 1 from public.admin_users a where a.user_id = u.id),
        'newsletter_subscribed', exists (
          select 1
          from public.newsletter_subscribers ns
          where ns.is_active and lower(ns.email) = lower(u.email)
        )
      ),
      'activity', jsonb_build_object(
        'orders', coalesce((select count(*) from public.orders o where o.user_id = u.id), 0),
        'cart_additions', coalesce((select sum(ca.quantity) from public.cart_additions ca where ca.user_id = u.id), 0),
        'active_reservations', coalesce((select count(*) from public.event_seats es where es.reserved_by = u.id and es.reserved_until > now()), 0)
      ),
      'violations', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'type', v.violation_type,
            'severity', v.severity,
            'points', v.points,
            'reason', v.reason,
            'internal_note', v.internal_note,
            'created_at', v.created_at,
            'expires_at', v.expires_at,
            'created_by', coalesce(pb.email, 'System')
          )
          order by v.created_at desc
        )
        from public.user_policy_violations v
        left join auth.users pb on pb.id = v.created_by
        where v.user_id = u.id
      ), '[]'::jsonb),
      'bans', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', b.id,
            'reason', b.reason,
            'internal_note', b.internal_note,
            'banned_at', b.banned_at,
            'banned_until', b.banned_until,
            'duration_hours', case when b.is_permanent then null else round(extract(epoch from (b.banned_until - b.banned_at)) / 3600)::integer end,
            'is_permanent', b.is_permanent,
            'banned_by', coalesce(bu.email, 'System'),
            'unbanned_at', b.unbanned_at,
            'unbanned_by', uu.email,
            'unban_note', b.unban_note,
            'status', case
              when b.unbanned_at is not null then 'unbanned'
              when not b.is_permanent and b.banned_until <= now() then 'expired'
              else 'active'
            end
          )
          order by b.banned_at desc
        )
        from public.user_bans b
        left join auth.users bu on bu.id = b.banned_by
        left join auth.users uu on uu.id = b.unbanned_by
        where b.user_id = u.id
      ), '[]'::jsonb)
    )
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id = p_user_id
  );
end;
$$;

revoke all on function public.get_admin_user_detail(uuid) from public, anon;
grant execute on function public.get_admin_user_detail(uuid) to authenticated;
