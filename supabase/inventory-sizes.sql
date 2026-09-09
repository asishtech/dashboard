-- Stock, per item *and* size.
--
-- Safe to re-run. Run after supabase/merchandise-sizes.sql.
--
-- `inventory` caps one number per garment -- 400 navy hoodies -- which
-- is not the number anyone reorders against: running out of L while
-- XS sits untouched is invisible in a total. merchandise_by_size()
-- already breaks *sold* down this way; stock never was, so there was
-- nothing to set a limit against and nothing to warn when one size
-- was about to run out while the item total still looked healthy.

begin;

create table if not exists public.inventory_sizes (
  id            bigserial primary key,
  item          text not null,
  /*
   * Upper-cased, matching the label merchandise_by_size() groups sold
   * quantities under -- 'M', 'XL', 'FREE SIZE', 'No size'. Stored the
   * same way so the two join on equality rather than a case-fold at
   * read time.
   */
  size          text not null,
  initial_stock integer not null default 0
    constraint inventory_sizes_stock_non_negative check (initial_stock >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (item, size)
);

commit;

-- merchandise_by_size() now also reports stock, remaining and percent
-- remaining per size, mirroring what inventory_status already does
-- per item. All three are null where nobody has configured that
-- item/size yet -- absence, not zero, since zero would read as sold
-- out rather than as unset.
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
)
select coalesce(
  json_agg(
    json_build_object(
      'item',                p.item,
      'size',                p.size,
      'quantity',            p.quantity,
      'lineItems',           p.line_items,
      'collected',           p.collected,
      'pending',             p.quantity - p.collected,
      'initialStock',        s.initial_stock,
      'remaining',           case
                                when s.initial_stock is null then null
                                else s.initial_stock - p.quantity
                              end,
      'remainingPercentage', case
                                when s.initial_stock is null
                                  or s.initial_stock = 0 then null
                                else round(
                                  100.0 * (s.initial_stock - p.quantity)
                                    / s.initial_stock, 1
                                )
                              end
    )
    order by p.item, public.size_rank(p.size), p.size
  ),
  '[]'::json
)
from per_item_size p
left join public.inventory_sizes s
  on s.item = p.item and s.size = p.size;
$fn$;

revoke all on function public.merchandise_by_size() from public;
grant execute on function public.merchandise_by_size() to service_role;

-- Verify:
--   select public.merchandise_by_size();
