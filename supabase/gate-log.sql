-- The gate is not an event.
--
-- Safe to re-run. Run after supabase/desk-gate.sql.
--
-- The external desk let a visitor in by pressing "Mark entry" against
-- one of their event passes, because a pass was the only thing there
-- was to press. That is a lie in the data: it says they attended Art
-- Attack when what happened is that they walked through the front
-- gate, and the event's own check-in count -- the number its
-- coordinator reports -- goes up by one for somebody who never turned
-- up to it.
--
-- So the desk gets its own thing to record. One row per visit, per
-- person, not per pass. Events keep their own scans, taken by the
-- volunteer standing at that event's door.

begin;

create table if not exists public.gate_log (
  id         bigserial primary key,

  /* Lower-cased address: the desk works from a person, and one
     person may hold six passes. Not a foreign key -- a visitor's
     registrations may be edited or resynced under them, and a visit
     that happened should survive that. */
  email_key  text not null,

  /* Copied at the time, so the log still reads as a list of people
     after a sync rewrites the registration it came from. */
  name       text,
  college    text,

  entered_at timestamptz not null default now(),
  exited_at  timestamptz,

  entered_by text,
  exited_by  text
);

/*
 * At most one open visit each.
 *
 * A partial unique index rather than a check in the route: two
 * volunteers pressing "Gate entry" for the same person at the same
 * moment both reach the insert, and exactly one of them wins. The
 * loser is told the person is already inside, which is the truth.
 */
create unique index if not exists gate_log_open_visit
  on public.gate_log (email_key)
  where exited_at is null;

create index if not exists gate_log_entered_idx
  on public.gate_log (entered_at desc);

alter table public.gate_log enable row level security;

comment on table public.gate_log is
  'Visitor in and out of the venue. Distinct from qr_scans, which is attendance at one event.';

commit;

-- Who is inside, alongside the rest of a person ----------------------------

/*
 * gate_entered_at is the start of their open visit, or null if they
 * are not currently inside. The unique index above is what lets this
 * be a single value rather than a search through their history.
 */
create or replace function public.desk_search(
  p_query         text,
  p_external_only boolean default false
)
returns json
language sql
stable
as $fn$
with q as (
  select
    btrim(p_query)                                         as raw,
    lower(btrim(p_query))                                  as lowered,
    nullif(regexp_replace(p_query, '[^0-9]', '', 'g'), '') as digits
),
matched as (
  select
    r.id,
    r.registration_id,
    r.name,
    r.email,
    r.resolved_event_id,
    public.registration_phone(r.raw_data::jsonb)      as phone,
    public.registration_university(r.raw_data::jsonb) as college,
    public.canonical_college(
      public.normalize_institution(
        public.registration_university(r.raw_data::jsonb)
      )
    )                                                 as college_key
  from public.registrations r, q
  where (
    lower(r.name)  like '%' || q.lowered || '%'
    or lower(r.email) like '%' || q.lowered || '%'
    or r.registration_id = q.raw
    or (
      q.digits is not null and length(q.digits) >= 6
      and public.registration_phone(r.raw_data::jsonb) like '%' || q.digits || '%'
    )
  )
),
scoped as (
  select * from matched m
  where not p_external_only
     or (
       m.college_key is not null
       and not public.is_home_institution(m.college_key)
       and lower(m.email) not like '%@vitapstudent.ac.in'
       and lower(m.email) not like '%@vitap.ac.in'
     )
)
select coalesce(json_agg(row_to_json(p) order by p.name nulls last), '[]'::json)
from (
  select
    lower(btrim(s.email))          as email_key,
    max(s.email)                   as email,
    max(s.name)                    as name,
    max(s.phone)                   as phone,
    max(s.college)                 as college,
    bool_or(c.registration_id is not null) as id_checked,
    max(c.uploaded_at)             as id_checked_at,
    bool_or(c.photo_path is not null)      as photo_taken,
    max(g.entered_at)              as gate_entered_at,
    count(*)                       as passes,
    count(k.entered_at)            as admitted,
    count(*) filter (
      where k.entered_at is not null and k.exited_at is null
    )                              as inside,
    json_agg(
      json_build_object(
        'id',              s.id,
        'registration_id', s.registration_id,
        'event_id',        s.resolved_event_id,
        'event_name',      e.name,
        'event_day',       e.day,
        'event_venue',     e.venue,
        'is_merch',        (s.resolved_event_id in ('merchandise', '513')),
        'entered_at',      k.entered_at,
        'exited_at',       k.exited_at
      )
      order by e.day nulls last, e.name
    ) as passes_detail
  from scoped s
  left join public.events e on e.event_id = s.resolved_event_id
  left join lateral (
    select min(x.scanned_at) as entered_at, max(x.exited_at) as exited_at
    from public.qr_scans x where x.registration_id = s.id
  ) k on true
  left join public.external_id_cards c on c.registration_id = s.id
  left join lateral (
    select v.entered_at
    from public.gate_log v
    where v.email_key = lower(btrim(s.email))
      and v.exited_at is null
    limit 1
  ) g on true
  group by lower(btrim(s.email))
  limit 25
) p;
$fn$;

