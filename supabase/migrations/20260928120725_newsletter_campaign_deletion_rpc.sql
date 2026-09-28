-- Admin-only, atomic deletion of campaign history. Delivery rows are removed by
-- the existing ON DELETE CASCADE foreign key. Unsubscribe tokens are deliberately
-- independent and are not removed, so delivered-email unsubscribe links remain valid.

create or replace function public.admin_delete_newsletter_campaigns(
  p_campaign_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_ids uuid[];
  v_requested_count integer;
  v_existing_count integer;
  v_deleted_count integer;
begin
  if not exists (
    select 1
    from public.admin_users a
    where a.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;

  if p_campaign_ids is null or cardinality(p_campaign_ids) = 0 then
    raise exception 'Select at least one campaign.' using errcode = '22023';
  end if;

  if exists (select 1 from unnest(p_campaign_ids) as campaign_id where campaign_id is null) then
    raise exception 'Campaign IDs must be valid.' using errcode = '22023';
  end if;

  v_requested_count := cardinality(p_campaign_ids);

  select array_agg(campaign_id order by campaign_id)
  into v_campaign_ids
  from (
    select distinct campaign_id
    from unnest(p_campaign_ids) as campaign_id
  ) requested;

  if cardinality(v_campaign_ids) <> v_requested_count then
    raise exception 'Campaign IDs must be unique.' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_existing_count
  from public.newsletter_campaigns c
  where c.id = any(v_campaign_ids);

  if v_existing_count <> v_requested_count then
    raise exception 'One or more campaigns no longer exist.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.newsletter_campaigns c
    where c.id = any(v_campaign_ids)
      and c.status = 'sending'
  ) then
    raise exception 'A campaign currently being sent cannot be deleted.' using errcode = '55000';
  end if;

  delete from public.newsletter_campaigns c
  where c.id = any(v_campaign_ids);

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

revoke all on function public.admin_delete_newsletter_campaigns(uuid[]) from public, anon;
grant execute on function public.admin_delete_newsletter_campaigns(uuid[]) to authenticated;
