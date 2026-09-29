-- Local-only Phase 2 draft. Do not apply without approval.
-- User-management audit data is private: no direct Data API grants or RLS policies.

create table public.user_policy_violations (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null,
  violation_type text not null check (char_length(btrim(violation_type)) between 1 and 120), severity text not null check (severity in ('low','medium','severe')),
  points smallint generated always as (case severity when 'low' then 1 when 'medium' then 2 when 'severe' then 4 end) stored,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000), internal_note text, created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null, expires_at timestamptz, check (expires_at is null or expires_at > created_at)
);
create table public.user_bans (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000), internal_note text, banned_at timestamptz not null default now(),
  banned_until timestamptz, is_permanent boolean not null default false, banned_by uuid references auth.users(id) on delete set null,
  unbanned_at timestamptz, unbanned_by uuid references auth.users(id) on delete set null, unban_note text,
  check ((is_permanent and banned_until is null) or (not is_permanent and banned_until is not null)), check (unbanned_at is null or unbanned_at >= banned_at)
);
create index user_policy_violations_active_user_idx on public.user_policy_violations (user_id, expires_at) where user_id is not null;
create index user_bans_history_user_idx on public.user_bans (user_id, banned_at desc) where user_id is not null;
alter table public.user_policy_violations enable row level security;
alter table public.user_bans enable row level security;
revoke all on public.user_policy_violations, public.user_bans from public, anon, authenticated;

create or replace function public.is_current_user_banned() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_bans b where b.user_id=(select auth.uid()) and b.unbanned_at is null and (b.is_permanent or b.banned_until > now()));
$$;
revoke all on function public.is_current_user_banned() from public, anon;
grant execute on function public.is_current_user_banned() to authenticated;
create or replace function public.assert_current_user_not_banned() returns void language plpgsql security definer set search_path = '' as $$
begin if public.is_current_user_banned() then raise exception 'This account is currently restricted.' using errcode = '42501'; end if; end;
$$;
revoke all on function public.assert_current_user_not_banned() from public, anon;
grant execute on function public.assert_current_user_not_banned() to authenticated;

