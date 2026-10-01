create unique index if not exists email_change_verifications_one_active_per_user
  on public.email_change_verifications(user_id)
  where consumed_at is null;;
