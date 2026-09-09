-- Block and room, captured when a hostel guest is checked in.
--
-- Safe to re-run. Run after supabase/event-exit.sql.
--
-- Entry and exit for event 516 (food and accommodation) already work
-- through the same qr_scans table every other event uses -- there is
-- nothing hostel-specific about being admitted. What is missing is
-- where they are put once they are in: a volunteer at the hostel desk
-- needs to write down the block and room a guest was assigned, and
-- nowhere on the registration carries that.
--
-- Columns rather than a separate table, matching exited_at/exited_by
-- in supabase/event-exit.sql: this is one more fact about the same
-- visit, not a second kind of record.

begin;

alter table public.qr_scans
  add column if not exists block text,
  add column if not exists room text;

commit;

-- checkin_lookup also returns exited_at, block and room now, so the
-- scanner can show whether someone has already left and what was
-- recorded for them -- not just whether they were ever admitted.
--
-- Based on the version in supabase/resolve-once.sql, which reads the
-- stored resolved_event_id column instead of recomputing
-- resolve_event()'s regex match per row -- that migration cut this
-- exact query from seconds to milliseconds at fest scale, and an
-- earlier draft of this file had quietly reintroduced the slow path.
create or replace function public.checkin_lookup(p_token text)
returns json
language sql
stable
as $fn$
select json_build_object(
  'id',              r.id,
  'registration_id', r.registration_id,
  'name',            r.name,
  'email',           r.email,
  'event_id',        r.resolved_event_id,
  'event_name',      coalesce(e.name, nullif(btrim(r.ticket), ''), 'V-TAPP event'),
  'event_day',       e.day,
  'event_venue',     e.venue,
  'is_merch',        (r.event_id::text = '513'),
  'entered_at',      q.created_at,
  'exited_at',       q.exited_at,
  'block',           q.block,
  'room',            q.room
)
from public.registrations r
left join public.events e on e.event_id = r.resolved_event_id
left join public.qr_scans q on q.registration_id = r.id
where r.qr_token = p_token
limit 1;
$fn$;

revoke all on function public.checkin_lookup(text) from public;
grant execute on function public.checkin_lookup(text) to service_role;

-- Verify:
--   select public.checkin_lookup('<a real qr_token>');
