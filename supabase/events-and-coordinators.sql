-- Events and club coordinators.
--
-- Run once against your Supabase project (SQL Editor, or
-- `supabase db execute -f supabase/events-and-coordinators.sql`).
--
-- Background: the upstream V-TAPP feed sends `event_id` but no event
-- name. The name is the `product_meta` prefix:
--
--   'V-TAPP merchandise - Date: 11 Sep 2026-12 Sep 2026 - Ticket: Cap'
--    ^^^^^^^^^^^^^^^^^^
--
-- So `events` is populated from the feed rather than typed by hand,
-- and an admin can override the label afterwards.

begin;

-- 1. Events ----------------------------------------------------------------

create table if not exists public.events (
  event_id    text primary key,

  -- Derived from product_meta on first sight.
  name        text not null,

  -- Set to true once an admin edits the name, so later syncs stop
  -- overwriting it with the feed's version.
  name_locked boolean not null default false,

  event_date  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.events.name_locked is
  'Admin renamed this event; sync must not overwrite name.';

-- 2. Coordinator assignments -----------------------------------------------

-- An email may coordinate several events, and an event may have
-- several coordinators.
create table if not exists public.event_coordinators (
  id         bigserial primary key,
  email      text not null,
  event_id   text not null references public.events(event_id) on delete cascade,
  created_at timestamptz not null default now(),

  unique (email, event_id)
);

create index if not exists event_coordinators_email_idx
  on public.event_coordinators (lower(email));

create index if not exists event_coordinators_event_idx
  on public.event_coordinators (event_id);

-- Emails are matched case-insensitively everywhere else in the app.
create or replace function public.normalize_coordinator_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end;
$$;

drop trigger if exists event_coordinators_normalize on public.event_coordinators;

create trigger event_coordinators_normalize
  before insert or update on public.event_coordinators
  for each row execute function public.normalize_coordinator_email();

-- 3. Allow the coordinator role --------------------------------------------

-- `profiles.role` and `staff_invites.role` may carry a CHECK
-- constraint listing the known roles. Widen it if so.
do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in (
        'public.profiles'::regclass,
        'public.staff_invites'::regclass
      )
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'volunteer', 'buyer', 'coordinator'));

alter table public.staff_invites
  add constraint staff_invites_role_check
  check (role in ('admin', 'volunteer', 'coordinator'));

commit;

-- 4. Backfill events from what has already synced --------------------------

insert into public.events (event_id, name, event_date)
select
  r.event_id,
  coalesce(
    nullif(
      btrim(split_part(coalesce(r.product_meta, ''), ' - Date:', 1)),
      ''
    ),
    'Event ' || r.event_id
  ) as name,
  max(r.event_date) as event_date
from public.registrations r
where r.event_id is not null
  and r.event_id <> ''
group by r.event_id, 2
on conflict (event_id) do nothing;

-- 5. Per-event aggregates --------------------------------------------------

-- One row per event, for the events index. Same reasoning as
-- dashboard_summary(): reduce where the data is rather than shipping
-- every registration to Node.
create or replace function public.event_summaries()
returns json
language sql
stable
parallel safe
as $$
with per_event as (
  select
    r.event_id,
    count(*)                    as registrations,
    coalesce(sum(r.total), 0)   as revenue,
    count(distinct r.email)     as participants,
    max(r.created_at)           as last_registration
  from public.registrations r
  where r.event_id is not null and r.event_id <> ''
  group by r.event_id
),
scans as (
  select event_id, count(*) as scanned
  from public.qr_scans
  where event_id is not null
  group by event_id
)
select coalesce(
  json_agg(
    json_build_object(
      'event_id',      e.event_id,
      'name',          e.name,
      'event_date',    e.event_date,
      'registrations', coalesce(p.registrations, 0),
      'participants',  coalesce(p.participants, 0),
      'revenue',       coalesce(p.revenue, 0),
      'scanned',       coalesce(s.scanned, 0),
      'lastRegistration', p.last_registration
    )
    order by coalesce(p.registrations, 0) desc, e.name
  ),
  '[]'::json
)
from public.events e
left join per_event p on p.event_id = e.event_id
left join scans     s on s.event_id = e.event_id;
$$;

-- 6. Attendees for one event -----------------------------------------------

-- Deliberately narrow: name, email and registration id only. Club
-- coordinators see this, and the feed also carries mobile numbers,
-- invoice ids and payment dates that they have no need for.
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
      'scanned',         exists (
        select 1 from public.qr_scans q
        where q.registration_id = r.id
      )
    )
    order by r.name
  ),
  '[]'::json
)
from public.registrations r
where r.event_id = p_event_id;
$$;

revoke all on function public.event_summaries()          from public;
revoke all on function public.event_attendees(text)      from public;
grant execute on function public.event_summaries()       to service_role;
grant execute on function public.event_attendees(text)   to service_role;

create index if not exists registrations_event_email_idx
  on public.registrations (event_id, email);

-- Verify:
--   select public.event_summaries();
--   select public.event_attendees('513');
--   select * from public.events;
