create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into public.categories (name)
values
  ('Concert'),
  ('Festival'),
  ('Sports'),
  ('Theatre'),
  ('Comedy'),
  ('Other')
on conflict (name) do nothing;

alter table public.events
  add column if not exists category_id uuid references public.categories(id) on delete set null;

update public.events
set category_id = (select id from public.categories where name = 'Concert')
where category_id is null;

alter table public.categories enable row level security;

drop policy if exists "Public can view categories" on public.categories;
create policy "Public can view categories"
  on public.categories for select
  using (true);

create index if not exists events_category_id_idx on public.events(category_id);;
