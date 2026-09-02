-- Merchandise sold, broken down by size.
--
-- Safe to re-run.
--
-- `inventory_status` counts each garment as one number, which is the
-- number you cannot act on: knowing 120 hoodies sold does not tell you
-- whether to reorder S or XL. registration_items already carries the
-- size the buyer picked, so the breakdown is a grouping, not new data.
--
-- Only merchandise has items -- an event booking produces none -- so
-- this needs no filter to stay out of the events' way.

begin;

-- Sizes must not sort alphabetically. 'L, M, S, XL, XXL' is the order
-- of no shop on earth and makes a stock table unreadable.
create or replace function public.size_rank(p_size text)
returns int
language sql
immutable
parallel safe
as $fn$
  select case upper(regexp_replace(coalesce(p_size, ''), '[^A-Za-z0-9]', '', 'g'))
    when 'XS'       then 1
    when 'EXTRASMALL' then 1
    when 'S'        then 2
    when 'SMALL'    then 2
    when 'M'        then 3
    when 'MEDIUM'   then 3
    when 'L'        then 4
    when 'LARGE'    then 4
    when 'XL'       then 5
    when 'EXTRALARGE' then 5
    when 'XXL'      then 6
    when '2XL'      then 6
    when 'XXXL'     then 7
    when '3XL'      then 7
    when 'FREESIZE' then 8
    /* Anything unrecognised sorts last rather than in the middle. */
    else 9
  end;
$fn$;

commit;

create or replace function public.merchandise_by_size()
returns json
language sql
stable
parallel safe
as $fn$
with per_item_size as (
  select
    ri.item,
    /*
     * Upper-cased before grouping. The feed's size comes from a form
     * field, so 'm' and 'M' both occur, and grouping on the raw string
     * would report the same size as two rows -- the one failure that
     * makes a stock table actively misleading rather than merely
     * incomplete.
     *
     * A wearable with no size recorded is a real condition worth
     * seeing, not a row to drop: it means the buyer never picked one,
     * or the form field did not come through. Labelling it keeps it
     * countable.
     */
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
      'item',       item,
      'size',       size,
      'quantity',   quantity,
      'lineItems',  line_items,
      'collected',  collected,
      'pending',    quantity - collected
    )
    order by item, public.size_rank(size), size
  ),
  '[]'::json
)
from per_item_size;
$fn$;

revoke all on function public.merchandise_by_size() from public;
grant execute on function public.merchandise_by_size() to service_role;

-- Verify:
--   select public.merchandise_by_size();