-- The same for the college roster ------------------------------------------

create or replace function public.external_college_people(p_key text)
returns json
language sql
stable
as $fn$
select coalesce(json_agg(row_to_json(x) order by x.name nulls last), '[]'::json)
from (
  select
    max(r.name)                                            as name,
    lower(btrim(r.email))                                  as email_key,
    max(r.email)                                           as email,
    max(public.registration_phone(r.raw_data::jsonb))      as phone,
    max(public.registration_university(r.raw_data::jsonb)) as college_as_typed,
    count(*)                                               as passes,
    coalesce(sum(coalesce(r.total, 0)), 0)                 as revenue,
    count(q.entered_at)                                    as admitted,
    count(*) filter (
      where q.entered_at is not null and q.exited_at is null
    )                                                      as inside,
    bool_or(c.registration_id is not null)                 as id_checked,
    max(c.uploaded_at)                                     as id_checked_at,
    bool_or(c.photo_path is not null)                      as photo_taken,
    max(g.entered_at)                                      as gate_entered_at,
    json_agg(
      json_build_object(
        'id',              r.id,
        'registration_id', r.registration_id,
        'event_name',      e.name,
        'event_day',       e.day,
        'event_venue',     e.venue,
        'entered_at',      q.entered_at,
        'exited_at',       q.exited_at
      ) order by e.day nulls last, e.name
    ) as passes_detail
  from public.registrations r
  left join public.events e on e.event_id = r.resolved_event_id
  left join lateral (
    select
      min(s.scanned_at) as entered_at,
      max(s.exited_at)  as exited_at
    from public.qr_scans s
    where s.registration_id = r.id
  ) q on true
  left join public.external_id_cards c on c.registration_id = r.id
  left join lateral (
    select v.entered_at
    from public.gate_log v
    where v.email_key = lower(btrim(r.email))
      and v.exited_at is null
    limit 1
  ) g on true
  where public.canonical_college(
          public.normalize_institution(
            public.registration_university(r.raw_data::jsonb)
          )
        ) = btrim(p_key)
    and coalesce(btrim(lower(r.email)), '') not like '%@vitapstudent.ac.in'
    and coalesce(btrim(lower(r.email)), '') not like '%@vitap.ac.in'
  group by lower(btrim(r.email))
) x;
$fn$;

-- How many visitors are in the building right now --------------------------

create or replace function public.gate_inside()
returns integer
language sql
stable
as $fn$
  select count(*)::int from public.gate_log where exited_at is null;
$fn$;

revoke all on function public.gate_inside() from public;
grant execute on function public.gate_inside() to service_role;

-- Verify:
--   select public.gate_inside();
--   select p->>'name', p->>'gate_entered_at'
--   from json_array_elements(public.desk_search('srm', true)) p;
