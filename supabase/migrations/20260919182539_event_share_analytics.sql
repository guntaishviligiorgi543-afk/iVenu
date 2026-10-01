create table public.event_shares (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook', 'x', 'youtube')),
  created_at timestamptz not null default now()
);

create index event_shares_event_id_created_at_idx
  on public.event_shares (event_id, created_at desc);

alter table public.event_shares enable row level security;

revoke all on table public.event_shares from anon, authenticated;

create or replace function public.record_event_share(
  p_event_id uuid,
  p_platform text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_platform not in ('instagram', 'facebook', 'x', 'youtube') then
    raise exception 'Unsupported share platform';
  end if;

  if not exists (
    select 1
    from public.events
    where id = p_event_id and status = 'active'
  ) then
    raise exception 'Active event not found';
  end if;

  insert into public.event_shares (event_id, platform)
  values (p_event_id, p_platform);
end;
$$;

revoke all on function public.record_event_share(uuid, text) from public;
grant execute on function public.record_event_share(uuid, text) to anon, authenticated;

create or replace function public.get_admin_event_analytics(p_period text default 'all')
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  period_start timestamptz;
  result jsonb;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'Admin access required';
  end if;

  period_start := case p_period
    when 'today' then date_trunc('day', now())
    when '7d' then now() - interval '7 days'
    when '30d' then now() - interval '30 days'
    else null
  end;

  with event_base as (
    select e.id, e.title, e.category_id, coalesce(c.name, 'Uncategorized') as category
    from public.events e
    left join public.categories c on c.id = e.category_id
  ),
  view_counts as (
    select v.event_id, count(*)::int as views
    from public.event_views v
    where period_start is null or v.created_at >= period_start
    group by v.event_id
  ),
  cart_counts as (
    select a.event_id, count(*)::int as cart_adds
    from public.cart_additions a
    where period_start is null or a.created_at >= period_start
    group by a.event_id
  ),
  share_counts as (
    select s.event_id, count(*)::int as shares
    from public.event_shares s
    where period_start is null or s.created_at >= period_start
    group by s.event_id
  ),
  sales as (
    select tt.event_id,
      coalesce(sum(oi.quantity), 0)::int as tickets_sold,
      coalesce(sum(coalesce(oi.subtotal, oi.quantity * oi.unit_price)), 0)::numeric as revenue
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.ticket_types tt on tt.id = oi.ticket_type_id
    where lower(o.status) in ('paid', 'completed', 'confirmed', 'success')
      and (period_start is null or o.created_at >= period_start)
    group by tt.event_id
  ),
  performance as (
    select b.id as event_id, b.title, b.category,
      coalesce(v.views, 0) as views,
      coalesce(ca.cart_adds, 0) as cart_adds,
      coalesce(s.tickets_sold, 0) as tickets_sold,
      coalesce(s.revenue, 0) as revenue
    from event_base b
    left join view_counts v on v.event_id = b.id
    left join cart_counts ca on ca.event_id = b.id
    left join sales s on s.event_id = b.id
  ),
  recent as (
    select activity_type, event_title, created_at
    from (
      select 'Event viewed' as activity_type, b.title as event_title, v.created_at
      from public.event_views v join event_base b on b.id = v.event_id
      where period_start is null or v.created_at >= period_start
      union all
      select 'Added to cart', b.title, a.created_at
      from public.cart_additions a join event_base b on b.id = a.event_id
      where period_start is null or a.created_at >= period_start
      union all
      select 'Ticket purchased', b.title, o.created_at
      from public.order_items oi join public.orders o on o.id = oi.order_id
      join public.ticket_types tt on tt.id = oi.ticket_type_id
      join event_base b on b.id = tt.event_id
      where lower(o.status) in ('paid', 'completed', 'confirmed', 'success')
        and (period_start is null or o.created_at >= period_start)
    ) activity
    order by created_at desc
    limit 12
  ),
  category_sales as (
    select p.category, count(*)::int as event_count,
      sum(p.tickets_sold)::int as engagement
    from performance p
    group by p.category
    order by engagement desc, event_count desc, p.category
    limit 1
  )
  select jsonb_build_object(
    'overview', jsonb_build_object(
      'total_users', (select count(*)::int from public.profiles where period_start is null or created_at >= period_start),
      'total_events', (select count(*)::int from public.events),
      'total_event_views', coalesce((select sum(views)::int from performance), 0),
      'total_cart_additions', coalesce((select sum(cart_adds)::int from performance), 0),
      'total_tickets_sold', coalesce((select sum(tickets_sold)::int from performance), 0),
      'total_revenue', coalesce((select sum(revenue) from performance), 0)
    ),
    'top_cart_additions', coalesce((select jsonb_agg(to_jsonb(x) order by x.cart_adds desc, x.title) from (select title, cart_adds from performance where cart_adds > 0 order by cart_adds desc, title limit 5) x), '[]'::jsonb),
    'top_views', coalesce((select jsonb_agg(to_jsonb(x) order by x.views desc, x.title) from (select title, views from performance where views > 0 order by views desc, title limit 5) x), '[]'::jsonb),
    'top_sales', coalesce((select jsonb_agg(to_jsonb(x) order by x.tickets_sold desc, x.title) from (select title, tickets_sold, revenue from performance where tickets_sold > 0 order by tickets_sold desc, title limit 5) x), '[]'::jsonb),
    'top_shared', coalesce((select jsonb_agg(to_jsonb(x) order by x.shares desc, x.title) from (select b.title, sc.shares from share_counts sc join event_base b on b.id = sc.event_id order by sc.shares desc, b.title limit 5) x), '[]'::jsonb),
    'popular_category', coalesce((select to_jsonb(category_sales) from category_sales), '{}'::jsonb),
    'performance', coalesce((select jsonb_agg(to_jsonb(x) order by (x.views + x.cart_adds + x.tickets_sold) desc, x.revenue desc, x.title) from performance x), '[]'::jsonb),
    'recent_activity', coalesce((select jsonb_agg(to_jsonb(recent) order by recent.created_at desc) from recent), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
