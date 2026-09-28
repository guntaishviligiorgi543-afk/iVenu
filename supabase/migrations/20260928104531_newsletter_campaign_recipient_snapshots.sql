-- Recipient snapshots are stored in the existing delivery table. This permits
-- a campaign's target to be fixed at draft creation while each pending delivery
-- can still be checked against the subscriber's current active status at send time.

alter table public.newsletter_campaigns
  add column if not exists recipient_mode text not null default 'all_active';

alter table public.newsletter_campaigns
  drop constraint if exists newsletter_campaigns_recipient_mode_check;

alter table public.newsletter_campaigns
  add constraint newsletter_campaigns_recipient_mode_check
  check (recipient_mode in ('all_active', 'selected'));

alter table public.newsletter_campaign_deliveries
  drop constraint if exists newsletter_campaign_deliveries_status_check;

alter table public.newsletter_campaign_deliveries
  add constraint newsletter_campaign_deliveries_status_check
  check (status in ('pending', 'sent', 'failed', 'skipped'));

create or replace function public.admin_create_newsletter_campaign(
  p_subject text,
  p_content text,
  p_recipient_mode text default 'all_active',
  p_selected_emails text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_mode text := lower(btrim(coalesce(p_recipient_mode, '')));
  v_selected_emails text[];
  v_eligible_count integer;
  v_recipient_count integer;
begin
  if not exists (
    select 1
    from public.admin_users a
    where a.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;

  if v_mode not in ('all_active', 'selected') then
    raise exception 'A valid recipient mode is required.' using errcode = '22023';
  end if;

  select coalesce(array_agg(email order by email), array[]::text[])
  into v_selected_emails
  from (
    select distinct lower(btrim(raw_email)) as email
    from unnest(coalesce(p_selected_emails, array[]::text[])) as raw_email
    where btrim(raw_email) <> ''
  ) selected;

  if v_mode = 'selected' then
    if cardinality(v_selected_emails) = 0 then
      raise exception 'Select at least one active subscriber.' using errcode = '22023';
    end if;

    select count(*)::integer
    into v_eligible_count
    from public.newsletter_subscribers s
    where s.is_active
      and s.email = any(v_selected_emails);

    if v_eligible_count <> cardinality(v_selected_emails) then
      raise exception 'Selected recipients must be active newsletter subscribers.' using errcode = '22023';
    end if;
  end if;

  insert into public.newsletter_campaigns (subject, content, created_by, recipient_mode)
  values (btrim(p_subject), p_content, auth.uid(), v_mode)
  returning id into v_campaign_id;

  insert into public.newsletter_campaign_deliveries (campaign_id, subscriber_email, status)
  select v_campaign_id, s.email, 'pending'
  from public.newsletter_subscribers s
  where s.is_active
    and (v_mode = 'all_active' or s.email = any(v_selected_emails));

  get diagnostics v_recipient_count = row_count;

  update public.newsletter_campaigns
  set recipient_count = v_recipient_count
  where id = v_campaign_id;

  return v_campaign_id;
end;
$$;

-- Preserve the existing two-argument RPC for clients not yet upgraded. It now
-- creates the same secure all-active recipient snapshot as the new interface.
create or replace function public.admin_create_newsletter_campaign(
  p_subject text,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.admin_create_newsletter_campaign(
    p_subject,
    p_content,
    'all_active',
    null
  );
end;
$$;

create or replace function public.get_admin_newsletter_campaigns(
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
  v_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
begin
  if not exists (
    select 1
    from public.admin_users a
    where a.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;

  return (
    with rows as (
      select subject, status, recipient_mode, created_at, sent_at,
        recipient_count, successful_count, failed_count
      from public.newsletter_campaigns
      order by created_at desc
      limit v_size offset (v_page - 1) * v_size
    )
    select jsonb_build_object(
      'total', (select count(*)::integer from public.newsletter_campaigns),
      'campaigns', coalesce(
        (select jsonb_agg(to_jsonb(rows) order by created_at desc) from rows),
        '[]'::jsonb
      )
    )
  );
end;
$$;

revoke all on function public.admin_create_newsletter_campaign(text, text) from public, anon;
revoke all on function public.admin_create_newsletter_campaign(text, text, text, text[]) from public, anon;
revoke all on function public.get_admin_newsletter_campaigns(integer, integer) from public, anon;

grant execute on function public.admin_create_newsletter_campaign(text, text) to authenticated;
grant execute on function public.admin_create_newsletter_campaign(text, text, text, text[]) to authenticated;
grant execute on function public.get_admin_newsletter_campaigns(integer, integer) to authenticated;
