-- Paid vs free events.
--
-- Run after supabase/events-seed.sql. Safe to re-run.
--
-- Nothing in the upstream V-TAPP feed says whether an event charges;
-- the only evidence is `registrations.total`. So the split is derived
-- from the registrations that have actually come in, and an admin can
-- override it for events that have not sold anything yet -- which is
-- most of the 90 seeded events until the fest opens.
--
-- Derived, not stored: if it were backfilled into a column it would go
-- stale the moment the first paid registration arrived.

begin;

-- 1. Admin override --------------------------------------------------------

-- NULL means "nobody has said", and the live registration data decides.
alter table public.events
  add column if not exists pricing text;

do $$
begin
  alter table public.events
    add constraint events_pricing_check
    check (pricing in ('paid', 'free'));
exception
  when duplicate_object then null;
end $$;

comment on column public.events.pricing is
  'Admin override: paid | free. NULL lets registration totals decide.';

commit;

-- 2. Aggregates, now carrying the split ------------------------------------

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
    r.created_at
  from public.registrations r
),
per_event as (
  select
    event_id,
    count(*)              as registrations,
    count(distinct email) as participants,
    sum(amount)           as revenue,
    max(created_at)       as last_registration,
    /*
     * A single event can carry both: an early-bird free tier and a
     * paid one. Counting each side beats a boolean, because the UI
     * can then say "mostly paid" honestly instead of guessing.
     */
    count(*) filter (where amount > 0)  as paid_registrations,
    count(*) filter (where amount <= 0) as free_registrations,
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

-- Verify:
--   select public.event_summaries();