-- Service-only internal primitives. The authenticated browser cannot execute them.
create or replace function public.admin_record_user_ban(p_actor_user_id uuid, p_user_id uuid, p_reason text, p_internal_note text, p_duration_hours integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_until timestamptz;
begin
  if p_actor_user_id is null or not exists (select 1 from public.admin_users a where a.user_id=p_actor_user_id) then raise exception 'Administrator access is required.' using errcode='42501'; end if;
  if p_user_id is null or p_user_id=p_actor_user_id then raise exception 'You cannot ban your own account.' using errcode='22023'; end if;
  if exists (select 1 from public.admin_users a where a.user_id=p_user_id) then raise exception 'Administrators cannot ban another administrator.' using errcode='42501'; end if;
  if not exists (select 1 from auth.users u where u.id=p_user_id) then raise exception 'User not found.' using errcode='P0002'; end if;
  if nullif(btrim(p_reason),'') is null or p_duration_hours not in (24,168,720,-1) then raise exception 'A reason and valid ban duration are required.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 90210));
  if exists (select 1 from public.user_bans b where b.user_id=p_user_id and b.unbanned_at is null and (b.is_permanent or b.banned_until>now())) then raise exception 'The user already has an active ban.' using errcode='23505'; end if;
  v_until := case when p_duration_hours=-1 then null else now()+make_interval(hours=>p_duration_hours) end;
  insert into public.user_bans(user_id,reason,internal_note,banned_until,is_permanent,banned_by) values(p_user_id,btrim(p_reason),nullif(btrim(p_internal_note),''),v_until,p_duration_hours=-1,p_actor_user_id) returning id into v_id;
  return v_id;
end;
$$;
create or replace function public.admin_record_user_unban(p_actor_user_id uuid, p_user_id uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_actor_user_id is null or not exists (select 1 from public.admin_users a where a.user_id=p_actor_user_id) then raise exception 'Administrator access is required.' using errcode='42501'; end if;
  if p_user_id is null or p_user_id=p_actor_user_id then raise exception 'You cannot unban your own account.' using errcode='22023'; end if;
  if exists (select 1 from public.admin_users a where a.user_id=p_user_id) then raise exception 'Administrators cannot unban another administrator.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 90210));
  update public.user_bans set unbanned_at=now(),unbanned_by=p_actor_user_id,unban_note=nullif(btrim(p_note),'') where id=(select b.id from public.user_bans b where b.user_id=p_user_id and b.unbanned_at is null and (b.is_permanent or b.banned_until>now()) order by b.banned_at desc limit 1) returning id into v_id;
  if v_id is null then raise exception 'No active ban was found.' using errcode='P0002'; end if;
  return v_id;
end;
$$;
revoke all on function public.admin_record_user_ban(uuid,uuid,text,text,integer), public.admin_record_user_unban(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_record_user_ban(uuid,uuid,text,text,integer), public.admin_record_user_unban(uuid,uuid,text) to service_role;

create or replace function public.admin_add_user_policy_violation(p_user_id uuid,p_violation_type text,p_severity text,p_reason text,p_internal_note text default null,p_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  if v_actor is null or not exists(select 1 from public.admin_users a where a.user_id=v_actor) then raise exception 'Administrator access is required.' using errcode='42501'; end if;
  if p_user_id is null or not exists(select 1 from auth.users u where u.id=p_user_id) then raise exception 'User not found.' using errcode='P0002'; end if;
  if nullif(btrim(p_violation_type),'') is null or p_severity not in ('low','medium','severe') or nullif(btrim(p_reason),'') is null then raise exception 'A violation type, severity, and reason are required.' using errcode='22023'; end if;
  if p_expires_at is not null and p_expires_at<=now() then raise exception 'An expiration must be in the future.' using errcode='22023'; end if;
  insert into public.user_policy_violations(user_id,violation_type,severity,reason,internal_note,created_by,expires_at) values(p_user_id,btrim(p_violation_type),p_severity,btrim(p_reason),nullif(btrim(p_internal_note),''),v_actor,p_expires_at) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.admin_add_user_policy_violation(uuid,text,text,text,text,timestamptz) from public, anon;
grant execute on function public.admin_add_user_policy_violation(uuid,text,text,text,text,timestamptz) to authenticated;

create or replace function public.get_admin_users(p_search text default null,p_profile text default null,p_newsletter text default null,p_policy text default null,p_account text default null,p_sort text default 'recent',p_page integer default 1,p_page_size integer default 20)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_offset integer:=greatest(coalesce(p_page,1)-1,0)*least(greatest(coalesce(p_page_size,20),1),100); v_size integer:=least(greatest(coalesce(p_page_size,20),1),100);
begin
 if (select auth.uid()) is null or not exists(select 1 from public.admin_users a where a.user_id=(select auth.uid())) then raise exception 'Administrator access is required.' using errcode='42501'; end if;
 return (with rows as (
   select u.id,u.email,u.created_at,p.first_name,p.last_name,exists(select 1 from public.admin_users a where a.user_id=u.id) is_admin,
     case when nullif(btrim(p.first_name),'') is not null and nullif(btrim(p.last_name),'') is not null and nullif(btrim(p.email),'') is not null then 'complete' else 'incomplete' end profile_status,
     case when exists(select 1 from public.newsletter_subscribers ns where ns.is_active and lower(ns.email)=lower(u.email)) then 'subscribed' else 'not_subscribed' end newsletter_status,
     coalesce((select sum(v.points) from public.user_policy_violations v where v.user_id=u.id and (v.expires_at is null or v.expires_at>now())),0)::integer violation_points,
     b.is_permanent,b.banned_until,(select c.name from public.cart_additions ca join public.events e on e.id=ca.event_id left join public.categories c on c.id=e.category_id where ca.user_id=u.id group by c.name order by sum(ca.quantity) desc,c.name nulls last limit 1) top_category
   from auth.users u left join public.profiles p on p.id=u.id left join lateral(select * from public.user_bans b where b.user_id=u.id and b.unbanned_at is null and (b.is_permanent or b.banned_until>now()) order by b.banned_at desc limit 1)b on true
 ), filtered as (
   select *,case when is_permanent then 'permanently_banned' when banned_until is not null then 'temporarily_banned' else 'active' end account_status,case when violation_points>=4 then 'review' when violation_points>0 then 'warning' else 'clean' end policy_status from rows
   where (nullif(btrim(p_search),'') is null or lower(coalesce(email,'')) like '%'||lower(btrim(p_search))||'%' or lower(concat_ws(' ',first_name,last_name)) like '%'||lower(btrim(p_search))||'%') and (nullif(p_profile,'') is null or profile_status=p_profile) and (nullif(p_newsletter,'') is null or newsletter_status=p_newsletter) and (nullif(p_policy,'') is null or case when violation_points>=4 then 'review' when violation_points>0 then 'warning' else 'clean' end=p_policy) and (nullif(p_account,'') is null or case when is_permanent then 'permanently_banned' when banned_until is not null then 'temporarily_banned' else 'active' end=p_account)
 ), page_rows as (select * from filtered order by case when p_sort='name_asc' then lower(concat_ws(' ',first_name,last_name,email)) end asc nulls last,case when p_sort='name_desc' then lower(concat_ws(' ',first_name,last_name,email)) end desc nulls last,case when p_sort='oldest' then created_at end asc nulls last,case when p_sort not in ('name_asc','name_desc','oldest') then created_at end desc nulls last offset v_offset limit v_size)
 select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email,'first_name',first_name,'last_name',last_name,'joined_at',created_at,'is_admin',is_admin,'profile_status',profile_status,'newsletter_status',newsletter_status,'policy_status',policy_status,'violation_points',violation_points,'account_status',account_status,'banned_until',banned_until,'top_category',coalesce(top_category,'No data'))) from page_rows),'[]'::jsonb)));
