-- The ID check follows the visitor into the college list.
--
-- Safe to re-run. Run after supabase/event-exit.sql.
--
-- external_college_people() returned everything the roster needed to
-- admit somebody and nothing about whether they should be admitted --
-- so the college view offered a "Mark entry" button that skipped the
-- one check the external desk exists to perform. Same person, same
-- database, two screens disagreeing about whether they may come in.
--
-- Adding id_checked here lets the roster refuse for the same reason
-- the desk does, and say so.

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
    /*
     * Per person, not per pass: the desk photographs one card, and
     * bool_or means a card seen against any of their registrations
     * counts for all of them.
     */
    bool_or(c.registration_id is not null)                 as id_checked,
    max(c.uploaded_at)                                     as id_checked_at,
    bool_or(c.photo_path is not null)                      as photo_taken,
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

-- Verify:
--   Every row now carries id_checked; the roster greys out "Mark
--   entry" on the false ones.
--
--   select p->>'name', p->>'id_checked', p->>'inside'
--   from json_array_elements(
--     public.external_college_people('srmap')
--   ) p;
