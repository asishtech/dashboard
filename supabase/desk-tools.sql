-- Desk tools: find a person, and say where they are.
--
-- Safe to re-run. Run after supabase/external-colleges.sql.
--
-- Two jobs:
--
--   1. The external desk: find a visitor by name, email or phone,
--      record that their college ID was checked, and admit them
--      without a QR code.
--   2. Anyone: type an email or registration number and see which
--      event that person is at right now.

begin;

-- Proof that a visitor's ID was seen --------------------------------------

/*
 * One row per registration whose ID card was checked at the desk.
 *
 * A row rather than a column on registrations, because the sync
 * rewrites every registration row it sees and would drop it. This
 * table is ours; nothing upstream touches it.
 *
 * The image itself lives in Supabase Storage under the `id-cards`
 * bucket; only the path is kept here. Storage is where a
 * seven-megabyte phone photo belongs, and keeping the bytes out of
 * the row keeps every query that reads registrations fast.
 */
create table if not exists public.external_id_cards (
  registration_id bigint primary key
    references public.registrations(id) on delete cascade,
  storage_path    text not null,
  uploaded_by     text,
  uploaded_at     timestamptz not null default now(),
  note            text
);

create index if not exists external_id_cards_time_idx
  on public.external_id_cards (uploaded_at desc);

alter table public.external_id_cards enable row level security;

comment on table public.external_id_cards is
  'A visitor college ID seen at the desk. Path only; the image is in Storage.';

commit;

-- The phone number on the form --------------------------------------------

/*
 * Only some forms ask for it -- 84 of 400 sampled rows carry a
 * "Mobile Number" field -- so a phone search finds a subset and the
 * screen has to say so rather than imply the person does not exist.
 *
 * Digits only for comparison: people type 7207066999, +91 7207066999
 * and 072070 66999 for the same number.
 */
create or replace function public.registration_phone(p_raw jsonb)
returns text
language sql
immutable
parallel safe
as $fn$
  select nullif(regexp_replace(coalesce(f->>'field_value', ''), '[^0-9]', '', 'g'), '')
  from jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(p_raw -> 'field_values', '[]'::jsonb)) = 'array'
      then p_raw -> 'field_values'
      else '[]'::jsonb
    end
  ) f
  where lower(coalesce(f->>'field_name', '')) ~ '(mobile|phone|contact|whatsapp)'
    and length(regexp_replace(coalesce(f->>'field_value', ''), '[^0-9]', '', 'g')) >= 10
  limit 1;
$fn$;

-- Find a person ------------------------------------------------------------

/*
 * One row per person, with every pass they hold and whether each has
 * been admitted.
 *
 * p_external_only narrows it to visitors, which is what the external
 * desk wants; the admin lookup passes false and searches everybody.
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
    btrim(p_query)                                        as raw,
    lower(btrim(p_query))                                 as lowered,
    nullif(regexp_replace(p_query, '[^0-9]', '', 'g'), '') as digits
),
matched as (
  select
    r.id,
    r.registration_id,
    r.name,
    r.email,
    r.resolved_event_id,
    r.qr_token,
    public.registration_phone(r.raw_data::jsonb)       as phone,
    public.registration_university(r.raw_data::jsonb)  as college,
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
        q.digits is not null
        and length(q.digits) >= 6
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
    count(*)                       as passes,
    count(k.registration_id)       as admitted,
    json_agg(
      json_build_object(
        'id',              s.id,
        'registration_id', s.registration_id,
        'event_id',        s.resolved_event_id,
        'event_name',      e.name,
        'event_day',       e.day,
        'event_venue',     e.venue,
        'is_merch',        (s.resolved_event_id = 'merchandise' or s.resolved_event_id = '513'),
        'entered_at',      k.scanned_at
      )
      order by e.day nulls last, e.name
    ) as passes_detail
  from scoped s
  left join public.events e on e.event_id = s.resolved_event_id
  left join lateral (
    select q.registration_id, min(q.scanned_at) as scanned_at
    from public.qr_scans q
    where q.registration_id = s.id
    group by q.registration_id
  ) k on true
  left join public.external_id_cards c on c.registration_id = s.id
  group by lower(btrim(s.email))
  limit 25
) p;
$fn$;

-- Where is this person now -------------------------------------------------

/*
 * Their most recent admission, and every pass with its state.
 *
 * "Where are they" is answered by the last scan, not by what they
 * registered for: somebody entered for four events is at the one they
 * were last admitted to. Everything else is context for the person
 * asking.
 */
create or replace function public.person_whereabouts(p_query text)
returns json
language sql
stable
as $fn$
with people as (
  select value from json_array_elements(public.desk_search(p_query, false))
)
select coalesce(json_agg(
  json_build_object(
    'email',   value->>'email',
    'name',    value->>'name',
    'phone',   value->>'phone',
    'college', value->>'college',
    'passes',  value->'passes_detail',
    'admitted', (value->>'admitted')::int,
    'total',    (value->>'passes')::int,
    /* The latest admission: where they are. */
    'current', (
      select json_build_object(
        'event_name', p->>'event_name',
        'event_venue', p->>'event_venue',
        'event_day', p->>'event_day',
        'at', p->>'entered_at'
      )
      from json_array_elements(value->'passes_detail') p
      where p->>'entered_at' is not null
      order by (p->>'entered_at')::timestamptz desc
      limit 1
    )
  )
), '[]'::json)
from people;
$fn$;

revoke all on function public.registration_phone(jsonb)        from public;
revoke all on function public.desk_search(text, boolean)       from public;
revoke all on function public.person_whereabouts(text)         from public;

grant execute on function public.registration_phone(jsonb)  to service_role;
grant execute on function public.desk_search(text, boolean) to service_role;
grant execute on function public.person_whereabouts(text)   to service_role;

-- Verify:
--   select public.desk_search('7207066999', false);
--   select public.person_whereabouts('someone@vitapstudent.ac.in');
