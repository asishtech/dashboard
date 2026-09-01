-- Rename the `coordinator` role to `faculty`.
--
-- Same access: scoped to the events assigned in `event_coordinators`.
-- Only the label changes, so nobody gains or loses anything.
--
-- The assignment table keeps its name. It describes the relationship
-- (who runs which event) and holds both staff and student addresses;
-- `faculty` is the role they sign in as.
--
-- Safe to re-run.

begin;

-- 1. Drop the old constraints ----------------------------------------------
--
-- Order matters. Adding the new CHECK before the UPDATE would
-- validate it against rows that still say 'coordinator', and the
-- whole transaction would abort.

do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in (
        'public.profiles'::regclass,
        'public.staff_invites'::regclass
      )
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

-- 2. Move the rows ---------------------------------------------------------

update public.staff_invites set role = 'faculty' where role = 'coordinator';
update public.profiles       set role = 'faculty' where role = 'coordinator';

-- 3. Re-apply, now including every role the app can assign -----------------

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'volunteer', 'buyer', 'faculty'));

alter table public.staff_invites
  add constraint staff_invites_role_check
  check (role in ('admin', 'volunteer', 'buyer', 'faculty'));

commit;

-- Verify:
--   select role, count(*) from public.staff_invites group by role;
--   select role, count(*) from public.profiles      group by role;
