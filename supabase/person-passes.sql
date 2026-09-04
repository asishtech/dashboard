-- One email per person, carrying every pass they hold.
--
-- Safe to re-run. Run after supabase/mail-controls.sql.
--
-- Today the queue is one row per registration, so somebody entered for
-- nine events gets nine emails. Across 1,408 registrations held by 917
-- people that is 491 messages more than necessary -- and on a Workspace
-- trial, capped near 500 a day, those 491 are a whole extra day of
-- sending.
--
-- Grouping is by lower(btrim(email)), because that is the only identity
-- the upstream feed gives us. Two people sharing an address would share
-- a PDF; that is already true of anything else keyed on email here.
--
-- email_log stays one row per registration. The once-only index is what
-- guarantees nobody is confirmed twice, and moving it to the person
-- would lose that guarantee for anyone who registers again later.

begin;

-- Nothing to alter: this file only adds functions.

commit;

-- The queue, by person ----------------------------------------------------

-- p_limit counts *people*, not passes, because one person is one email
-- and the batch size exists to bound how long a send takes.
--
-- Ordered by the person's earliest unsent registration: if only part of
-- the queue goes out today, whoever registered first hears first.
create or replace function public.pending_people(p_limit int)
returns json
language sql
stable
as $fn$
with unsent as (
  select
    r.id,
    r.registration_id,
    r.name,
    r.email,
    r.qr_token,
    r.created_at,
    public.resolve_event(r.event_id::text, r.product_meta) as event_slug,
    (r.event_id::text = '513') as is_merch
  from public.registrations r
  where coalesce(btrim(r.email), '') <> ''
    and r.qr_token is not null
    and not exists (
      select 1 from public.email_log l
      where l.registration_id = r.id
        and l.email_type = 'confirmation'
        and l.status = 'sent'
    )
),
people as (
  select
    lower(btrim(email)) as key,
    min(created_at)     as first_at
  from unsent
  group by 1
  order by min(created_at)
  limit greatest(coalesce(p_limit, 20), 0)
)
select coalesce(json_agg(row_to_json(x) order by x.first_at), '[]'::json)
from (
  select
    p.key      as email_key,
    p.first_at,

    /* The address as written, not the folded key -- it is what the
       message is actually addressed to. */
    (select u.email from unsent u
      where lower(btrim(u.email)) = p.key
      limit 1) as email,

    /* Any non-null name among their rows. The feed leaves it blank on
       some and fills it on others for the same person. */
    (select u.name from unsent u
      where lower(btrim(u.email)) = p.key
        and coalesce(btrim(u.name), '') <> ''
      limit 1) as name,

    (
      select json_agg(
        json_build_object(
          'id',              u.id,
          'registration_id', u.registration_id,
          'qr_token',        u.qr_token,
          'is_merch',        u.is_merch,
          'event_name',      e.name,
          'event_day',       e.day,
          'event_venue',     e.venue
        )
        /* Merchandise last: it is collected at a counter whenever,
           the events are the things with a time to be somewhere. */
        order by u.is_merch, e.day nulls last, e.name
      )
      from unsent u
      left join public.events e on e.event_id = u.event_slug
      where lower(btrim(u.email)) = p.key
    ) as passes
  from people p
) x;
$fn$;

-- Everything one person holds, sent or not. Drives the resend box,
-- which should re-send the whole PDF rather than one page of it.
create or replace function public.person_passes(p_email text)
returns json
language sql
stable
as $fn$
select coalesce(
  json_build_object(
    'email', max(r.email),
    'name',  max(r.name) filter (where coalesce(btrim(r.name), '') <> ''),
    'passes', json_agg(
      json_build_object(
        'id',              r.id,
        'registration_id', r.registration_id,
        'qr_token',        r.qr_token,
        'is_merch',        (r.event_id::text = '513'),
        'event_name',      e.name,
        'event_day',       e.day,
        'event_venue',     e.venue
      )
      order by (r.event_id::text = '513'), e.day nulls last, e.name
    )
  ),
  '{}'::json
)
from public.registrations r
left join public.events e
  on e.event_id = public.resolve_event(r.event_id::text, r.product_meta)
