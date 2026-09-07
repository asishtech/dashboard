-- Two events that exist on the portal but not here.
--
-- Safe to re-run.
--
-- Symptom: /admin said 2418 registrations and /events said 2397.
-- Neither was wrong. /admin counts registrations; /events sums
-- event_summaries(), which aggregates over `events` -- so a
-- registration whose ticket matches no event is in none of its rows
-- and simply vanishes from the total.
--
-- The 21 in the gap held two tickets that no row in `events` was
-- named after:
--
--   15  Dance in the Dark            (₹2,250 taken, from 4 Sep)
--    6  Space Warfare & Engineering  (free, all on 7 Sep)
--
-- Only the second is a new event. "Dance in the Dark" is what the
-- portal calls "Glow in the Dark" -- I read the two as separate and
-- added a row for it, which split one event across two. That row is
-- removed and aliased in supabase/merge-dance-into-glow.sql; it is
-- deliberately not inserted here, so re-running this file cannot
-- split them again.
--
-- resolve_event() matches a ticket against event names as well as
-- aliases, so `name` has to stay exactly as the portal spells it. If
-- the organisers want a different name on screen, add an alias for
-- the portal's wording instead of editing the name (see the block at
-- the bottom).

begin;

insert into public.events (event_id, name, source_event_id)
values
  ('space-warfare-engineering', 'Space Warfare & Engineering', '514')
on conflict (event_id) do nothing;

commit;

-- Re-resolve ---------------------------------------------------------------

-- resolved_event_id is written by a trigger when a registration
-- arrives or changes, and these rows arrived before the event
-- existed. Nothing about them has changed since, so the trigger will
-- not fire on its own.
select public.rebuild_resolved_events();

-- Verify -------------------------------------------------------------------

-- Expect zero rows. Anything still here is another ticket with no
-- event, and the events page names them in a banner.
select
  r.ticket,
  count(*) as registrations
from public.registrations r
where r.resolved_event_id is null
group by r.ticket
order by count(*) desc;

-- It should now carry its people; day, venue, capacity and fee are
-- still blank -- fill them from the organisers' sheet.
select event_id, name, day, venue, capacity, registration_fee
from public.events
where event_id = 'space-warfare-engineering';

-- If the portal's wording is not what should appear on screen --------------
--
-- Rename the event and alias the portal's spelling to it, rather than
-- editing the name alone: resolve_event() matches on the name, so a
-- rename without an alias sends every one of its registrations back
-- to being unmatched.
--
--   update public.events
--      set name = 'Space Warfare', name_locked = true
--    where event_id = 'space-warfare-engineering';
--
--   insert into public.event_aliases (ticket_norm, ticket_raw, event_id)
--   values (
--     public.norm_event_name('Space Warfare & Engineering'),
--     'Space Warfare & Engineering',
--     'space-warfare-engineering'
--   )
--   on conflict (ticket_norm) do update
--     set event_id = excluded.event_id;
--
--   select public.rebuild_resolved_events();
