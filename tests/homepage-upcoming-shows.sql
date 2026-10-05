-- Run against a database with an existing Admin. All data changes are rolled back.
begin;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', (select user_id from public.admin_users limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

do $test$
declare
  v_limit integer;
  v_invalid integer;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'This regression test requires an existing Admin.';
  end if;

  foreach v_limit in array array[8, 2] loop
    perform public.admin_save_homepage_upcoming_shows_config(p_display_limit => v_limit);
    if (select display_limit from public.homepage_upcoming_shows_configs where id) <> v_limit
      or (public.get_admin_homepage_upcoming_shows_config()->>'display_limit')::integer <> v_limit then
      raise exception 'Saved limit % was not returned by the Admin reload RPC.', v_limit;
    end if;
    select count(*) into v_count from public.get_homepage_upcoming_shows();
    if v_count > v_limit then
      raise exception 'Public read exceeded the saved limit %.', v_limit;
    end if;
  end loop;

  foreach v_invalid in array array[null::integer, 0, -1] loop
    begin
      perform public.admin_save_homepage_upcoming_shows_config(v_invalid);
      raise exception 'Invalid limit % was accepted.', v_invalid;
    exception when invalid_parameter_value then
      null;
    end;
  end loop;

  begin
    update public.homepage_upcoming_shows_configs set display_limit = 8 where id;
    raise exception 'Direct authenticated table write was accepted.';
  exception when insufficient_privilege then
    null;
  end;
end;
$test$;

reset role;
-- Use a non-Admin identity without creating/modifying any user.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
set local role authenticated;
do $test$
begin
  begin
    perform public.admin_save_homepage_upcoming_shows_config(8);
    raise exception 'Non-Admin write was accepted.';
  exception when insufficient_privilege then
    if sqlerrm <> 'Administrator access is required.' then raise; end if;
  end;
end;
$test$;

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $test$
begin
  begin
    perform public.admin_save_homepage_upcoming_shows_config(8);
    raise exception 'Anonymous RPC write was accepted.';
  exception when insufficient_privilege then
    null;
  end;
  if has_table_privilege(current_user, 'public.homepage_upcoming_shows_configs', 'TRUNCATE') then
    raise exception 'Anonymous role can truncate the configuration.';
  end if;
  if (select count(*) from public.get_homepage_upcoming_shows()) > 2 then
    raise exception 'Anonymous read ignored the saved smaller limit.';
  end if;
end;
$test$;
rollback;
select 'PASS: larger/smaller saves, Admin readback, public limit, invalid inputs, non-Admin/anonymous denial, direct-write denial; test data rolled back.' as result;
