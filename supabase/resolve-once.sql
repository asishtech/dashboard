-- Resolve each registration to its event once, not on every page view.
--
-- Safe to re-run. Run after supabase/event-details.sql.
--
-- resolve_event() extracts the ticket from product_meta with a regex,
-- normalises it, and compares it against every alias and every event
-- name -- each of those normalised by another regex. Cheap for one
-- row. event_summaries() and registration_event_map() do it for all
-- 1062 registrations against all 90 events on every single request:
-- roughly 95,000 regex operations, measured at 3.6 and 3.3 seconds.
--
-- Nothing about the answer changes between requests. It changes when a
-- registration arrives or an event is renamed, so compute it then.

begin;

alter table public.registrations
  add column if not exists resolved_event_id text;

comment on column public.registrations.resolved_event_id is
  'resolve_event() of this row, maintained by trigger. Do not set by hand.';

-- The column exists to be filtered and grouped on; without this it
-- would trade one sequential scan for another.
create index if not exists registrations_resolved_event_idx
  on public.registrations (resolved_event_id);

create index if not exists registrations_email_lower_idx
  on public.registrations (lower(btrim(email)));

commit;

-- Keep it current -----------------------------------------------------------

create or replace function public.set_resolved_event()
returns trigger
language plpgsql
as $$
begin
  /*
   * Only recompute when an input actually changed. A sync upserts every
   * registration it sees on every run, and re-resolving unchanged rows
   * would put the cost back where it was, just at write time.
   */
  if tg_op = 'INSERT'
     or new.event_id is distinct from old.event_id
     or new.product_meta is distinct from old.product_meta
  then
    new.resolved_event_id :=
      public.resolve_event(new.event_id::text, new.product_meta);
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_resolve_event on public.registrations;

create trigger registrations_resolve_event
  before insert or update on public.registrations
  for each row execute function public.set_resolved_event();

-- Backfill ------------------------------------------------------------------

update public.registrations
   set resolved_event_id =
         public.resolve_event(event_id::text, product_meta)
 where resolved_event_id is null;

-- Renaming an event changes what tickets resolve to, so offer a way to
-- rebuild without editing every row by hand.
create or replace function public.rebuild_resolved_events()
returns integer
language sql
as $fn$
  with updated as (
    update public.registrations
       set resolved_event_id =
             public.resolve_event(event_id::text, product_meta)
     returning 1
  )
  select count(*)::int from updated;
$fn$;

revoke all on function public.rebuild_resolved_events() from public;
grant execute on function public.rebuild_resolved_events() to service_role;

-- The same aggregates, reading the column -----------------------------------

create or replace function public.event_summaries()
returns json
language sql
stable
parallel safe
as $fn$
with per_event as (
  select
    r.resolved_event_id as event_id,
    count(*)                    as registrations,
    count(distinct r.email)     as participants,
    sum(coalesce(r.total, 0))   as revenue,
    max(r.created_at)           as last_registration,

    count(*) filter (where coalesce(r.total, 0) > 0)  as paid_registrations,
    count(*) filter (where coalesce(r.total, 0) <= 0) as free_registrations,

    count(*) filter (where o.origin = 'external') as external_registrations,
    count(*) filter (where o.origin = 'internal') as internal_registrations,
    count(*) filter (where o.origin = 'unknown')  as unknown_registrations,
    count(distinct r.email) filter (where o.origin = 'external')
      as external_participants,

    /*
     * A left join, not a correlated exists per row. Same answer, one
     * pass over an indexed column instead of 1062 index probes.
     */
    count(q.registration_id) as scanned
  from public.registrations r
  cross join lateral (
    select public.registration_origin(
             r.email,
             public.registration_university(r.raw_data::jsonb)
           ) as origin
  ) o
  left join public.qr_scans q on q.registration_id = r.id
  where r.resolved_event_id is not null
  group by r.resolved_event_id
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

create or replace function public.registration_event_map()
returns json
language sql
stable
as $fn$
select coalesce(
  json_object_agg(
    r.id::text,
    json_build_object(
      'slug',  r.resolved_event_id,
      'name',  coalesce(
                 e.name,
                 nullif(btrim(r.ticket), ''),
                 'Unmapped ticket'
               ),
      'day',   e.day,
      'venue', e.venue,
      'merch', (r.event_id::text = '513')
    )
  ),
  '{}'::json
)
from public.registrations r
left join public.events e on e.event_id = r.resolved_event_id;
$fn$;

create or replace function public.event_attendees(p_event_id text)
returns json
language sql
stable
parallel safe
as $fn$
select coalesce(
  json_agg(
    json_build_object(
      'registration_id', r.registration_id,
      'name',            r.name,
      'email',           r.email,
      'scanned',         q.registration_id is not null
    )
    order by r.name
  ),
  '[]'::json
)
from public.registrations r
left join public.qr_scans q on q.registration_id = r.id
where r.resolved_event_id = p_event_id;
$fn$;

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
  'entered_at',      (
    select min(q.created_at) from public.qr_scans q
    where q.registration_id = r.id
  )
)
from public.registrations r
left join public.events e on e.event_id = r.resolved_event_id
where r.qr_token = p_token
limit 1;
$fn$;

