-- Homepage Upcoming Shows stores configuration and ordered canonical event IDs only.
create table if not exists public.homepage_upcoming_shows_configs (
  id boolean primary key default true check (id),
  mode text not null default 'latest_added'
    check (mode in ('latest_added', 'most_added_to_cart', 'best_selling', 'custom_selection')),
  updated_at timestamptz not null default now()
);

create table if not exists public.homepage_upcoming_shows_custom_events (
  event_id uuid primary key references public.events(id) on delete cascade,
  display_order smallint not null unique check (display_order between 1 and 4)
);

alter table public.homepage_upcoming_shows_configs enable row level security;
alter table public.homepage_upcoming_shows_custom_events enable row level security;

create policy "Public read homepage upcoming shows config"
  on public.homepage_upcoming_shows_configs for select using (true);
create policy "Public read homepage upcoming shows custom events"
  on public.homepage_upcoming_shows_custom_events for select using (true);

create index if not exists cart_additions_event_id_idx
  on public.cart_additions (event_id);
create index if not exists order_items_ticket_type_id_idx
  on public.order_items (ticket_type_id);

-- The display limit lives in this public read function so every mode has one source of truth.
create or replace function public.get_homepage_upcoming_shows()
returns table (
  id uuid, performer text, title text, description text, event_date date,
  event_time time without time zone, venue text, city text, country text,
  image_url text, category text
)
language sql
security definer
set search_path = ''
as $$
  with settings as (
    select coalesce(
      (select mode from public.homepage_upcoming_shows_configs where id),
      'latest_added'
    ) as mode,
    4::integer as display_limit
  ), eligible as (
    select event.id, event.performer, event.title, event.description, event.event_date,
      event.event_time, coalesce(venue_row.name, event.venue) as venue,
      coalesce(venue_row.city_area, event.city) as city,
      coalesce(venue_row.country, event.country) as country, event.image_url,
      category.name as category, event.created_at
    from public.events event
    left join public.venues venue_row on venue_row.id = event.venue_id
    left join public.categories category on category.id = event.category_id
    where event.status = 'active' and event.event_date >= current_date
  ), cart_ranked as (
    select event.id, coalesce(sum(cart_addition.quantity), 0)::bigint as cart_units
    from eligible event
    left join public.cart_additions cart_addition on cart_addition.event_id = event.id
    group by event.id
  ), sales_ranked as (
    select event.id, coalesce(sum(order_item.quantity) filter (where purchase.status = 'paid'), 0)::bigint as sold_units
    from eligible event
    left join public.ticket_types ticket_type on ticket_type.event_id = event.id
    left join public.order_items order_item on order_item.ticket_type_id = ticket_type.id
    left join public.orders purchase on purchase.id = order_item.order_id
    group by event.id
  ), selected as (
    select event.*, row_number() over (order by event.created_at desc, event.id desc) as position
    from eligible event cross join settings
    where settings.mode = 'latest_added'

    union all

    select event.*, row_number() over (order by cart_ranked.cart_units desc, event.created_at desc, event.id desc) as position
    from eligible event
    join cart_ranked on cart_ranked.id = event.id
    cross join settings
    where settings.mode = 'most_added_to_cart'

    union all

    select event.*, row_number() over (order by sales_ranked.sold_units desc, event.created_at desc, event.id desc) as position
    from eligible event
    join sales_ranked on sales_ranked.id = event.id
    cross join settings
    where settings.mode = 'best_selling'

    union all

    select event.*, custom_event.display_order as position
    from public.homepage_upcoming_shows_custom_events custom_event
    join eligible event on event.id = custom_event.event_id
    cross join settings
    where settings.mode = 'custom_selection'
  )
  select id, performer, title, description, event_date, event_time, venue, city, country, image_url, category
  from selected
  where position <= (select display_limit from settings)
  order by position, id;
$$;

create or replace function public.get_admin_homepage_upcoming_shows_config()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.admin_users admin where admin.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;

  return jsonb_build_object(
    'mode', coalesce((select mode from public.homepage_upcoming_shows_configs where id), 'latest_added'),
    'display_limit', 4,
    'event_ids', coalesce((
      select jsonb_agg(event_id order by display_order)
      from public.homepage_upcoming_shows_custom_events
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_save_homepage_upcoming_shows_config(
  p_mode text,
  p_event_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if not exists (
    select 1 from public.admin_users admin where admin.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;

  if p_mode not in ('latest_added', 'most_added_to_cart', 'best_selling', 'custom_selection') then
    raise exception 'Choose a valid Upcoming Shows display mode.';
  end if;
  if coalesce(cardinality(p_event_ids), 0) > 4 then
    raise exception 'Upcoming Shows can display at most four events.';
  end if;
  if (
    select count(distinct event_id)
    from unnest(coalesce(p_event_ids, '{}'::uuid[])) event_id
  ) <> coalesce(cardinality(p_event_ids), 0) then
    raise exception 'An event can only appear once in Upcoming Shows.';
  end if;

  if p_mode = 'custom_selection' then
    foreach v_event_id in array coalesce(p_event_ids, '{}'::uuid[]) loop
      if not exists (
        select 1 from public.events event
        where event.id = v_event_id
          and event.status = 'active'
          and event.event_date >= current_date
      ) then
        raise exception 'Custom Upcoming Shows events must be active and upcoming.';
      end if;
    end loop;
  end if;

  insert into public.homepage_upcoming_shows_configs (id, mode, updated_at)
  values (true, p_mode, now())
  on conflict (id) do update set mode = excluded.mode, updated_at = excluded.updated_at;

  -- Automatic modes intentionally preserve the saved custom selection for later reuse.
  if p_mode = 'custom_selection' then
    delete from public.homepage_upcoming_shows_custom_events;
    insert into public.homepage_upcoming_shows_custom_events (event_id, display_order)
    select event_id, ordinality::smallint
    from unnest(coalesce(p_event_ids, '{}'::uuid[])) with ordinality as selection(event_id, ordinality);
  end if;
end;
$$;

revoke all on function public.get_homepage_upcoming_shows() from public;
revoke all on function public.get_admin_homepage_upcoming_shows_config() from public, anon;
revoke all on function public.admin_save_homepage_upcoming_shows_config(text, uuid[]) from public, anon;
grant execute on function public.get_homepage_upcoming_shows() to anon, authenticated;
grant execute on function public.get_admin_homepage_upcoming_shows_config() to authenticated;
grant execute on function public.admin_save_homepage_upcoming_shows_config(text, uuid[]) to authenticated;
