-- The homepage Hero is a singleton configuration (`homepage_hero_configs.id = true`).
-- Manual slots are therefore scoped to its only valid slot range rather than deleted
-- with an unqualified table-wide mutation.
create or replace function public.admin_save_homepage_hero_config(p_mode text, p_event_ids uuid[])
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

  if p_mode not in ('automatic', 'manual') then
    raise exception 'Choose automatic or manual Hero selection.';
  end if;
  if coalesce(cardinality(p_event_ids), 0) > 3 then
    raise exception 'Choose at most three Hero events.';
  end if;
  if (
    select count(distinct event_id)
    from unnest(coalesce(p_event_ids, '{}'::uuid[])) event_id
    where event_id is not null
  ) <> (
    select count(*)
    from unnest(coalesce(p_event_ids, '{}'::uuid[])) event_id
    where event_id is not null
  ) then
    raise exception 'An event can only occupy one Hero slot.';
  end if;

  foreach v_event_id in array p_event_ids loop
    if v_event_id is not null and not exists (
      select 1 from public.events event where event.id = v_event_id and event.status = 'active'
    ) then
      raise exception 'Hero events must be active.';
    end if;
  end loop;

  insert into public.homepage_hero_configs (id, mode, updated_at)
  values (true, p_mode, now())
  on conflict (id) do update
    set mode = excluded.mode, updated_at = excluded.updated_at;

  -- Automatic mode intentionally preserves the last manual choices.
  if p_mode = 'manual' then
    delete from public.homepage_hero_slots hero_slot
    where hero_slot.slot between 1 and 3
      and exists (
        select 1 from public.homepage_hero_configs config where config.id is true
      );

    insert into public.homepage_hero_slots (slot, event_id)
    select selection.ordinality::smallint, selection.event_id
    from unnest(coalesce(p_event_ids, '{}'::uuid[])) with ordinality as selection(event_id, ordinality)
    where selection.event_id is not null;
  end if;
end;
$$;
