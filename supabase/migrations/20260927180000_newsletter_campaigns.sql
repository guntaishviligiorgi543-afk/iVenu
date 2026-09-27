create table public.newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (char_length(btrim(subject)) between 1 and 200),
  content text not null check (char_length(btrim(content)) between 1 and 50000),
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'partially_failed', 'failed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  successful_count integer not null default 0 check (successful_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0)
);

create table public.newsletter_campaign_deliveries (
  campaign_id uuid not null references public.newsletter_campaigns(id) on delete cascade,
  subscriber_email text not null,
  status text not null check (status in ('pending', 'sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (campaign_id, subscriber_email)
);

create table public.newsletter_unsubscribe_tokens (
  token_hash text primary key,
  subscriber_email text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index newsletter_campaigns_created_at_idx on public.newsletter_campaigns (created_at desc);
create index newsletter_deliveries_campaign_status_idx on public.newsletter_campaign_deliveries (campaign_id, status);

alter table public.newsletter_campaigns enable row level security;
alter table public.newsletter_campaign_deliveries enable row level security;
alter table public.newsletter_unsubscribe_tokens enable row level security;
revoke all on public.newsletter_campaigns, public.newsletter_campaign_deliveries, public.newsletter_unsubscribe_tokens from public, anon, authenticated;

create or replace function public.admin_create_newsletter_campaign(p_subject text, p_content text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())) then raise exception 'Administrator access is required.'; end if;
  insert into public.newsletter_campaigns (subject, content, created_by)
  values (btrim(p_subject), p_content, auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.get_admin_newsletter_campaigns(p_page integer default 1, p_page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_page integer := greatest(coalesce(p_page, 1), 1); v_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
begin
  if not exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())) then raise exception 'Administrator access is required.'; end if;
  return (with rows as (select subject,status,created_at,sent_at,recipient_count,successful_count,failed_count from public.newsletter_campaigns order by created_at desc limit v_size offset (v_page - 1) * v_size)
    select jsonb_build_object('total',(select count(*)::integer from public.newsletter_campaigns),'campaigns',coalesce((select jsonb_agg(to_jsonb(rows) order by created_at desc) from rows),'[]'::jsonb)));
end;
$$;

revoke all on function public.admin_create_newsletter_campaign(text, text) from public, anon;
revoke all on function public.get_admin_newsletter_campaigns(integer, integer) from public, anon;
grant execute on function public.admin_create_newsletter_campaign(text, text) to authenticated;
grant execute on function public.get_admin_newsletter_campaigns(integer, integer) to authenticated;
