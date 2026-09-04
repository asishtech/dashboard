-- A read-only role for the registrations desk.
--
-- Safe to re-run.
--
-- Run after supabase/multi-role.sql and
-- supabase/rename-coordinator-to-faculty.sql, which own the
-- constraints this widens.
--
-- Until now the only way to let somebody see the whole festival --
-- every event, every merchandise order, who has collected what -- was
-- to make them an admin, which also lets them reverse a collection,
-- undo an entry, edit stock and change staff. This separates looking
-- from touching.
--
-- Enforcement is in the API, not here: every write route already
-- requires 'admin', so a 'registrations' account is refused by the
-- same check that refuses a buyer. This file only teaches the
-- database that the role exists.

begin;

-- 1. Allow the new value ---------------------------------------------------

-- `role` is the primary one, `roles` the whole set. Both are
-- constrained, and both have to learn the new name or the update in
-- /admin/users fails with a check violation.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'volunteer', 'buyer', 'faculty', 'registrations'));

alter table public.staff_invites
  drop constraint if exists staff_invites_role_check;

alter table public.staff_invites
  add constraint staff_invites_role_check
  check (role in ('admin', 'volunteer', 'buyer', 'faculty', 'registrations'));

alter table public.profiles
  drop constraint if exists profiles_roles_check;

alter table public.profiles
  add constraint profiles_roles_check
  check (roles <@ array['admin','volunteer','buyer','faculty','registrations']::text[]);

alter table public.staff_invites
  drop constraint if exists staff_invites_roles_check;

alter table public.staff_invites
  add constraint staff_invites_roles_check
  check (roles <@ array['admin','volunteer','buyer','faculty','registrations']::text[]);

commit;

-- 2. Rank it -------------------------------------------------------------

/*
 * `role` is kept in step with `roles` by a trigger that calls this,
 * picking the most capable member of the set.
 *
 * An unranked role falls into the `else 5` bucket, which sorts below
 * buyer -- so before this change, granting somebody
 * {registrations, buyer} left their primary role as 'buyer' and they
 * landed on the buyer dashboard instead of the events list.
 *
 * It sits above buyer and below volunteer: it sees more than a buyer
 * (the whole festival rather than their own orders) and less than a
 * volunteer (who can actually admit people and hand items over).
 */
create or replace function public.primary_role(p_roles text[])
returns text
language sql
immutable
parallel safe
as $fn$
  select r
  from unnest(coalesce(p_roles, '{}'::text[])) as r
  order by case r
    when 'admin'         then 1
    when 'faculty'       then 2
    when 'volunteer'     then 3
    when 'registrations' then 4
    when 'buyer'         then 5
    else 6
  end
  limit 1;
$fn$;

-- 3. Re-settle any profile whose primary was decided by the old order -----

-- No-op unless somebody already holds the role. Touching `roles`
-- fires sync_primary_role(), which recomputes `role`.
update public.profiles
   set roles = roles
 where 'registrations' = any(roles);

-- Verify:
--   select public.primary_role(array['registrations','buyer']);
--     -> registrations
--   select public.primary_role(array['admin','registrations']);
--     -> admin
--   insert into public.staff_invites (email, role, roles)
--   values ('desk@vitap.ac.in', 'registrations', array['registrations']);
