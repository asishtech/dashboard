-- Let a stock cap exist before anything has sold against it.
--
-- Safe to re-run. Run after supabase/inventory-sizes.sql.
--
-- merchandise_by_size() built its rows from registration_items, then
-- left-joined inventory_sizes onto them -- which means a combination
-- nobody has bought yet had no row to join onto, and there was no way
-- to see it, let alone cap it. An admin who wanted to block a size
-- outright -- set it to 0 before the first order comes in -- had
-- nothing to press. Now inventory_sizes and the sold totals are
-- combined with a full outer join, so a manually-added row shows up
-- with quantity/collected/pending all at zero until someone actually
-- orders it.

create or replace function public.merchandise_by_size()
returns json
language sql
stable
parallel safe
as $fn$
with per_item_size as (
  select
    ri.item,
    coalesce(nullif(upper(btrim(ri.size)), ''), 'No size') as size,
    sum(coalesce(ri.quantity, 1))                   as quantity,
    count(*)                                        as line_items,
    sum(
      case
        when exists (
          select 1 from public.distributions d
          where d.registration_item_id = ri.id
            and d.status = 'GIVEN'
        )
        then coalesce(ri.quantity, 1)
        else 0
      end
    ) as collected
  from public.registration_items ri
  group by 1, 2
),
combined as (
  select
    coalesce(p.item, s.item)  as item,
    coalesce(p.size, s.size)  as size,
    coalesce(p.quantity, 0)   as quantity,
    coalesce(p.line_items, 0) as line_items,
    coalesce(p.collected, 0)  as collected,
    s.initial_stock
  from per_item_size p
  full outer join public.inventory_sizes s
    on s.item = p.item and s.size = p.size
)
select coalesce(
  json_agg(
    json_build_object(
      'item',                item,
      'size',                size,
      'quantity',            quantity,
      'lineItems',           line_items,
      'collected',           collected,
      'pending',             quantity - collected,
      'initialStock',        initial_stock,
      'remaining',           case
                                when initial_stock is null then null
                                else initial_stock - quantity
                              end,
      'remainingPercentage', case
                                when initial_stock is null
                                  or initial_stock = 0 then null
                                else round(
                                  100.0 * (initial_stock - quantity)
                                    / initial_stock, 1
                                )
                              end
    )
    order by item, public.size_rank(size), size
  ),
  '[]'::json
)
from combined;
$fn$;

revoke all on function public.merchandise_by_size() from public;
grant execute on function public.merchandise_by_size() to service_role;

-- Verify:
--   select public.merchandise_by_size();