create or replace function public.unmapped_tickets()
returns json
language sql
stable
as $fn$
select coalesce(
  json_agg(json_build_object('ticket', ticket, 'registrations', n)
           order by n desc),
  '[]'::json
)
from (
  select
    btrim(split_part(
      coalesce((regexp_match(coalesce(product_meta,''),'Ticket:\s*(.*)$','i'))[1],''),
      ' - Date:', 1
    )) as ticket,
    count(*) as n
  from public.registrations
  where resolved_event_id is null
  group by 1
) x;
$fn$;

create or replace function public.buyer_dashboard(p_email text)
returns json
language sql
stable
as $fn$
with split as (
  select
    r.id, r.registration_id, r.name, r.qr_token,
    coalesce(r.total, 0) as total, r.ticket, r.created_at,
    r.resolved_event_id as slug,
    coalesce(
      r.event_id::text = '513' or r.resolved_event_id = 'merchandise',
      false
    ) as is_merch,
    exists (
      select 1 from public.qr_scans q where q.registration_id = r.id
    ) as scanned
  from public.registrations r
  where lower(btrim(r.email)) = lower(btrim(p_email))
),
items as (
  select
    ri.registration_id as reg_id,
    json_agg(
      json_build_object(
        'id', ri.id, 'item', ri.item, 'size', ri.size,
        'quantity', ri.quantity,
        'status', case when exists (
                    select 1 from public.distributions d
                    where d.registration_item_id = ri.id
                      and d.status = 'GIVEN'
                  ) then 'GIVEN' else 'PENDING' end
      ) order by ri.item
    ) as items
  from public.registration_items ri
  where ri.registration_id in (select id from split)
  group by 1
)
select json_build_object(
  'events', coalesce((
    select json_agg(json_build_object(
      'id', s.id, 'registration_id', s.registration_id,
      'event_id', s.slug,
      'name', coalesce(e.name, nullif(btrim(s.ticket), ''), 'Event booking'),
      'day', e.day, 'venue', e.venue, 'total', s.total,
      'scanned', s.scanned, 'qr_token', s.qr_token,
      'created_at', s.created_at
    ) order by e.day nulls last, coalesce(e.name, s.ticket))
    from split s left join public.events e on e.event_id = s.slug
    where not s.is_merch
  ), '[]'::json),
  'merchandise', coalesce((
    select json_agg(json_build_object(
      'id', s.id, 'registration_id', s.registration_id,
      'total', s.total, 'qr_token', s.qr_token,
      'created_at', s.created_at,
      'items', coalesce(i.items, '[]'::json)
    ) order by s.created_at desc)
    from split s left join items i on i.reg_id = s.id
    where s.is_merch
  ), '[]'::json),
  'name', (select s.name from split s where s.name is not null limit 1)
);
$fn$;

-- Verify:
--   select count(*) from public.registrations where resolved_event_id is null;
--   \timing on
--   select public.event_summaries();
--   select public.registration_event_map();
