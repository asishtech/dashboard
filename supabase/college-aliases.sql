-- Spellings that mean the same college, and a way to add more.
--
-- Safe to re-run. Run after supabase/external-colleges.sql.
--
-- Why a table rather than fuzzy matching:
--
-- Trigram similarity was measured against the real values and there is
-- no threshold that works. The pairs that must merge score low and the
-- pairs that must not score high:
--
--   should merge     srmap ~ srmuap                    0.44
--                    srmap ~ srmuniversity             0.18
--                    rvrjccollegeofengineering ~ rvrjcce  0.21
--
--   must not merge   JNTU Kakinada ~ JNTU Ananthapur   0.66
--                    NRI Institute ~ DR RVR NRI        0.72
--
-- Anything loose enough to catch "Srmuap" merges two different JNTU
-- campuses into one, and reports a college that does not exist. So the
-- groupings are stated rather than guessed, and an admin can add any
-- the seed missed.

begin;

create table if not exists public.college_aliases (
  /* The normalised spelling, as normalize_institution() produces. */
  alias_key     text primary key,
  /* The key it should count as. */
  canonical_key text not null,
  /* What to call the group on screen. */
  canonical_name text,
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists college_aliases_canonical_idx
  on public.college_aliases (canonical_key);

alter table public.college_aliases enable row level security;

comment on table public.college_aliases is
  'Spelling -> canonical college. Hand-maintained; no algorithm decides this.';

commit;

-- Seed ---------------------------------------------------------------------

/*
 * Only groups verifiable by eye from the registrations themselves.
 *
 * Deliberately NOT merged, though they look close:
 *   - JNTU Kakinada and JNTU Ananthapur are different universities.
 *   - Vignan University (VFSTR, Vadlamudi) and Vignan Nirula
 *     Institute are different colleges that share a founder's name.
 *   - NRI Institute of Technology and DR RVR NRI are left apart
 *     because I could not confirm they are one place, and merging two
 *     real colleges is worse than listing one twice.
 */
insert into public.college_aliases (alias_key, canonical_key, canonical_name)
values
  -- Amrita: nine spellings, one university
  ('amritavishwavidyapeetham',        'amritavishwavidyapeetham', 'Amrita Vishwa Vidyapeetham'),
  ('amritaviswavidyapeetham',         'amritavishwavidyapeetham', 'Amrita Vishwa Vidyapeetham'),
  ('amritavishwavidhyapeetham',       'amritavishwavidyapeetham', 'Amrita Vishwa Vidyapeetham'),
  ('amritavishwavidyapeetam',         'amritavishwavidyapeetham', 'Amrita Vishwa Vidyapeetham'),
  ('amritavishwavidhyapeeth',         'amritavishwavidyapeetham', 'Amrita Vishwa Vidyapeetham'),
  ('amritauniversity',                'amritavishwavidyapeetham', 'Amrita Vishwa Vidyapeetham'),
  ('amrithauniversity',               'amritavishwavidyapeetham', 'Amrita Vishwa Vidyapeetham'),
  ('amritaamaravati',                 'amritavishwavidyapeetham', 'Amrita Vishwa Vidyapeetham'),
  ('amritaviswavidyapeetamamaravati', 'amritavishwavidyapeetham', 'Amrita Vishwa Vidyapeetham'),

  -- SRM AP: the case that prompted this
  ('srmap',            'srmap', 'SRM University AP'),
  ('srmuap',           'srmap', 'SRM University AP'),
  ('srmuniveristyap',  'srmap', 'SRM University AP'),
  ('srmapuniversity',  'srmap', 'SRM University AP'),
  ('srmuniversity',    'srmap', 'SRM University AP'),

  -- Pragati
  ('pragatiengineeringcollege', 'pragatiengineeringcollege', 'Pragati Engineering College'),
  ('pragaticollegeengineering', 'pragatiengineeringcollege', 'Pragati Engineering College'),
  ('pragatiuniversity',         'pragatiengineeringcollege', 'Pragati Engineering College'),

  -- R.V.R & J.C
  ('rvrjccollegeofengineering',   'rvrjccollegeofengineering', 'R.V.R & J.C College of Engineering'),
  ('rvrjcce',                     'rvrjccollegeofengineering', 'R.V.R & J.C College of Engineering'),
  ('rvrandjccoleegeofengineering','rvrjccollegeofengineering', 'R.V.R & J.C College of Engineering'),

  -- SRKR (not SRK Institute of Technology, which is a different college)
  ('srkrengineeringcollege', 'srkrengineeringcollege', 'SRKR Engineering College'),
  ('srkrec',                 'srkrengineeringcollege', 'SRKR Engineering College'),

  -- Vignan's Foundation / VFSTR, Vadlamudi. Nirula is left separate.
  ('vignansfoundationforscienceandtechnologyresearch', 'vignanuniversity', 'Vignan University (VFSTR)'),
  ('vignansfoundationforsciencetechnologyandresearchvadlamudi', 'vignanuniversity', 'Vignan University (VFSTR)'),
  ('vignanuniversity',       'vignanuniversity', 'Vignan University (VFSTR)'),
  ('vignanuniversityguntur', 'vignanuniversity', 'Vignan University (VFSTR)'),
  ('vignan',                 'vignanuniversity', 'Vignan University (VFSTR)'),
  ('vfstr',                  'vignanuniversity', 'Vignan University (VFSTR)'),

  -- GMRIT
  ('gmritdu', 'gmritdu', 'GMRIT (Deemed University)'),

  -- Dr RVR NRI
  ('drrvrnriinstituteoftechnologydeemedtobeuniversity', 'drrvrnri', 'Dr. RVR NRI Institute of Technology'),
  ('drrvrnriinstituteoftechnology',                     'drrvrnri', 'Dr. RVR NRI Institute of Technology'),
  ('drrvrnrideemedtobeuniversity',                      'drrvrnri', 'Dr. RVR NRI Institute of Technology')
on conflict (alias_key) do update
  set canonical_key  = excluded.canonical_key,
      canonical_name = excluded.canonical_name;

-- Resolve ------------------------------------------------------------------

create or replace function public.canonical_college(p_key text)
returns text
language sql
stable
as $fn$
  select coalesce(
    (select canonical_key from public.college_aliases where alias_key = p_key),
    p_key
  );
$fn$;

-- The breakdown, now grouped by canonical college ---------------------------

create or replace function public.external_colleges()
returns json
language sql
stable
as $fn$
with classified as (
  select
    r.id, r.email, r.registration_id, r.total, r.resolved_event_id,
    u.name as raw_name,
    public.normalize_institution(u.name) as raw_key
  from public.registrations r
  cross join lateral (
    select public.registration_university(r.raw_data::jsonb) as name
  ) u
),
external as (
  select *, public.canonical_college(raw_key) as key
  from classified
  where raw_key is not null
    and not public.is_home_institution(raw_key)
    and coalesce(btrim(lower(email)), '') not like '%@vitapstudent.ac.in'
    and coalesce(btrim(lower(email)), '') not like '%@vitap.ac.in'
)
select json_build_object(
  'totals', json_build_object(
    'externalRegistrations', (select count(*) from external),
    'externalPeople', (select count(distinct lower(btrim(email))) from external),
    'colleges', (select count(distinct key) from external),
    'revenue', (select coalesce(sum(coalesce(total, 0)), 0) from external),
    'noCollegeRecorded', (select count(*) from classified where raw_key is null),
    'internal', (
      select count(*) from classified
      where raw_key is not null and public.is_home_institution(raw_key)
    )
  ),
  'colleges', coalesce((
    select json_agg(row_to_json(c) order by c.registrations desc, c.name)
    from (
      select
        coalesce(
          /* A name an admin chose beats the commonest typo. */
          (select a.canonical_name from public.college_aliases a
            where a.canonical_key = e.key and a.canonical_name is not null
            limit 1),
          (select e2.raw_name from external e2
            where e2.key = e.key
            group by e2.raw_name
            order by count(*) desc, length(e2.raw_name) desc
            limit 1)
        ) as name,
        e.key,
        count(*)                              as registrations,
        count(distinct lower(btrim(e.email))) as people,
        count(distinct e.resolved_event_id)
          filter (where e.resolved_event_id is not null) as events,
        coalesce(sum(coalesce(e.total, 0)), 0) as revenue,
        count(distinct e.raw_name)             as spellings,
        (select json_agg(distinct e3.raw_name) from external e3
          where e3.key = e.key)                as variants
      from external e
      group by e.key
    ) c
  ), '[]'::json)
);
$fn$;

-- Everyone from one college ------------------------------------------------

create or replace function public.external_college_people(p_key text)
returns json
language sql
stable
as $fn$
select coalesce(json_agg(row_to_json(x) order by x.name nulls last), '[]'::json)
from (
  select
    max(r.name)                                    as name,
    lower(btrim(r.email))                          as email_key,
    max(r.email)                                   as email,
    max(public.registration_phone(r.raw_data::jsonb)) as phone,
    max(public.registration_university(r.raw_data::jsonb)) as college_as_typed,
    count(*)                                       as passes,
    coalesce(sum(coalesce(r.total, 0)), 0)         as revenue,
    count(q.registration_id)                       as admitted,
    json_agg(
      json_build_object(
        'registration_id', r.registration_id,
        'event_name',      e.name,
        'event_day',       e.day,
        'entered_at',      q.scanned_at
      ) order by e.day nulls last, e.name
    ) as passes_detail
  from public.registrations r
  left join public.events e on e.event_id = r.resolved_event_id
  left join lateral (
    select min(s.scanned_at) as scanned_at, min(s.registration_id) as registration_id
    from public.qr_scans s where s.registration_id = r.id
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

revoke all on function public.canonical_college(text) from public;
grant execute on function public.canonical_college(text) to service_role;

-- Verify:
--   select public.external_colleges() -> 'totals';
--   select public.external_college_people('srmap');
