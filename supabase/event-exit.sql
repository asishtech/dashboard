-- Leaving, as distinct from never having arrived.
--
-- Safe to re-run. Run after supabase/college-aliases.sql.
--
-- Until now a scan meant "admitted", and the only way to reverse it
-- was an admin deleting the row -- which says the entry never
-- happened. That is the right tool for a mis-scan and the wrong one
-- for somebody who came in, watched the event and walked out: the
-- entry did happen, and a hall that has to be counted needs to know
-- they are no longer in it.

begin;

alter table public.qr_scans
  add column if not exists exited_at timestamptz,
  add column if not exists exited_by text;

/* Only ever a handful of rows are open at once during a session, so
   this is the index that matters: who is still inside. */
create index if not exists qr_scans_open_idx
  on public.qr_scans (registration_id)
  where exited_at is null;

comment on column public.qr_scans.exited_at is
  'When they left. Null means still inside. Deleting the row instead would claim they never entered.';

commit;

-- Who is in the room --------------------------------------------------------

/*
 * The passes belonging to one email, with entry *and* exit.
 *
 * Returns registration ids because the desk acts on them: this is the
 * list somebody works down while a queue waits, so every row has to
 * carry what the button needs.
 */
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
    /* In the building right now: entered and not yet left. */
    count(*) filter (
      where q.entered_at is not null and q.exited_at is null
    )                                                      as inside,
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

/* The same addition for the desk search and the whereabouts lookup,
   so every screen agrees on what "in" means. */
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
    r.id, r.registration_id, r.name, r.email, r.resolved_event_id, r.qr_token,
    public.registration_phone(r.raw_data::jsonb)      as phone,
    public.registration_university(r.raw_data::jsonb) as college,
    public.normalize_institution(
      public.registration_university(r.raw_data::jsonb)
    ) as college_key
  from public.registrations r, q
  where coalesce(btrim(r.email), '') <> ''
    and (
      lower(r.email) = q.lowered
      or lower(r.email) like '%' || q.lowered || '%'
      or r.registration_id = q.raw
      or lower(coalesce(r.name, '')) like '%' || q.lowered || '%'
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
  group by lower(btrim(s.email))
  limit 25
) p;
$fn$;

-- Verify:
--   select public.external_college_people('srmap');
--   select public.desk_search('srm', true);
