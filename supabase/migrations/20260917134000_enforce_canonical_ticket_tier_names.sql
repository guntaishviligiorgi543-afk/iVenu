-- Canonical tier identifiers are tied to the exact public ticket-type names.
-- This is presentation and publication validation only; it does not touch event_seats.
alter table public.ticket_types
  add constraint ticket_types_canonical_tier_name_check
  check (
    canonical_tier is null
    or (canonical_tier = 'cheap' and name = 'Cheap / Standard')
    or (canonical_tier = 'medium' and name = 'Medium / Premium')
    or (canonical_tier = 'expensive' and name = 'Expensive')
    or (canonical_tier = 'vip' and name = 'VIP')
  );
