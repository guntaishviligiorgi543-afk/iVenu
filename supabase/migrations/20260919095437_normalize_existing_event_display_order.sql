-- Normalize the initial backfill to the public listing policy. This runs only
-- before any admin-directed placement is made and preserves the prior Shows
-- chronology with deterministic tie-breakers.
with ordered_events as (
  select
    event.id,
    row_number() over (
      order by event.event_date asc, event.event_time asc, event.created_at asc, event.id asc
    )::integer as position
  from public.events event
)
update public.events event
set display_order = ordered_events.position
from ordered_events
where event.id = ordered_events.id;
