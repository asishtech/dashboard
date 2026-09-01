-- One dashboard per person.
--
-- Run after supabase/events-seed.sql. Safe to re-run.
--
-- A single email can hold any number of registrations: several event
-- bookings and several merchandise orders, each its own row in the
-- feed. The buyer screen used to list them flat, so an event booking
-- and a hoodie order looked like the same kind of thing and the only
-- clue was whether the row happened to have items attached.
--
-- This splits them at the source. Events resolve through
-- resolve_event() so they carry their real name, day and venue rather
-- than the raw ticket string, and merchandise keeps the per-item
-- collection status that only it has.

create or replace function public.buyer_dashboard(p_email text)
returns json
language sql
stable
parallel safe
as $fn$
with mine as (
  select
    r.id,
    r.registration_id,
    r.name,
    r.qr_token,
    coalesce(r.total, 0) as total,
    r.ticket,
    r.created_at,
    r.event_id::text as source_event_id,
    public.resolve_event(r.event_id::text, r.product_meta) as slug,
    exists (
      select 1 from public.qr_scans q where q.registration_id = r.id
    ) as scanned
  from public.registrations r
  where lower(btrim(r.email)) = lower(btrim(p_email))
),
/*
 * Merchandise is upstream event 513. Anything else is an event
 * booking -- including one whose ticket text matched no known event,
 * which still belongs to this person and must not vanish.
 */
split as (
  select
    m.*,
    /*
     * coalesce is load-bearing. resolve_event() returns NULL for a
     * ticket that matched nothing, and `false or NULL` is NULL, not
     * false -- so `where not is_merch` would drop the row from the
     * events list without it ever appearing under merchandise. The
     * booking would simply cease to exist for its owner.
     */
    coalesce(
      m.source_event_id = '513' or m.slug = 'merchandise',
      false
    ) as is_merch
  from mine m
),
items as (
  select
    ri.registration_id as reg_id,
    json_agg(
      json_build_object(
        'id',       ri.id,
        'item',     ri.item,
        'size',     ri.size,
        'quantity', ri.quantity,
        'status',   case
                      when exists (
                        select 1 from public.distributions d
                        where d.registration_item_id = ri.id
                          and d.status = 'GIVEN'
                      ) then 'GIVEN'
                      else 'PENDING'
                    end
      )
      order by ri.item
    ) as items
  from public.registration_items ri
  where ri.registration_id in (select id from split)
  group by 1
)
select json_build_object(
  'events', coalesce(
    (
      select json_agg(
        json_build_object(
          'id',              s.id,
          'registration_id', s.registration_id,
          'event_id',        s.slug,
          /*
           * Fall back to the ticket text when nothing matched, so an
           * unmapped booking still reads as something recognisable
           * instead of a blank row.
           */
          'name',            coalesce(e.name, nullif(btrim(s.ticket), ''), 'Event booking'),
          'day',             e.day,
          'venue',           e.venue,
          'total',           s.total,
          'scanned',         s.scanned,
          'qr_token',        s.qr_token,
          'created_at',      s.created_at
        )
        order by e.day nulls last, coalesce(e.name, s.ticket)
      )
      from split s
      left join public.events e on e.event_id = s.slug
      where not s.is_merch
    ),
    '[]'::json
  ),

  'merchandise', coalesce(
    (
      select json_agg(
        json_build_object(
          'id',              s.id,
          'registration_id', s.registration_id,
          'total',           s.total,
          'qr_token',        s.qr_token,
          'created_at',      s.created_at,
          'items',           coalesce(i.items, '[]'::json)
        )
        order by s.created_at desc
      )
      from split s
      left join items i on i.reg_id = s.id
      where s.is_merch
    ),
    '[]'::json
  ),

  'name', (select s.name from split s where s.name is not null limit 1)
);
$fn$;

revoke all on function public.buyer_dashboard(text) from public;
grant execute on function public.buyer_dashboard(text) to service_role;

-- Verify (substitute a real address):
--   select public.buyer_dashboard('someone@vitapstudent.ac.in');
