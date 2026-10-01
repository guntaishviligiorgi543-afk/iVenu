create table if not exists public.event_views (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists event_views_event_created_idx on public.event_views (event_id, created_at desc);
create index if not exists event_views_created_idx on public.event_views (created_at desc);

create table if not exists public.cart_additions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists cart_additions_event_created_idx on public.cart_additions (event_id, created_at desc);
create index if not exists cart_additions_created_idx on public.cart_additions (created_at desc);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists favorites_event_created_idx on public.favorites (event_id, created_at desc);

alter table public.event_views enable row level security;
alter table public.cart_additions enable row level security;
alter table public.favorites enable row level security;

create or replace function public.record_event_view(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  event_exists boolean;
begin
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and e.status = 'active'
  ) into event_exists;
  if not event_exists then
    return;
  end if;

  if current_user_id is null then
    insert into public.event_views (event_id, user_id) values (p_event_id, null);
    return;
  end if;

  if not exists (
    select 1 from public.event_views v
    where v.event_id = p_event_id
      and v.user_id = current_user_id
      and v.created_at >= now() - interval '5 minutes'
  ) then
    insert into public.event_views (event_id, user_id)
    values (p_event_id, current_user_id);
  end if;
end;
$$;

create or replace function public.capture_cart_addition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_for_ticket uuid;
begin
  select event_id into event_for_ticket
  from public.ticket_types
  where id = new.ticket_type_id;
  if event_for_ticket is not null then
    insert into public.cart_additions (event_id, ticket_type_id, user_id, quantity)
    values (event_for_ticket, new.ticket_type_id, new.user_id, greatest(new.quantity, 1));
  end if;
  return new;
end;
$$;

drop trigger if exists cart_items_capture_addition on public.cart_items;
create trigger cart_items_capture_addition
after insert on public.cart_items
for each row execute function public.capture_cart_addition();

create or replace function public.toggle_favorite(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  removed boolean := false;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found';
  end if;
  delete from public.favorites
  where event_id = p_event_id and user_id = current_user_id;
  removed := found;
  if not removed then
    insert into public.favorites (event_id, user_id)
    values (p_event_id, current_user_id)
    on conflict (event_id, user_id) do nothing;
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.is_event_favorited(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.favorites
    where event_id = p_event_id and user_id = auth.uid()
  );
$$;

create or replace function public.get_admin_event_analytics(p_period text default 'all')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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
  favorite_counts as (
    select f.event_id, count(*)::int as favorites
    from public.favorites f
    where period_start is null or f.created_at >= period_start
    group by f.event_id
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
      coalesce(f.favorites, 0) as favorites,
      coalesce(s.tickets_sold, 0) as tickets_sold,
      coalesce(s.revenue, 0) as revenue
    from event_base b
    left join view_counts v on v.event_id = b.id
    left join cart_counts ca on ca.event_id = b.id
    left join favorite_counts f on f.event_id = b.id
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
      select 'Favorited event', b.title, f.created_at
      from public.favorites f join event_base b on b.id = f.event_id
      where period_start is null or f.created_at >= period_start
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
      'total_favorites', coalesce((select sum(favorites)::int from performance), 0),
      'total_tickets_sold', coalesce((select sum(tickets_sold)::int from performance), 0),
      'total_revenue', coalesce((select sum(revenue) from performance), 0)
    ),
    'top_cart_additions', coalesce((select jsonb_agg(to_jsonb(x) order by x.cart_adds desc, x.title) from (select title, cart_adds from performance where cart_adds > 0 order by cart_adds desc, title limit 5) x), '[]'::jsonb),
    'top_views', coalesce((select jsonb_agg(to_jsonb(x) order by x.views desc, x.title) from (select title, views from performance where views > 0 order by views desc, title limit 5) x), '[]'::jsonb),
    'top_favorites', coalesce((select jsonb_agg(to_jsonb(x) order by x.favorites desc, x.title) from (select title, favorites from performance where favorites > 0 order by favorites desc, title limit 5) x), '[]'::jsonb),
    'top_sales', coalesce((select jsonb_agg(to_jsonb(x) order by x.tickets_sold desc, x.title) from (select title, tickets_sold, revenue from performance where tickets_sold > 0 order by tickets_sold desc, title limit 5) x), '[]'::jsonb),
    'popular_category', coalesce((select to_jsonb(category_sales) from category_sales), '{}'::jsonb),
    'performance', coalesce((select jsonb_agg(to_jsonb(x) order by (x.views + x.cart_adds + x.favorites + x.tickets_sold) desc, x.revenue desc, x.title) from performance x), '[]'::jsonb),
    'recent_activity', coalesce((select jsonb_agg(to_jsonb(recent) order by recent.created_at desc) from recent), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on public.event_views from anon, authenticated;
revoke all on public.cart_additions from anon, authenticated;
revoke all on public.favorites from anon, authenticated;
grant execute on function public.record_event_view(uuid) to anon, authenticated;
grant execute on function public.toggle_favorite(uuid) to authenticated;
grant execute on function public.is_event_favorited(uuid) to authenticated;
grant execute on function public.get_admin_event_analytics(text) to authenticated;
;
