alter table public.newsletter_campaigns
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_test_signature text,
  add column if not exists last_test_sent_at timestamptz,
  add column if not exists last_test_provider_message_id text;

create or replace function public.set_newsletter_campaign_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists newsletter_campaigns_updated_at on public.newsletter_campaigns;
create trigger newsletter_campaigns_updated_at
before update on public.newsletter_campaigns
for each row execute function public.set_newsletter_campaign_updated_at();

create or replace function public.admin_upsert_newsletter_campaign(
  p_campaign_id uuid default null,
  p_subject text default null,
  p_content text default null,
  p_recipient_mode text default 'all_active',
  p_selected_emails text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid := p_campaign_id;
  v_mode text := lower(btrim(coalesce(p_recipient_mode, '')));
  v_selected_emails text[];
begin
  if not exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;
  if btrim(coalesce(p_subject, '')) = '' or btrim(coalesce(p_content, '')) = '' then
    raise exception 'Subject and newsletter content are required.' using errcode = '22023';
  end if;
  if v_mode not in ('all_active', 'selected') then
    raise exception 'A valid recipient mode is required.' using errcode = '22023';
  end if;

  select coalesce(array_agg(email order by email), array[]::text[])
  into v_selected_emails
  from (
    select distinct lower(btrim(raw_email)) email
    from unnest(coalesce(p_selected_emails, array[]::text[])) raw_email
    where btrim(raw_email) <> ''
  ) normalized;

  if v_mode = 'selected' and (
    cardinality(v_selected_emails) = 0
    or (select count(*) from public.newsletter_subscribers s
        where s.is_active and s.email = any(v_selected_emails))
       <> cardinality(v_selected_emails)
  ) then
    raise exception 'Selected recipients must be active newsletter subscribers.' using errcode = '22023';
  end if;

  if v_campaign_id is null then
    insert into public.newsletter_campaigns (subject, content, created_by, recipient_mode)
    values (btrim(p_subject), p_content, (select auth.uid()), v_mode)
    returning id into v_campaign_id;
  else
    if not exists (
      select 1 from public.newsletter_campaigns
      where id = v_campaign_id and status = 'draft'
    ) then
      raise exception 'Only an existing draft can be updated.' using errcode = '55000';
    end if;
    update public.newsletter_campaigns
    set subject = btrim(p_subject), content = p_content, recipient_mode = v_mode,
        last_test_signature = null, last_test_sent_at = null,
        last_test_provider_message_id = null
    where id = v_campaign_id;
    delete from public.newsletter_campaign_deliveries where campaign_id = v_campaign_id;
  end if;

  insert into public.newsletter_campaign_deliveries (campaign_id, subscriber_email, status)
  select v_campaign_id, s.email, 'pending'
  from public.newsletter_subscribers s
  where s.is_active
    and (v_mode = 'all_active' or s.email = any(v_selected_emails));

  update public.newsletter_campaigns
  set recipient_count = (
    select count(*)::integer from public.newsletter_campaign_deliveries
    where campaign_id = v_campaign_id
  )
  where id = v_campaign_id;
  return v_campaign_id;
end;
$$;

create or replace function public.get_admin_newsletter_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare v_campaign jsonb;
begin
  if not exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;
  select to_jsonb(c) || jsonb_build_object(
    'selected_emails', coalesce((
      select jsonb_agg(d.subscriber_email order by d.subscriber_email)
      from public.newsletter_campaign_deliveries d
      where d.campaign_id = c.id
    ), '[]'::jsonb)
  ) into v_campaign
  from public.newsletter_campaigns c
  where c.id = p_campaign_id;
  if v_campaign is null then raise exception 'Campaign not found.'; end if;
  return v_campaign;
end;
$$;

create or replace function public.get_admin_newsletter_campaigns(
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare v_page integer := greatest(coalesce(p_page, 1), 1);
declare v_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
begin
  if not exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  ) then
    raise exception 'Administrator access is required.';
  end if;
  return (
    with rows as (
      select id, subject, status, recipient_mode, created_at, updated_at, sent_at,
        recipient_count, successful_count, failed_count
      from public.newsletter_campaigns
      order by updated_at desc
      limit v_size offset (v_page - 1) * v_size
    )
    select jsonb_build_object(
      'total', (select count(*)::integer from public.newsletter_campaigns),
      'campaigns', coalesce(
        (select jsonb_agg(to_jsonb(rows) order by updated_at desc) from rows),
        '[]'::jsonb
      )
    )
  );
end;
$$;

revoke all on function public.admin_upsert_newsletter_campaign(uuid, text, text, text, text[]) from public, anon;
revoke all on function public.get_admin_newsletter_campaign(uuid) from public, anon;
grant execute on function public.admin_upsert_newsletter_campaign(uuid, text, text, text, text[]) to authenticated;
grant execute on function public.get_admin_newsletter_campaign(uuid) to authenticated;
