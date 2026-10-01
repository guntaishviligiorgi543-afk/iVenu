insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ivenue-images',
  'ivenue-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can view iVenue images"
on storage.objects for select
to public
using (bucket_id = 'ivenue-images');

create policy "Users upload own avatar images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'ivenue-images'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
);

create policy "Users update own avatar images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'ivenue-images'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
)
with check (
  bucket_id = 'ivenue-images'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
);

create policy "Users delete own avatar images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'ivenue-images'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
);

create policy "Admins manage event and catalog images"
on storage.objects for all
to authenticated
using (
  bucket_id = 'ivenue-images'
  and (storage.foldername(name))[1] in ('events', 'catalog')
  and exists (select 1 from public.admin_users where user_id = (select auth.uid()))
)
with check (
  bucket_id = 'ivenue-images'
  and (storage.foldername(name))[1] in ('events', 'catalog')
  and exists (select 1 from public.admin_users where user_id = (select auth.uid()))
);
