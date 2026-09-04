-- Resending a pass, and automatic mail for new registrations.
--
-- Safe to re-run. Run after supabase/email-log.sql.
--
-- Three things:
--
--   1. Resends stop colliding with the once-only index.
--   2. A settings table, so "send automatically" survives a redeploy.
--   3. A lookup for the resend box, and a queue scoped to the people
--      who registered after automatic sending was switched on.

begin;

-- 1. Let a deliberate resend through --------------------------------------

/*
 * email_log_once exists to stop a re-sync mailing 1,241 people a
 * second copy of their pass. It does that by refusing a second 'sent'
 * row for the same (registration_id, email_type).
 *
 * That also refuses an admin who means it -- somebody deleted the
 * mail, or the address was wrong and has been corrected.
 *
 * So the index now covers only the automatic types. A resend is
 * logged as 'confirmation-resend', which the index ignores and
 * pending_confirmations does not treat as a send, so a resent pass
 * neither blocks nor re-queues anything. It still carries
 * status = 'sent', so it still counts against the daily cap: Gmail
 * charges for it either way.
 */
drop index if exists public.email_log_once;

create unique index if not exists email_log_once
  on public.email_log (registration_id, email_type)
  where registration_id is not null
    and status = 'sent'
    and email_type in ('confirmation', 'collection');

-- 2. Settings --------------------------------------------------------------

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

comment on table public.app_settings is
  'Small operational switches an admin flips at runtime. Not user data.';

/*
 * Automatic sending is off until somebody turns it on, and turning it
 * on records the moment.
 *
 * The timestamp is the whole point. Without it, enabling this with
 * 1,241 unsent registrations already in the table would start mailing
 * the entire backlog -- which is the exact accident the manual button
 * exists to prevent. Scoped to `enabledAt`, "send automatically" means
 * what it sounds like: people who register from now on.
 */
insert into public.app_settings (key, value)
values ('mail_auto_send', '{"enabled": false, "enabledAt": null}'::jsonb)
on conflict (key) do nothing;

create or replace function public.get_setting(p_key text)
returns jsonb
language sql
stable
as $fn$
  select value from public.app_settings where key = p_key;
$fn$;

create or replace function public.set_setting(p_key text, p_value jsonb)
returns jsonb
language sql
as $fn$
  insert into public.app_settings (key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key)
    do update set value = excluded.value, updated_at = now()
  returning value;
$fn$;

commit;

-- 3. Who to send to --------------------------------------------------------

-- Everything the resend box needs: find a person, and say whether
-- their pass has already gone out.
--
-- Capped at 20. This answers "which of these is the right Priya", not
-- "export the database".
create or replace function public.mail_lookup(p_query text)
returns json
language sql
stable
as $fn$
select coalesce(
  json_agg(row_to_json(x) order by x.rank, x.created_at desc),
  '[]'::json
)
from (
  select
    /*
     * Exact matches first.
     *
     * Without this, searching "1" hit the LIKE branch on every
     * address containing a 1, and `limit 20` then kept the twenty
     * newest -- so the row actually asked for was crowded out by
     * near-misses. Rank before recency, or a precise query gets the
     * same answer as a vague one.
     */
    case
      when r.id::text = btrim(p_query)                     then 0
      when r.registration_id = btrim(p_query)              then 1
      when lower(r.email) = lower(btrim(p_query))          then 2
      else 3
    end as rank,
    r.id,
    r.registration_id,
    r.name,
    r.email,
    r.qr_token,
    r.created_at,
    public.resolve_event(r.event_id::text, r.product_meta) as event_slug,
    e.name  as event_name,
    e.day   as event_day,
    e.venue as event_venue,
    (r.event_id::text = '513') as is_merch,
    (
      select max(l.sent_at) from public.email_log l
      where l.registration_id = r.id
        and l.email_type in ('confirmation', 'confirmation-resend')
        and l.status = 'sent'
    ) as last_sent_at,
    (
      select count(*) from public.email_log l
      where l.registration_id = r.id
        and l.email_type in ('confirmation', 'confirmation-resend')
        and l.status = 'sent'
    ) as times_sent
  from public.registrations r
  left join public.events e
    on e.event_id = public.resolve_event(r.event_id::text, r.product_meta)
  where coalesce(btrim(r.email), '') <> ''
    and r.qr_token is not null
    and (
      /*
       * The primary key, first.
       *
       * The resend endpoint re-reads a person by the id the browser
       * sent, and that is registrations.id -- not registration_id,
       * which is the upstream reference and a different number
       * entirely (8296 against 45654). Without this branch that
       * lookup matched nothing and every single resend answered
       * "Registration not found, or it has no email address", which
       * was true of the query and not of the person.
       */
      r.id::text = btrim(p_query)
      or lower(r.email) = lower(btrim(p_query))
      or lower(r.email) like '%' || lower(btrim(p_query)) || '%'
      or r.registration_id = btrim(p_query)
      or lower(coalesce(r.name, '')) like '%' || lower(btrim(p_query)) || '%'
    )
  /*
   * Rank inside the limit, not outside it.
   *
   * Ordering the twenty rows *after* they were chosen by recency
   * sorted the wrong twenty: the exact match was dropped before the
   * ranking ever saw it. The limit has to be taken from the ranked
   * order, or it is recency that decides and rank only rearranges
   * the leftovers.
   */
  order by
    case
      when r.id::text = btrim(p_query)            then 0
      when r.registration_id = btrim(p_query)     then 1
      when lower(r.email) = lower(btrim(p_query)) then 2
      else 3
    end,
    r.created_at desc
  limit 20
) x;
$fn$;

-- The automatic queue: people who registered after the switch was
-- flipped, and whose pass has not gone out.
--
-- Deliberately a separate function rather than a parameter on
-- pending_confirmations. The manual button must keep seeing the whole
-- backlog; only the automatic path is time-boxed.
create or replace function public.pending_confirmations_since(
  p_limit int,
  p_since timestamptz
)
returns json
language sql
stable
as $fn$
select coalesce(json_agg(row_to_json(x) order by x.created_at), '[]'::json)
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
    and p_since is not null
    and r.created_at >= p_since
    and not exists (
      select 1 from public.email_log l
      where l.registration_id = r.id
        and l.email_type = 'confirmation'
        and l.status = 'sent'
    )
  order by r.created_at
  limit greatest(coalesce(p_limit, 20), 0)
) x;
$fn$;

revoke all on function public.mail_lookup(text)                       from public;
revoke all on function public.pending_confirmations_since(int, timestamptz) from public;
revoke all on function public.get_setting(text)                       from public;
revoke all on function public.set_setting(text, jsonb)                from public;

grant execute on function public.mail_lookup(text)                       to service_role;
grant execute on function public.pending_confirmations_since(int, timestamptz) to service_role;
grant execute on function public.get_setting(text)                       to service_role;
grant execute on function public.set_setting(text, jsonb)                to service_role;

-- Verify:
--   select public.get_setting('mail_auto_send');
--   select public.mail_lookup('some@email.com');
--   select public.pending_confirmations_since(5, now() - interval '1 day');
