-- Phone and origin on the per-event attendee list.
--
-- Safe to re-run. Run after supabase/resolve-once.sql (which is where
-- the current event_attendees() lives -- an earlier version filtered
-- on event_id::text and predates the resolved_event_id column; this
-- builds on the live one, not that one) and supabase/desk-tools.sql /
-- supabase/external-registrations.sql, where registration_phone() and
-- registration_origin() already live.
--
-- event_attendees() was deliberately narrow: name, email and
-- registration id, because club coordinators see this list and have
-- no need for a mobile number. That reasoning still holds for the
-- on-screen table -- lib/auth.ts strips phone and origin from the API
-- response for anyone who is not admin or the registrations desk --
-- but the download an admin actually wants includes both, and there
-- is no reason to recompute them in application code when Postgres
-- already has the answer.

begin;

create or replace function public.event_attendees(p_event_id text)
returns json
language sql
stable
parallel safe
as $$
select coalesce(
  json_agg(
    json_build_object(
      'registration_id', r.registration_id,
      'name',            r.name,
      'email',           r.email,
      'phone',           public.registration_phone(r.raw_data::jsonb),
      'origin',          public.registration_origin(
                            r.email,
                            public.registration_university(r.raw_data::jsonb)
                          ),
      'scanned',         q.registration_id is not null
    )
    order by r.name
  ),
  '[]'::json
)
from public.registrations r
left join public.qr_scans q on q.registration_id = r.id
where r.resolved_event_id = p_event_id;
$$;

revoke all on function public.event_attendees(text)      from public;
grant execute on function public.event_attendees(text)   to service_role;

-- Verify:
--   select public.event_attendees('513');
