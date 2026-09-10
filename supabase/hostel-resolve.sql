-- Let 516 (food & accommodation) resolve to itself, the same way
-- resolve_event() already special-cases 513 to 'merchandise'.
--
-- Safe to re-run. Run after supabase/resolve-once.sql.
--
-- A hostel booking's ticket text is "AC Room with Food per day" or
-- similar -- nothing an event's name would ever match by the exact
-- or containment rules below, so every hostel registration's
-- resolved_event_id has been sitting at null since the column
-- existed. Two things read that column and have therefore never
-- actually worked for a hostel scan:
--
--   * app/volunteer/page.tsx compares pass.event_id (checkin_lookup's
--     event_id, i.e. resolved_event_id) to "516" to decide whether to
--     show the Block/Room fields. Null never equals "516".
--
--   * canReadEvent() in lib/auth.ts, which is how a volunteer scoped
--     to particular events (event_volunteers) is let through the
--     door -- or not. A null event_id short-circuits to "only a
--     fully-unrestricted volunteer may admit this", so a volunteer
--     scoped to anything, including Hostel itself, could never check
--     a guest in.
--
-- They also inflated "registrations that belong to no event" on the
-- Events screen by exactly the hostel headcount, which is the
-- symptom that led here.

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

-- Backfill the rows already sitting at null. Scoped to event_id 516
-- rather than rebuild_resolved_events(), which would recompute every
-- registration for a change that only affects this one bucket.
update public.registrations
   set resolved_event_id = '516'
 where event_id::text = '516'
   and resolved_event_id is distinct from '516';

-- Verify:
--   select count(*) from public.registrations
--    where event_id::text = '516' and resolved_event_id is null;
--   -- should be 0
