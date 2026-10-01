-- Support unread/read state for per-user conversation positions.
create table public.support_request_read_states (
  request_id uuid not null references public.support_requests(id) on delete cascade,
  reader_user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (request_id, reader_user_id)
);

alter table public.support_request_read_states enable row level security;

revoke all on table public.support_request_read_states from public, anon, authenticated;

create function public.mark_support_request_read(p_support_request_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reader_id uuid := (select auth.uid());
  v_is_support boolean := public.is_current_user_support_employee();
  v_is_admin boolean := public.is_current_user_support_admin();
  v_last_read_at timestamptz := now();
begin
  if v_reader_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if v_is_admin then
    raise exception 'Administrators cannot mark Support activity as read.' using errcode = '42501';
  end if;
  if v_is_support then
    perform 1 from public.support_requests where id = p_support_request_id;
  else
    perform 1
    from public.support_requests
    where id = p_support_request_id and customer_user_id = v_reader_id;
  end if;
  if not found then
    raise exception 'Support Request not found.' using errcode = 'P0002';
  end if;

  insert into public.support_request_read_states (request_id, reader_user_id, last_read_at)
  values (p_support_request_id, v_reader_id, v_last_read_at)
  on conflict (request_id, reader_user_id)
  do update set last_read_at = greatest(
    public.support_request_read_states.last_read_at,
    excluded.last_read_at
  )
  returning last_read_at into v_last_read_at;
  return v_last_read_at;
end;
$$;

create function public.get_support_unread_state()
returns table (request_id uuid, unread_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select
      (select auth.uid()) as reader_id,
      public.is_current_user_support_employee() as is_support,
      public.is_current_user_support_admin() as is_admin
  ), accessible_requests as (
    select r.id, c.reader_id, c.is_support
    from public.support_requests r
    cross join caller c
    where c.reader_id is not null
      and not c.is_admin
      and (c.is_support or r.customer_user_id = c.reader_id)
  )
  select
    ar.id as request_id,
    count(m.id)::bigint as unread_count
  from accessible_requests ar
  left join public.support_request_read_states rs
    on rs.request_id = ar.id and rs.reader_user_id = ar.reader_id
  left join public.support_messages m
    on m.support_request_id = ar.id
   and m.sender_type = case when ar.is_support then 'customer' else 'support' end
   and m.created_at > coalesce(rs.last_read_at, '-infinity'::timestamptz)
  group by ar.id
  order by ar.id;
$$;

revoke all on function public.mark_support_request_read(uuid), public.get_support_unread_state()
  from public, anon;
grant execute on function public.mark_support_request_read(uuid), public.get_support_unread_state()
  to authenticated;
