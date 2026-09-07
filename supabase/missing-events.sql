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
-- The 21 in the gap hold two tickets that no row in `events` is
-- named after:
--
--   15  Dance in the Dark            (₹2,250 taken, from 4 Sep)
--    6  Space Warfare & Engineering  (free, all on 7 Sep)
--
-- Both went on sale after the organisers' sheet was loaded. They are
-- not renames of anything here -- "Glow in the Dark" and "Satellite
-- Mission Masters" are separate events with their own registrations --
-- so they are added rather than aliased.
--
-- resolve_event() matches a ticket against event names as well as
-- aliases, so `name` has to stay exactly as the portal spells it. If
-- the organisers want a different name on screen, add an alias for
-- the portal's wording instead of editing the name (see the block at
-- the bottom).

begin;

insert into public.events (event_id, name, source_event_id)
values
  ('dance-in-the-dark', 'Dance in the Dark', '514'),
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

-- The two should now carry their people, and the day, venue, capacity
-- and fee are still blank -- fill them from the organisers' sheet.
select event_id, name, day, venue, capacity, registration_fee
from public.events
where event_id in ('dance-in-the-dark', 'space-warfare-engineering');

-- If the portal's wording is not what should appear on screen --------------
--
--   update public.events
--      set name = 'Dance in the Dark (Cultural Club)', name_locked = true
--    where event_id = 'dance-in-the-dark';
--
--   insert into public.event_aliases (ticket_norm, ticket_raw, event_id)
--   values (
--     public.norm_event_name('Dance in the Dark'),
--     'Dance in the Dark',
--     'dance-in-the-dark'
--   )
--   on conflict do nothing;
--
--   select public.rebuild_resolved_events();
