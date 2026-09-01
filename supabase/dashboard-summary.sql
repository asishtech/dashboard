-- Dashboard aggregates, computed in Postgres.
--
-- Run once against your Supabase project (SQL Editor, or
-- `supabase db execute -f supabase/dashboard-summary.sql`).
--
-- Why:
--   /api/dashboard used to SELECT every row of `registrations`,
--   `qr_scans` and `registration_items` and reduce them in Node, on
--   every dashboard load, for every open tab. The answer is about
--   twenty numbers. This does the reduction where the data already
--   is and returns a single JSON row.
--
-- The route falls back to the old in-Node aggregation if this
-- function is missing, so deploying the app before running this file
-- is safe -- it will just be slow, as before.

-- Event ids come from the upstream V-TAPP feed.
--   513 = Merchandise
--   514 = V-TAPP 2026 Events
-- They were hardcoded in six places in the route; they now live here.

create or replace function public.dashboard_summary()
returns json
language sql
stable
parallel safe
as $$
with
  reg as (
    select
      /*
       * `event_id` is text on `registrations` but bigint on
       * `qr_scans` in some deployments. Cast before comparing so the
       * same file works against either.
       */
      coalesce(nullif(btrim(r.event_id::text), ''), 'unknown')
        as event_id,
      coalesce(r.total, 0)                        as amount,
      /*
       * Ticket label out of `product_meta`, which looks like
       *   'V-TAPP merchandise - Date: ... - Ticket: Combo 5 (...)'
       *
       * Split rather than one clever regex: in Postgres the
       * greediness of an alternation is decided by the first
       * quantifier in the pattern, which makes a single
       * non-greedy expression here fragile.
       */
      coalesce(
        nullif(
          btrim(
            split_part(
              coalesce(
                (regexp_match(
                  coalesce(r.product_meta, ''),
                  'Ticket:\s*(.*)$',
                  'i'
                ))[1],
                ''
              ),
              ' - Date:',
              1
            )
          ),
          ''
        ),
        'Unknown'
      ) as ticket
    from public.registrations r
  ),

  totals as (
    select
      count(*)                                                  as registrations,
      coalesce(sum(amount), 0)                                  as total_amount,
      coalesce(sum(amount) filter (where event_id = '513'), 0)  as merch_revenue,
      coalesce(sum(amount) filter (where event_id <> '513'), 0) as event_revenue,
      count(*) filter (where event_id = '513')                  as merch_registrations,
      count(*) filter (where event_id <> '513')                 as event_registrations
    from reg
  ),

  events as (
    select coalesce(
      json_agg(
        json_build_object(
          'event_id', event_id,
          'name', case event_id
                    when '513' then 'Merchandise'
                    when '514' then 'V-TAPP 2026 Events'
                    else 'Event ' || event_id
                  end,
          'registrations', registrations,
          'revenue', revenue
        )
        order by revenue desc
      ),
      '[]'::json
    ) as breakdown
    from (
      select event_id, count(*) as registrations, sum(amount) as revenue
      from reg
      group by event_id
    ) e
  ),

  tickets as (
    select coalesce(
      json_agg(
        json_build_object(
          'ticket', ticket,
          'registrations', registrations,
          'revenue', revenue
        )
        order by revenue desc
      ),
      '[]'::json
    ) as breakdown
    from (
      select ticket, count(*) as registrations, sum(amount) as revenue
      from reg
      group by ticket
    ) t
  ),

  scans as (
    select
      count(*)                                         as total,
      count(*) filter (where event_id::text = '514')   as event_scanned,
      count(*) filter (where event_id::text = '513')   as merch_scanned
    from public.qr_scans
  ),

  /*
   * Distribution.
   *
   * An item can carry several distribution rows, so clamp the given
   * count to the ordered quantity before summing. Mirrors what the
   * route did in JS.
   */
  dist as (
    select
      coalesce(sum(least(given_count, qty)), 0)        as given,
      coalesce(sum(greatest(qty - given_count, 0)), 0) as pending
    from (
      select
        greatest(coalesce(ri.quantity, 1), 1)                   as qty,
        count(d.id) filter (where d.status = 'GIVEN')::int      as given_count
      from public.registration_items ri
      left join public.distributions d
        on d.registration_item_id = ri.id
      group by ri.id, ri.quantity
    ) per_item
  ),

  inv as (
    select coalesce(
      json_agg(
        json_build_object(
          'id', id,
          'item', item,
          'initial_stock', initial_stock,
          'sold', sold,
          'remaining', remaining,
          'remaining_percentage', remaining_percentage
        )
        order by item
      ),
      '[]'::json
    ) as rows
    from public.inventory_status
  )

select json_build_object(
  'registrations',              totals.registrations,
  'totalAmount',                totals.total_amount,
  'eventRevenue',               totals.event_revenue,
  'merchandiseRevenue',         totals.merch_revenue,
  'eventRegistrations',         totals.event_registrations,
  'merchandiseRegistrations',   totals.merch_registrations,
  'eventRegistrationCount',     totals.event_registrations,
  'merchandiseRegistrationCount', totals.merch_registrations,
  'eventQrScanned',             scans.event_scanned,
  'merchandiseQrScanned',       scans.merch_scanned,
  'qrScans',                    scans.total,
  'eventBreakdown',             events.breakdown,
  'ticketBreakdown',            tickets.breakdown,
  'inventory',                  inv.rows,
  'distribution', json_build_object(
    'given',   dist.given,
    'pending', dist.pending,
    'total',   dist.given + dist.pending
  )
)
from totals, events, tickets, scans, dist, inv;
$$;

-- The route calls this with the service-role key and does its own
-- role check first, so no wider grant is needed.
revoke all on function public.dashboard_summary() from public;
grant execute on function public.dashboard_summary() to service_role;

-- Indexes the aggregation leans on. Cheap, and they help the
-- registrations list too.
create index if not exists registrations_event_id_idx
  on public.registrations (event_id);

create index if not exists qr_scans_event_id_idx
  on public.qr_scans (event_id);

create index if not exists distributions_item_status_idx
  on public.distributions (registration_item_id, status);

-- Verify:
--   select public.dashboard_summary();
