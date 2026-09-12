-- One-time backfill: Merch Phase 2 (event 518) items for the 103 registrations
-- placed before the portal started sending a proper item field. Each row's
-- item(s) come from the portal's own admin export
-- (event_registrations (39).xlsx, the "Category" column), matched here by
-- receipt_id -- not guessed from price, which repeats across different items
-- at the same size.
--
-- Safe to re-run: every one of these 103 registrations currently has zero
-- rows in registration_items (confirmed live before generating this), and
-- each insert is guarded by a not-exists check, so re-running this cannot
-- duplicate anything or overwrite a real handover.
--
-- 5 registrations from the same export had no Category and are NOT covered
-- here -- see the message this SQL was generated alongside.

begin;

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009730' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (White)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009063' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (White)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009071' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009072' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009073' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009074' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009076' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009077' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009078' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'XXL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009081' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009087' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009088' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009142' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009230' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XXL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009250' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (White)', 'XXL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009255' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Cap', 'FREE SIZE', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009292' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009292' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009292' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Cap', 'FREE SIZE', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009300' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009300' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009337' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009408' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009426' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009503' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'XXL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009505' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009506' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009507' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'FREE SIZE', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009508' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'FREE SIZE', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009509' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009510' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009513' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009517' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009520' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009525' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009528' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009533' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009538' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009540' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (White)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009550' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009574' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009574' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'S', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009575' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (White)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009582' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009583' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009586' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009587' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XXL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009588' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009589' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009590' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009595' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009596' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009600' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009602' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009605' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (White)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009609' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009620' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009625' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (White)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009632' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009637' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009642' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XXL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009643' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009646' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (White)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009647' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'FREE SIZE', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009653' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009655' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009657' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'XXL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009661' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009671' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'FREE SIZE', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009675' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'FREE SIZE', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009677' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (White)', 'XXL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009684' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (White)', 'FREE SIZE', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009687' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (White)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009688' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009691' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009693' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009695' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009695' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009696' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (White)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009725' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009736' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (White)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009761' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'FREE SIZE', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009774' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (White)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009791' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (White)', 'FREE SIZE', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009833' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009851' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009855' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009859' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009863' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (White)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009875' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009894' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009948' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (White)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009949' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-009955' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010065' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Cap', 'FREE SIZE', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010084' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (White)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010139' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010141' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (White)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010149' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (White)', 'XL', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010150' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Cap', 'FREE SIZE', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010161' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010161' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010161' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010163' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Cap', 'FREE SIZE', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010168' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010168' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010168' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (Dark Navy Blue)', 'M', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010172' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Cap', 'FREE SIZE', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010200' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Polo (White)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010218' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (White)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010221' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

insert into public.registration_items (registration_id, item, size, quantity)
select r.id, 'Hoodie (White)', 'L', 1
from public.registrations r
where r.receipt_id = 'VIT-26-27-010226' and r.event_id = '518'
  and not exists (
    select 1 from public.registration_items ri where ri.registration_id = r.id
  );

commit;

-- Verify:
--   select count(*) from public.registration_items ri
--     join public.registrations r on r.id = ri.registration_id
--    where r.event_id = '518';
