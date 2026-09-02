-- Who the coordinators actually are.
--
-- Safe to re-run.
--
-- event_coordinators has only ever held an email and an event id. The
-- organisers' spreadsheet carries a name for each, and distinguishes
-- the faculty coordinator from the student one -- both were dropped on
-- the way in, so the admin screen could show an address and nothing
-- else. An address is not enough to find someone at a venue.
--
-- Phone numbers are not in the spreadsheet and are not invented here.
-- The column exists so they can be filled in from the admin screen as
-- they are collected.

begin;

alter table public.event_coordinators
  add column if not exists name  text,
  add column if not exists phone text,
  add column if not exists kind  text;

do $$
begin
  alter table public.event_coordinators
    add constraint event_coordinators_kind_check
    check (kind in ('faculty', 'student'));
exception
  when duplicate_object then null;
end $$;

comment on column public.event_coordinators.kind is
  'faculty | student. NULL where the spreadsheet did not say.';
comment on column public.event_coordinators.phone is
  'Collected by hand; never present in the upstream spreadsheet.';

commit;

-- One row per person, with everything they coordinate ---------------------

-- Grouped by address rather than by assignment: an admin looking for a
-- coordinator wants the person and their events, not one row per event
-- with the same name repeated down the page.
create or replace function public.coordinator_directory()
returns json
language sql
stable
as $fn$
select coalesce(
  json_agg(
    json_build_object(
      'email',  email,
      'name',   name,
      'phone',  phone,
      'kind',   kind,
      'events', events,
      'eventCount', event_count
    )
    /* Faculty first, then by name; unnamed rows last so the list does
       not open with a column of blanks. */
    order by
      case kind when 'faculty' then 0 when 'student' then 1 else 2 end,
      nullif(btrim(coalesce(name, '')), '') nulls last,
      email
  ),
  '[]'::json
)
from (
  select
    c.email,
    /* One person can appear on several rows; take the first non-empty
       name and phone rather than an arbitrary one. */
    (array_remove(array_agg(nullif(btrim(c.name), '')), null))[1]  as name,
    (array_remove(array_agg(nullif(btrim(c.phone), '')), null))[1] as phone,
    (array_remove(array_agg(c.kind), null))[1]                     as kind,
    count(*)                                                       as event_count,
    json_agg(
      json_build_object(
        'id',       c.id,
        'event_id', c.event_id,
        'name',     coalesce(e.name, c.event_id),
        'day',      e.day,
        'venue',    e.venue
      )
      order by e.day nulls last, e.name
    ) as events
  from public.event_coordinators c
  left join public.events e on e.event_id = c.event_id
  group by c.email
) x;
$fn$;

-- Events with nobody assigned, and events missing one of the two roles.
-- The gap is the actionable part of this screen.
create or replace function public.coordinator_gaps()
returns json
language sql
stable
as $fn$
select coalesce(
  json_agg(
    json_build_object(
      'event_id',   event_id,
      'name',       name,
      'day',        day,
      'venue',      venue,
      'hasFaculty', has_faculty,
      'hasStudent', has_student
    )
    order by name
  ),
  '[]'::json
)
from (
  select
    e.event_id,
    e.name,
    e.day,
    e.venue,
    bool_or(c.kind = 'faculty') as has_faculty,
    bool_or(c.kind = 'student') as has_student
  from public.events e
  left join public.event_coordinators c on c.event_id = e.event_id
  /* Merchandise is a resolver row, not an event anyone coordinates. */
  where coalesce(e.source_event_id, '') <> '513'
    and e.event_id <> 'merchandise'
  group by e.event_id, e.name, e.day, e.venue
  having coalesce(bool_or(c.kind = 'faculty'), false) is not true
      or coalesce(bool_or(c.kind = 'student'), false) is not true
) x;
$fn$;

revoke all on function public.coordinator_directory() from public;
revoke all on function public.coordinator_gaps()      from public;
grant execute on function public.coordinator_directory() to service_role;
grant execute on function public.coordinator_gaps()      to service_role;

-- Verify:
--   select public.coordinator_directory();
--   select public.coordinator_gaps();