end;
$$;
revoke all on function public.get_admin_users(text,text,text,text,text,text,integer,integer) from public, anon;
grant execute on function public.get_admin_users(text,text,text,text,text,text,integer,integer) to authenticated;

create or replace function public.get_admin_users_summary() returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists(select 1 from public.admin_users a where a.user_id=(select auth.uid())) then raise exception 'Administrator access is required.' using errcode='42501'; end if;
  return (with users as (
    select u.id,p.first_name,p.last_name,p.email,b.is_permanent,b.banned_until
    from auth.users u left join public.profiles p on p.id=u.id
    left join lateral(select * from public.user_bans b where b.user_id=u.id and b.unbanned_at is null and (b.is_permanent or b.banned_until>now()) order by b.banned_at desc limit 1)b on true
  ) select jsonb_build_object('total',count(*),'active',count(*) filter(where is_permanent is null and banned_until is null),'temporarily_banned',count(*) filter(where is_permanent=false and banned_until is not null),'permanently_banned',count(*) filter(where is_permanent=true),'incomplete_profiles',count(*) filter(where nullif(btrim(first_name),'') is null or nullif(btrim(last_name),'') is null or nullif(btrim(email),'') is null)) from users);
end;
$$;
revoke all on function public.get_admin_users_summary() from public, anon;
grant execute on function public.get_admin_users_summary() to authenticated;

create or replace function public.get_admin_user_detail(p_user_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if (select auth.uid()) is null or not exists(select 1 from public.admin_users a where a.user_id=(select auth.uid())) then raise exception 'Administrator access is required.' using errcode='42501'; end if;
 if not exists(select 1 from auth.users u where u.id=p_user_id) then raise exception 'User not found.' using errcode='P0002'; end if;
 return (select jsonb_build_object('user',jsonb_build_object('id',u.id,'email',u.email,'joined_at',u.created_at,'first_name',p.first_name,'last_name',p.last_name,'phone',p.phone,'is_admin',exists(select 1 from public.admin_users a where a.user_id=u.id),'newsletter_subscribed',exists(select 1 from public.newsletter_subscribers ns where ns.is_active and lower(ns.email)=lower(u.email))),'activity',jsonb_build_object('orders',coalesce((select count(*) from public.orders o where o.user_id=u.id),0),'cart_additions',coalesce((select sum(ca.quantity) from public.cart_additions ca where ca.user_id=u.id),0),'active_reservations',coalesce((select count(*) from public.event_seats es where es.reserved_by=u.id and es.reserved_until>now()),0)),'violations',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'type',v.violation_type,'severity',v.severity,'points',v.points,'reason',v.reason,'internal_note',v.internal_note,'created_at',v.created_at,'expires_at',v.expires_at,'created_by',coalesce(pb.email,'System'))) from public.user_policy_violations v left join auth.users pb on pb.id=v.created_by where v.user_id=u.id order by v.created_at desc),'[]'::jsonb),'bans',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'reason',b.reason,'internal_note',b.internal_note,'banned_at',b.banned_at,'banned_until',b.banned_until,'is_permanent',b.is_permanent,'banned_by',coalesce(bu.email,'System'),'unbanned_at',b.unbanned_at,'unbanned_by',uu.email,'unban_note',b.unban_note,'status',case when b.unbanned_at is not null then 'unbanned' when not b.is_permanent and b.banned_until<=now() then 'expired' else 'active' end)) from public.user_bans b left join auth.users bu on bu.id=b.banned_by left join auth.users uu on uu.id=b.unbanned_by where b.user_id=u.id order by b.banned_at desc),'[]'::jsonb)) from auth.users u left join public.profiles p on p.id=u.id where u.id=p_user_id);
end;
$$;
revoke all on function public.get_admin_user_detail(uuid) from public, anon;
grant execute on function public.get_admin_user_detail(uuid) to authenticated;

-- A valid existing JWT can outlive an Auth ban briefly. This trigger is the
-- central server-side backstop for user-owned account and cart mutations,
-- including calls made through SECURITY DEFINER reservation/checkout RPCs.
create or replace function public.prevent_banned_user_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_current_user_not_banned();
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.prevent_banned_user_mutation() from public, anon;

create trigger profiles_reject_banned_mutations
before insert or update or delete on public.profiles
for each row execute function public.prevent_banned_user_mutation();
create trigger cart_items_reject_banned_mutations
before insert or update or delete on public.cart_items
for each row execute function public.prevent_banned_user_mutation();
