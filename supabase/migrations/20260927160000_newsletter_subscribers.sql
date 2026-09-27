create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  subscribed_at timestamptz not null default now(),
  is_active boolean not null default true,
  constraint newsletter_subscribers_email_normalized_check
    check (email = lower(btrim(email)))
);

create unique index newsletter_subscribers_email_lower_key
  on public.newsletter_subscribers (lower(email));

alter table public.newsletter_subscribers enable row level security;

revoke all on table public.newsletter_subscribers from public, anon, authenticated;

create function public.subscribe_to_newsletter(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_subscribed boolean;
begin
  if v_email is null
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid email address is required.' using errcode = '22023';
  end if;

  insert into public.newsletter_subscribers (email)
  values (v_email)
  on conflict ((lower(email))) do update
    set is_active = true,
        subscribed_at = now()
    where not public.newsletter_subscribers.is_active
  returning true into v_subscribed;

  if coalesce(v_subscribed, false) then
    return 'subscribed';
  end if;

  return 'already_subscribed';
end;
$$;

revoke all on function public.subscribe_to_newsletter(text) from public, anon, authenticated;
grant execute on function public.subscribe_to_newsletter(text) to anon, authenticated;
