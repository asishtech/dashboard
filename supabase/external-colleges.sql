-- Which colleges the outside visitors come from.
--
-- Safe to re-run. Run after supabase/external-registrations.sql.

begin;

-- 1. Stop reading the roll number as the college --------------------------

/*
 * The registration form has two fields whose names both contain
 * "University":
 *
 *   University Regd Number   25BCS7113      <- a roll number
 *   University Name          VIT AP
 *
 * The old extractor matched on the name containing university/college/
 * institute and took the *first* hit, which is the roll number. So
 * "which college" answered "AV.EN.U4ECE26016" for 1,110 registrations,
 * and every one of those counted as a college nobody had ever heard of.
 *
 * Excluding the id-shaped field names fixes it: 1,260 registrations
 * name a real institution, against 181 nonsense values before.
 */
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
    and lower(coalesce(f->>'field_name', ''))
        !~ '(regd|reg\.?\s*no|registration\s*(no|number)|roll|\mid\M|number|mobile|phone|email|size)'
    and nullif(btrim(f->>'field_value'), '') is not null
  limit 1;
$fn$;

commit;

-- 2. One college, however it was typed ------------------------------------

/*
 * 188 distinct spellings across the data, and most of them are the
 * same place: "VIT AP", "VIT-AP", "Vitap", "vit ap university",
 * "VIT AP University Campus, Central". Grouping on the raw string
 * would report 188 colleges where there are about 36.
 *
 * Punctuation and case carry no meaning in a free-text field anyone
 * types into on a phone, so both are removed.
 */
create or replace function public.normalize_institution(p_name text)
returns text
language sql
immutable
parallel safe
as $fn$
  select nullif(regexp_replace(lower(btrim(p_name)), '[^a-z0-9]', '', 'g'), '');
$fn$;

/*
 * Whether a normalised name is this university under another spelling.
 *
 * "Vellore Institute of Technology, Andhra Pradesh" is VIT-AP written
 * out in full, and counting six of those as visitors from elsewhere
 * would overstate the external figure by seven percent. A bare "vit"
 * is genuinely ambiguous and is left external rather than guessed at.
 */
create or replace function public.is_home_institution(p_key text)
returns boolean
language sql
immutable
parallel safe
as $fn$
  select coalesce(
    p_key like 'vitap%'
    or (p_key like 'velloreinstituteoftechnology%'
        and (p_key like '%andhra%' or p_key like '%ap')),
    false
  );
$fn$;

-- 3. The breakdown ---------------------------------------------------------

/*
 * One row per college, with the spelling most people used as the
 * label -- picking the first alphabetically would put "AMRITA" above
 * "Amrita vishwa vidyapeetham" and read as shouting.
 */
create or replace function public.external_colleges()
returns json
language sql
stable
as $fn$
with classified as (
  select
    r.id,
    r.email,
    r.registration_id,
    r.total,
    r.resolved_event_id,
    u.name as raw_name,
    public.normalize_institution(u.name) as key
  from public.registrations r
  cross join lateral (
    select public.registration_university(r.raw_data::jsonb) as name
  ) u
),
external as (
  select *
  from classified
  where key is not null
    and not public.is_home_institution(key)
    /* An address at this university outranks whatever was typed. */
    and coalesce(btrim(lower(email)), '') not like '%@vitapstudent.ac.in'
    and coalesce(btrim(lower(email)), '') not like '%@vitap.ac.in'
)
select json_build_object(
  'totals', json_build_object(
    'externalRegistrations', (select count(*) from external),
    'externalPeople', (
      select count(distinct lower(btrim(email))) from external
    ),
    'colleges', (select count(distinct key) from external),
    'revenue', (select coalesce(sum(coalesce(total, 0)), 0) from external),
    'noCollegeRecorded', (
      select count(*) from classified where key is null
    ),
    'internal', (
      select count(*) from classified
      where key is not null and public.is_home_institution(key)
    )
  ),
  'colleges', coalesce((
    select json_agg(row_to_json(c) order by c.registrations desc, c.name)
    from (
      select
        (
          /* The commonest spelling, as the label. */
          select e2.raw_name from external e2
          where e2.key = e.key
          group by e2.raw_name
          order by count(*) desc, length(e2.raw_name) desc
          limit 1
        ) as name,
        e.key,
        count(*)                                as registrations,
        count(distinct lower(btrim(e.email)))   as people,
        count(distinct e.resolved_event_id)
          filter (where e.resolved_event_id is not null) as events,
        coalesce(sum(coalesce(e.total, 0)), 0)  as revenue,
        count(distinct e.raw_name)              as spellings
      from external e
      group by e.key
    ) c
  ), '[]'::json)
);
$fn$;

/* Everyone from one college, for the desk and the export. */
create or replace function public.external_college_people(p_key text)
returns json
language sql
stable
as $fn$
select coalesce(json_agg(row_to_json(x) order by x.name), '[]'::json)
from (
  select distinct
    r.name,
    r.email,
    public.registration_university(r.raw_data::jsonb) as college,
    count(*) over (partition by lower(btrim(r.email))) as passes
  from public.registrations r
  where public.normalize_institution(
          public.registration_university(r.raw_data::jsonb)
        ) = btrim(p_key)
    and coalesce(btrim(lower(r.email)), '') not like '%@vitapstudent.ac.in'
    and coalesce(btrim(lower(r.email)), '') not like '%@vitap.ac.in'
) x;
$fn$;

revoke all on function public.external_colleges()            from public;
revoke all on function public.external_college_people(text)  from public;

grant execute on function public.external_colleges()           to service_role;
grant execute on function public.external_college_people(text) to service_role;

-- Verify:
--   select public.external_colleges() -> 'totals';
--   select public.registration_university(raw_data::jsonb)
--     from public.registrations limit 5;
