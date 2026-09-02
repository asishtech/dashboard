-- External vs internal participants.
--
-- Run after supabase/event-pricing.sql. Safe to re-run.
--
-- "How many people came from outside VIT-AP?" is a number worth
-- sharing, so it has to be defensible. Two signals decide it:
--
--   1. The email domain. @vitapstudent.ac.in and @vitap.ac.in are
--      issued by the university, so they settle the question on their
--      own -- nobody outside holds one.
--   2. The university named on the registration form, which the feed
--      carries inside raw_data.field_values.
--
-- A registration with neither -- a gmail address and a blank
-- university -- is counted as UNKNOWN, not external. Claiming someone
-- is an outside participant because a form field was left empty would
-- inflate exactly the figure being shared.

begin;

-- 1. Pull the university out of the form fields ----------------------------

-- The feed has no university column; custom form answers arrive as
-- raw_data.field_values = [{field_name, field_value}, ...]. The exact
-- label varies by form, so match the same tolerant way lib/vtapp-sync.ts
-- already matches the size field rather than hard-coding one string.
create or replace function public.registration_university(p_raw jsonb)
returns text
language sql
immutable
parallel safe
as $fn$
  select nullif(btrim(f->>'field_value'), '')
  from jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(p_raw -> 'field_values', '[]'::jsonb))
           = 'array'
      then p_raw -> 'field_values'
      else '[]'::jsonb
    end
  ) f
  where lower(coalesce(f->>'field_name', ''))
        ~ '(university|college|institut|organi[sz]ation|campus|school)'
    and nullif(btrim(f->>'field_value'), '') is not null
  limit 1;
$fn$;

comment on function public.registration_university(jsonb) is
  'University named on the registration form, from raw_data.field_values.';

-- 2. Classify --------------------------------------------------------------

create or replace function public.registration_origin(
  p_email text,
  p_university text
)
returns text
language sql
immutable
parallel safe
as $fn$
  select case
    /*
     * The email domain is checked first and wins outright: it is
     * issued by the university, so it cannot be typed wrong the way a
     * free-text field can.
     */
    when lower(btrim(coalesce(p_email, ''))) like '%@vitapstudent.ac.in'
      or lower(btrim(coalesce(p_email, ''))) like '%@vitap.ac.in'
      then 'internal'

    /* Nothing to go on. Deliberately not 'external'. */
    when coalesce(btrim(p_university), '') = ''
      then 'unknown'

    /*
     * Squash case and punctuation so 'VIT-AP University', 'VIT AP' and
     * 'vitap' are one answer. Note this does not catch someone who
     * writes 'Vellore Institute of Technology Andhra Pradesh' in full;
     * those land in 'external' and would need an alias list.
     */
    when regexp_replace(lower(p_university), '[^a-z0-9]+', '', 'g')
         like '%vitap%'
      then 'internal'

    else 'external'
  end;
$fn$;

commit;

-- 3. Per-event totals, now carrying the origin split -----------------------

create or replace function public.event_summaries()
returns json
language sql
stable
parallel safe
as $fn$
with resolved as (
  select
    public.resolve_event(r.event_id::text, r.product_meta) as event_id,
    r.email,
    coalesce(r.total, 0) as amount,
    r.id,
    r.created_at,
    public.registration_origin(
      r.email,
      public.registration_university(r.raw_data::jsonb)
    ) as origin
  from public.registrations r
),
per_event as (
  select
    event_id,
    count(*)              as registrations,
    count(distinct email) as participants,
    sum(amount)           as revenue,
    max(created_at)       as last_registration,

    count(*) filter (where amount > 0)  as paid_registrations,
    count(*) filter (where amount <= 0) as free_registrations,

    count(*) filter (where origin = 'external') as external_registrations,
    count(*) filter (where origin = 'internal') as internal_registrations,
    count(*) filter (where origin = 'unknown')  as unknown_registrations,
    count(distinct email) filter (where origin = 'external')
      as external_participants,

    count(*) filter (
      where exists (
        select 1 from public.qr_scans q
        where q.registration_id = resolved.id
      )
    ) as scanned
  from resolved
  where event_id is not null
  group by event_id
)
select coalesce(
  json_agg(
    json_build_object(
      'event_id',      e.event_id,
      'name',          e.name,
      'event_date',    e.day,
      'venue',         e.venue,
      'pricing',       e.pricing,
      'registrations', coalesce(p.registrations, 0),
      'participants',  coalesce(p.participants, 0),
      'revenue',       coalesce(p.revenue, 0),
      'paidRegistrations', coalesce(p.paid_registrations, 0),
      'freeRegistrations', coalesce(p.free_registrations, 0),
      'externalRegistrations', coalesce(p.external_registrations, 0),
      'internalRegistrations', coalesce(p.internal_registrations, 0),
      'unknownRegistrations',  coalesce(p.unknown_registrations, 0),
      'externalParticipants',  coalesce(p.external_participants, 0),
      'scanned',       coalesce(p.scanned, 0),
      'lastRegistration', p.last_registration
    )
    order by coalesce(p.registrations, 0) desc, e.name
  ),
  '[]'::json
)
from public.events e
left join per_event p on p.event_id = e.event_id;
$fn$;

grant execute on function public.event_summaries() to service_role;

-- 4. Diagnostic ------------------------------------------------------------

-- If the external count looks wrong, the first thing to check is
-- whether the form field is actually named something the pattern above
-- matches. This lists every custom field name in the feed with how
-- often it appears, so a mismatch is visible rather than silent.
create or replace function public.registration_field_names()
returns json
language sql
stable
parallel safe
as $fn$
select coalesce(
  json_agg(json_build_object('field_name', field_name, 'rows', n)
           order by n desc),
  '[]'::json
)
from (
  select f->>'field_name' as field_name, count(*) as n
  from public.registrations r,
       lateral jsonb_array_elements(
         case
           when jsonb_typeof(
                  coalesce(r.raw_data::jsonb -> 'field_values', '[]'::jsonb)
                ) = 'array'
           then r.raw_data::jsonb -> 'field_values'
           else '[]'::jsonb
         end
       ) f
  group by 1
) x;
$fn$;

revoke all on function public.registration_field_names() from public;
grant execute on function public.registration_field_names() to service_role;

-- Verify:
--   select public.registration_field_names();   -- what the form calls it
--   select public.event_summaries();
