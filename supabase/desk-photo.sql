-- A live photo of the visitor, taken at the desk.
--
-- Safe to re-run. Run after supabase/desk-tools.sql.
--
-- The ID card proves the document exists. The photo proves the person
-- holding it turned up, which is a different claim -- and the two are
-- only useful together, so they live on the same row.

begin;

alter table public.external_id_cards
  add column if not exists photo_path     text,
  add column if not exists photo_at       timestamptz,
  add column if not exists photo_by       text,
  /*
   * How the photo was shown to be of a live person:
   *
   *   'blink'   a face landmarker saw the eyes close and reopen
   *   'motion'  three frames differed enough to rule out a still
   *   'none'    neither check ran; the desk took it on trust
   *
   * Recorded rather than assumed, because the fallback is weaker than
   * the real check and a row that cannot say which it used is a row
   * nobody can weigh later.
   */
  add column if not exists liveness       text,
  /* The blink score, or the frame difference, whichever ran. */
  add column if not exists liveness_score numeric;

comment on column public.external_id_cards.liveness is
  'blink | motion | none -- which check passed, never inferred.';

commit;

-- Everything the desk has on one visitor -----------------------------------

-- Extends desk_search's per-person shape with the photo, so the card
-- can show both checks without a second round-trip.
create or replace function public.desk_photo_status(p_registration_id bigint)
returns json
language sql
stable
as $fn$
select coalesce(
  (select json_build_object(
     'idCard',        c.storage_path is not null,
     'idCardAt',      c.uploaded_at,
     'photo',         c.photo_path is not null,
     'photoAt',       c.photo_at,
     'photoBy',       c.photo_by,
     'liveness',      c.liveness,
     'livenessScore', c.liveness_score
   )
   from public.external_id_cards c
   where c.registration_id = p_registration_id),
  json_build_object('idCard', false, 'photo', false)
);
$fn$;

revoke all on function public.desk_photo_status(bigint) from public;
grant execute on function public.desk_photo_status(bigint) to service_role;

-- Verify:
--   select public.desk_photo_status(1);
--   select registration_id, liveness, round(liveness_score,2)
--     from public.external_id_cards where photo_path is not null;
