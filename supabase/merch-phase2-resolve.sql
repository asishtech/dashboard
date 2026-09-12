-- Let 518 (Merch Phase 2) resolve to 'merchandise', the same slug 513
-- already resolves to.
--
-- Safe to re-run. Run after supabase/hostel-resolve.sql.
--
-- Phase 2 sells from the exact same catalog and combo numbers as 513
-- (confirmed against a portal export), so it is not a second product
-- line -- it is a second sales window for the same one. But its
-- resolved_event_id has been sitting at null since it appeared,
-- because resolve_event() only special-cased 513, and Phase 2's
-- ticket text ("L-SIZE") matches no event's name.
--
-- Null resolved_event_id is why a merchandise-scoped volunteer's scan
-- of a Phase 2 QR was rejected with "This pass is for an event you are
-- not assigned to": checkin_lookup() reports event_id (resolved_event_id)
-- and is_merch off that same column, so a Phase 2 pass looked like an
-- unmatched *event* ticket rather than a merchandise one, and
-- mayAdmit() in app/api/checkin/route.ts only lets a fully-unrestricted
-- volunteer through an unmatched ticket -- which a merch-only volunteer
-- deliberately is not.
--
-- Also inflated "registrations that belong to no event" on the Events
-- screen by the Phase 2 headcount, same symptom as the 516 case before
-- supabase/hostel-resolve.sql.

create or replace function public.resolve_event(
  p_event_id text,
  p_product_meta text
)
returns text
language sql
stable
parallel safe
as $fn$
  select case
    when p_event_id = '513' then 'merchandise'
    when p_event_id = '518' then 'merchandise'
    when p_event_id = '516' then '516'
    else coalesce(
      /* 1. A spelling somebody has already mapped by hand. */
      (select a.event_id from public.event_aliases a
        where a.ticket_norm = public.norm_event_name(t.ticket)),

      /* 2. The event's own name. */
      (select e.event_id from public.events e
        where public.norm_event_name(e.name)
            = public.norm_event_name(t.ticket)),

      /* 3. One event, and only one, whose name contains the ticket
            or is contained by it. count() = 1 is the whole safety
            argument: ambiguity resolves to null, which leaves the
            registration unmatched and visible on the events page
            rather than silently filed under a guess. */
      (select case when count(*) = 1 then min(e.event_id) end
         from public.events e
        where length(public.norm_event_name(t.ticket)) >= 6
          and length(public.norm_event_name(e.name)) >= 6
          and (
            public.norm_event_name(e.name)
              like '%' || public.norm_event_name(t.ticket) || '%'
            or public.norm_event_name(t.ticket)
              like '%' || public.norm_event_name(e.name) || '%'
          ))
    )
  end
  from (
    select btrim(split_part(
      coalesce(
        (regexp_match(coalesce(p_product_meta, ''), 'Ticket:\s*(.*)$', 'i'))[1],
        ''
      ),
      ' - Date:', 1
    )) as ticket
  ) t;
$fn$;

-- is_merch, from the resolved slug rather than a literal '513' --
-- one source of truth instead of two, so a future second (or third)
-- merchandise source id needs a change here only, not here and there.
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
  'is_merch',        (r.resolved_event_id = 'merchandise'),
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

-- Backfill the 110 Phase 2 rows already sitting at null. Scoped to
-- event_id 518 rather than rebuild_resolved_events(), which would
-- recompute every registration for a change that only affects this
-- one bucket.
update public.registrations
   set resolved_event_id = 'merchandise'
 where event_id::text = '518'
   and resolved_event_id is distinct from 'merchandise';

-- Verify:
--   select count(*) from public.registrations
--    where event_id::text = '518' and resolved_event_id is null;
--   -- should be 0
--   select public.checkin_lookup('<a real Phase 2 qr_token>');
--   -- is_merch should now be true, event_id 'merchandise'
