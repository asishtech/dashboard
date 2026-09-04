-- What the site is doing right now.
--
-- Safe to re-run.
--
-- Everything here except presence is derived from timestamps that are
-- already written -- qr_scans.scanned_at, distributions.given_at,
-- registrations.created_at. No new writes on the hot path: a load
-- monitor that itself loads the database is not a monitor.

begin;

-- Who is on the site ------------------------------------------------------

/*
 * One row per signed-in account, overwritten by a heartbeat.
 *
 * Not a log. A row per ping would be thousands of writes an hour to
 * answer a question about *now*, so the row is upserted in place and
 * "online" means last_seen_at is recent.
 */
create table if not exists public.presence (
  user_id      uuid primary key,
  email        text,
  role         text,
  path         text,
  last_seen_at timestamptz not null default now()
);

create index if not exists presence_seen_idx
  on public.presence (last_seen_at desc);

alter table public.presence enable row level security;

comment on table public.presence is
  'Live heartbeat, one row per account. Overwritten, never appended.';

commit;

-- The heartbeat ------------------------------------------------------------

create or replace function public.touch_presence(
  p_user_id uuid,
  p_email   text,
  p_role    text,
  p_path    text
)
returns void
language sql
as $fn$
  insert into public.presence (user_id, email, role, path, last_seen_at)
  values (p_user_id, p_email, p_role, p_path, now())
  on conflict (user_id) do update
    set email        = excluded.email,
        role         = excluded.role,
        path         = excluded.path,
        last_seen_at = now();
$fn$;

-- The pulse ----------------------------------------------------------------

/*
 * Three windows, because they answer different questions: the last
 * minute is "is it happening now", five minutes is "is the queue at
 * the gate moving", an hour is "how has the session gone".
 */
create or replace function public.activity_pulse()
returns json
language sql
stable
as $fn$
with
/*
 * Scans, resolved to the event they belong to.
 *
 * Not by joining qr_scans.event_id to events.event_id: the first is a
 * bigint carrying the upstream numeric id, the second is a text slug
 * like 'art-attack'. They are different types and different values,
 * so that join both failed to compile and would have matched nothing
 * if it had. The registration is what knows which event it is for,
 * and resolved_event_id is the answer every other query here uses.
 */
scans as (
  select
    s.scanned_at,
    s.scanned_by,
    r.resolved_event_id as event_slug
  from public.qr_scans s
  left join public.registrations r on r.id = s.registration_id
  where s.scanned_at > now() - interval '60 minutes'
),
gives as (
  select given_at, given_by from public.distributions
  where status = 'GIVEN' and given_at > now() - interval '60 minutes'
),
regs as (
  select created_at from public.registrations
  where created_at > now() - interval '60 minutes'
),
online as (
  select role, last_seen_at from public.presence
  where last_seen_at > now() - interval '2 minutes'
)
select json_build_object(
  'now', now(),

  'checkins', json_build_object(
    'lastMinute',  (select count(*) from scans where scanned_at > now() - interval '1 minute'),
    'last5',       (select count(*) from scans where scanned_at > now() - interval '5 minutes'),
    'lastHour',    (select count(*) from scans),
    'total',       (select count(*) from public.qr_scans)
  ),

  'handovers', json_build_object(
    'lastMinute',  (select count(*) from gives where given_at > now() - interval '1 minute'),
    'last5',       (select count(*) from gives where given_at > now() - interval '5 minutes'),
    'lastHour',    (select count(*) from gives)
  ),

  'registrations', json_build_object(
    'lastHour',    (select count(*) from regs),
    'total',       (select count(*) from public.registrations)
  ),

  /* Staff actually doing something, not merely signed in. */
  'activeScanners', (
    select count(distinct scanned_by) from scans
    where scanned_by is not null
      and scanned_at > now() - interval '15 minutes'
  ),

  'online', json_build_object(
    'total', (select count(*) from online),
    'byRole', coalesce(
      (select json_object_agg(role, n) from (
        select coalesce(role, 'unknown') as role, count(*) as n
        from online group by 1
      ) r),
      '{}'::json
    )
  ),

  /* Where the queues are. Only events that saw a scan this hour. */
  'busiest', coalesce((
    select json_agg(row_to_json(b) order by b.last5 desc, b.hour desc)
    from (
      select
        coalesce(e.name, s.event_slug, 'Unmapped') as name,
        count(*) filter (where s.scanned_at > now() - interval '5 minutes') as last5,
        count(*) as hour
      from scans s
      left join public.events e on e.event_id = s.event_slug
      group by 1
      order by 2 desc, 3 desc
      limit 6
    ) b
  ), '[]'::json),

  /* A minute-by-minute shape for the last half hour, so a spike is
     visible rather than inferred from three numbers. */
  'perMinute', coalesce((
    select json_agg(json_build_object('t', m.minute, 'n', coalesce(c.n, 0)) order by m.minute)
    from generate_series(
      date_trunc('minute', now()) - interval '29 minutes',
      date_trunc('minute', now()),
      interval '1 minute'
    ) as m(minute)
    left join (
      select date_trunc('minute', scanned_at) as minute, count(*) as n
      from scans group by 1
    ) c on c.minute = m.minute
  ), '[]'::json)
);
$fn$;

/*
 * Is anything broken.
 *
 * Separate from the pulse because these are read less often and are
 * the things worth alerting on, not watching.
 */
create or replace function public.app_health()
returns json
language sql
stable
as $fn$
select json_build_object(
  'sync', (
    select json_build_object(
      'lastSuccessAt', max(last_success_at),
      'lastError',     max(last_error),
      'minutesAgo',    round(
        extract(epoch from (now() - max(last_success_at))) / 60
      )
    )
    from public.sync_state
  ),

  'mailFailed24h', (
    select count(*) from public.email_log
    where status = 'failed' and sent_at > now() - interval '24 hours'
  ),

  /* Bookings whose event could not be resolved: they can be sold and
     paid for and still not belong to a gate. */
  'unmappedTickets', (
    select count(*) from public.registrations
    where resolved_event_id is null
  ),

  'registrationsWithoutEmail', (
    select count(*) from public.registrations
    where coalesce(btrim(email), '') = ''
  ),

  'registrationsWithoutToken', (
    select count(*) from public.registrations
    where qr_token is null
  )
);
$fn$;

revoke all on function public.activity_pulse()                    from public;
revoke all on function public.app_health()                        from public;
revoke all on function public.touch_presence(uuid, text, text, text) from public;

grant execute on function public.activity_pulse()                    to service_role;
grant execute on function public.app_health()                        to service_role;
grant execute on function public.touch_presence(uuid, text, text, text) to service_role;

-- Verify:
--   select public.activity_pulse();
--   select public.app_health();