where lower(btrim(r.email)) = lower(btrim(p_email))
  and r.qr_token is not null;
$fn$;

-- The automatic queue, by person, for registrations created since
-- automatic sending was switched on.
create or replace function public.pending_people_since(
  p_limit int,
  p_since timestamptz
)
returns json
language sql
stable
as $fn$
with unsent as (
  select
    r.id, r.registration_id, r.name, r.email, r.qr_token, r.created_at,
    public.resolve_event(r.event_id::text, r.product_meta) as event_slug,
    (r.event_id::text = '513') as is_merch
  from public.registrations r
  where coalesce(btrim(r.email), '') <> ''
    and r.qr_token is not null
    and p_since is not null
    and r.created_at >= p_since
    and not exists (
      select 1 from public.email_log l
      where l.registration_id = r.id
        and l.email_type = 'confirmation'
        and l.status = 'sent'
    )
),
people as (
  select lower(btrim(email)) as key, min(created_at) as first_at
  from unsent
  group by 1
  order by min(created_at)
  limit greatest(coalesce(p_limit, 15), 0)
)
select coalesce(json_agg(row_to_json(x) order by x.first_at), '[]'::json)
from (
  select
    p.key as email_key,
    p.first_at,
    (select u.email from unsent u
      where lower(btrim(u.email)) = p.key limit 1) as email,
    (select u.name from unsent u
      where lower(btrim(u.email)) = p.key
        and coalesce(btrim(u.name), '') <> '' limit 1) as name,
    (
      select json_agg(
        json_build_object(
          'id', u.id, 'registration_id', u.registration_id,
          'qr_token', u.qr_token, 'is_merch', u.is_merch,
          'event_name', e.name, 'event_day', e.day, 'event_venue', e.venue
        )
        order by u.is_merch, e.day nulls last, e.name
      )
      from unsent u
      left join public.events e on e.event_id = u.event_slug
      where lower(btrim(u.email)) = p.key
    ) as passes
  from people p
) x;
$fn$;

-- How much is outstanding, counted both ways ------------------------------

-- pendingConfirmations stays as it was (registrations still owed a
-- pass), and pendingPeople is how many emails that actually is. The
-- screen shows both, because "1,408 waiting / 917 emails" is the whole
-- point of this change.
create or replace function public.email_queue_summary()
returns json
language sql
stable
as $fn$
with unsent as (
  select r.id, r.email
  from public.registrations r
  where coalesce(btrim(r.email), '') <> ''
    and r.qr_token is not null
    and not exists (
      select 1 from public.email_log l
      where l.registration_id = r.id
        and l.email_type = 'confirmation'
        and l.status = 'sent'
    )
)
select json_build_object(
  'pendingConfirmations', (select count(*) from unsent),
  'pendingPeople', (
    select count(distinct lower(btrim(email))) from unsent
  ),
  'sentConfirmations', (
    select count(*) from public.email_log
    where email_type = 'confirmation' and status = 'sent'
  ),
  'sentCollections', (
    select count(*) from public.email_log
    where email_type = 'collection' and status = 'sent'
  ),
  'failedLast24h', (
    select count(*) from public.email_log
    where status = 'failed' and sent_at > now() - interval '24 hours'
  ),
  /* Counts messages, not passes: this is the figure Gmail caps. One
     log row per registration would over-count a nine-pass PDF as nine
     sends and stop the queue five times too early. */
  'sentLast24h', (
    select count(distinct (recipient, date_trunc('second', sent_at)))
    from public.email_log
    where status = 'sent' and sent_at > now() - interval '24 hours'
  ),
  'lastSentAt', (
    select max(sent_at) from public.email_log where status = 'sent'
  )
);
$fn$;

revoke all on function public.pending_people(int)                     from public;
revoke all on function public.pending_people_since(int, timestamptz)  from public;
revoke all on function public.person_passes(text)                     from public;

grant execute on function public.pending_people(int)                    to service_role;
grant execute on function public.pending_people_since(int, timestamptz) to service_role;
grant execute on function public.person_passes(text)                    to service_role;

-- Verify:
--   select json_array_length(public.pending_people(5));
--   select public.email_queue_summary();
--   select public.person_passes('someone@vitapstudent.ac.in');
