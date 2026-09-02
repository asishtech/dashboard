-- Event entry: one per QR, recorded deliberately.
--
-- Safe to re-run.
--
-- Two problems this fixes.
--
-- First, nothing enforced one scan per registration. Rows were written
-- by the *lookup* in /api/distribution/[token], so pointing a camera at
-- the same pass three times wrote three rows, and every check-in figure
-- was really a count of how often a code had been looked at.
--
-- Second, there was no act of admission at all. Merely resolving the QR
-- counted as entry, so a volunteer who scanned to see what a code was
-- had already marked the person in. Entry is now an explicit POST, and
-- this index is what makes "one entry per QR" a fact rather than a
-- convention.

begin;

alter table public.qr_scans
  add column if not exists scanned_by uuid,
  add column if not exists note text;

comment on column public.qr_scans.scanned_by is
  'profiles.id of whoever admitted them. Null for rows predating this.';

-- Collapse the duplicates the old lookup-writes-a-scan behaviour left
-- behind, keeping the earliest -- that is when the person actually
-- arrived; later rows are re-scans of the same pass.
delete from public.qr_scans q
using public.qr_scans keep
where q.registration_id = keep.registration_id
  and q.registration_id is not null
  and (
    keep.created_at < q.created_at
    or (keep.created_at = q.created_at and keep.id < q.id)
  );

create unique index if not exists qr_scans_one_per_registration
  on public.qr_scans (registration_id)
  where registration_id is not null;

commit;

-- Who may admit whom -------------------------------------------------------

-- A club coordinator must be able to admit their own event's attendees
-- and nobody else's. Resolving that in SQL keeps the rule in one place
-- rather than trusting each caller to filter first.
create or replace function public.registration_event_slug(p_token text)
returns text
language sql
stable
as $fn$
  select public.resolve_event(r.event_id::text, r.product_meta)
  from public.registrations r
  where r.qr_token = p_token
  limit 1;
$fn$;

-- Everything the scanner needs about one pass, including whether the
-- person is already inside.
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
  'event_id',        slug.event_id,
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
cross join lateral (
  select public.resolve_event(r.event_id::text, r.product_meta) as event_id
) slug
left join public.events e on e.event_id = slug.event_id
where r.qr_token = p_token
limit 1;
$fn$;

revoke all on function public.registration_event_slug(text) from public;
revoke all on function public.checkin_lookup(text)          from public;
grant execute on function public.registration_event_slug(text) to service_role;
grant execute on function public.checkin_lookup(text)          to service_role;

-- Event names for the registrations table --------------------------------

-- /admin/registrations was labelling rows from the upstream bucket id
-- alone -- 513 as "Merchandise", 514 as "V-TAPP Event", anything else
-- as "Unknown" -- so every one of the 89 real events read as the same
-- generic string. It never called resolve_event at all.
--
-- Returned as one object keyed by registration id so the API can fetch
-- it alongside the page of registrations rather than after it.
create or replace function public.registration_event_map()
returns json
language sql
stable
as $fn$
select coalesce(
  json_object_agg(
    id::text,
    json_build_object(
      'slug',  event_slug,
      'name',  event_name,
      'day',   event_day,
      'venue', event_venue,
      'merch', is_merch
    )
  ),
  '{}'::json
)
from (
  select
    r.id,
    slug.event_id as event_slug,
    coalesce(
      e.name,
      nullif(btrim(r.ticket), ''),
      'Unmapped ticket'
    ) as event_name,
    e.day   as event_day,
    e.venue as event_venue,
    (r.event_id::text = '513') as is_merch
  from public.registrations r
  cross join lateral (
    select public.resolve_event(r.event_id::text, r.product_meta)
      as event_id
  ) slug
  left join public.events e on e.event_id = slug.event_id
) x;
$fn$;

revoke all on function public.registration_event_map() from public;
grant execute on function public.registration_event_map() to service_role;

-- Verify:
--   select public.checkin_lookup('<a real qr_token>');
--   select public.registration_event_map();
--   select registration_id, count(*) from public.qr_scans
--     group by 1 having count(*) > 1;   -- must return no rows
