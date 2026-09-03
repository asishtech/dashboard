-- Record of every email this app has sent.
--
-- Safe to re-run.
--
-- This table is not bookkeeping, it is the safety rail. A V-TAPP sync
-- rewrites every registration it sees, so without a record of what has
-- already gone out, one re-sync would send several hundred people a
-- second copy of their pass. The unique index below is what makes that
-- impossible rather than merely unlikely.

begin;

/*
 * An email_log already exists in this project from an earlier version,
 * with its own column names: email_type rather than kind,
 * error_message rather than error. `create table if not exists` would
 * silently skip and then the index below fails on a column that is not
 * there -- which is exactly what happened.
 *
 * So: create it only if genuinely absent, using the existing naming,
 * and add whatever a pre-existing copy is missing.
 */
create table if not exists public.email_log (
  id              bigserial primary key,

  /* public.registrations.id. Null for mail not about a registration,
     such as an admin alert. */
  registration_id bigint,

  /* 'confirmation' | 'collection' | 'alert' */
  email_type      text not null,

  recipient       text not null,

  /* 'sent' | 'failed' */
  status          text not null default 'sent',
  error_message   text,

  sent_at         timestamptz not null default now()
);

/* Present in ours, absent from the older table. sendAlert throttles on
   it, so it cannot be optional. */
alter table public.email_log
  add column if not exists subject         text,
  add column if not exists registration_id bigint,
  add column if not exists error_message   text;

/*
 * One confirmation and one collection receipt per registration, ever.
 * Partial, so failures do not occupy the slot -- a send that errored
 * must be retryable, a send that succeeded must not be repeatable.
 */
create unique index if not exists email_log_once
  on public.email_log (registration_id, email_type)
  where registration_id is not null and status = 'sent';

create index if not exists email_log_kind_time
  on public.email_log (email_type, sent_at desc);

commit;

-- Registrations still owed a confirmation --------------------------------

-- Everything the sender needs in one row, so the batch endpoint does no
-- joins of its own. Ordered oldest first: if the fest is mid-flight and
-- only part of the queue can go out, the people who registered earliest
-- should hear first.
create or replace function public.pending_confirmations(p_limit int)
returns json
language sql
stable
as $fn$
select coalesce(
  json_agg(row_to_json(x) order by x.created_at),
  '[]'::json
)
from (
  select
    r.id,
    r.registration_id,
    r.name,
    r.email,
    r.qr_token,
    coalesce(r.total, 0) as total,
    r.created_at,
    public.resolve_event(r.event_id::text, r.product_meta) as event_slug,
    e.name  as event_name,
    e.day   as event_day,
    e.venue as event_venue,
    (r.event_id::text = '513') as is_merch
  from public.registrations r
  left join public.events e
    on e.event_id = public.resolve_event(r.event_id::text, r.product_meta)
  where coalesce(btrim(r.email), '') <> ''
    and r.qr_token is not null
    and not exists (
      select 1 from public.email_log l
      where l.registration_id = r.id
        and l.email_type = 'confirmation'
        and l.status = 'sent'
    )
  order by r.created_at
  limit greatest(coalesce(p_limit, 25), 0)
) x;
$fn$;

-- How much is outstanding, without shipping the rows themselves.
create or replace function public.email_queue_summary()
returns json
language sql
stable
as $fn$
select json_build_object(
  'pendingConfirmations', (
    select count(*)
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
  /* Gmail counts a day, so does this. Drives the cap check. */
  'sentLast24h', (
    select count(*) from public.email_log
    where status = 'sent' and sent_at > now() - interval '24 hours'
  ),
  'lastSentAt', (
    select max(sent_at) from public.email_log where status = 'sent'
  )
);
$fn$;

revoke all on function public.pending_confirmations(int) from public;
revoke all on function public.email_queue_summary()      from public;
grant execute on function public.pending_confirmations(int) to service_role;
grant execute on function public.email_queue_summary()      to service_role;

alter table public.email_log enable row level security;

-- Verify:
--   select public.email_queue_summary();
--   select public.pending_confirmations(3);
