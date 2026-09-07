-- "Dance in the Dark" is "Glow in the Dark".
--
-- Safe to re-run. Run after supabase/missing-events.sql.
--
-- The portal sells the event under a second name. I read the two as
-- separate events and added a row for the second one, which split one
-- event's registrations across two rows: 7 against Glow and 17
-- against Dance, each with its own revenue, and a capacity of 150
-- that only one of them was measured against.
--
-- An alias, not a rename. The organisers' name for it is "Glow in the
-- Dark" -- that is what the sheet says, what the coordinators are
-- assigned to and what the venue and capacity belong to. The portal's
-- wording only has to resolve to it.

begin;

insert into public.event_aliases (ticket_norm, ticket_raw, event_id)
values (
  public.norm_event_name('Dance in the Dark'),
  'Dance in the Dark',
  'glow-in-the-dark'
)
on conflict (ticket_norm) do update
  set event_id   = excluded.event_id,
      ticket_raw = excluded.ticket_raw;

-- resolve_event() reads aliases before event names, so the alias
-- decides from here on even while the row below still exists.
delete from public.events
 where event_id = 'dance-in-the-dark';

commit;

-- Re-point the 17 --------------------------------------------------------

select public.rebuild_resolved_events();

-- Verify -------------------------------------------------------------------

-- One row, 24 registrations, 3,600 rupees, 126 of 150 seats left.
-- (Higher if more came in since; the point is that it is one row.)
select
  e.event_id,
  e.name,
  e.day,
  e.venue,
  e.capacity,
  count(r.id) as registrations,
  coalesce(sum(r.total), 0) as revenue
from public.events e
left join public.registrations r
  on r.resolved_event_id = e.event_id
where e.event_id = 'glow-in-the-dark'
group by e.event_id, e.name, e.day, e.venue, e.capacity;

-- Expect zero rows: nothing still points at the deleted event, and
-- nothing is unresolved.
select resolved_event_id, count(*)
from public.registrations
where resolved_event_id is null
   or resolved_event_id = 'dance-in-the-dark'
group by resolved_event_id;
