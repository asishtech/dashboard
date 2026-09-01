-- Several roles per account, with one active at a time.
--
-- One person can be an admin and also coordinate an event and also
-- work the scanner. Until now `role` held a single value, so granting
-- one took the others away.
--
-- `roles` is the set they hold. `role` stays as the primary one and
-- is kept in step by a trigger, so anything still reading it keeps
-- working -- there is no flag day.
--
-- Which role is *active* is not stored here. It lives in a cookie and
-- is validated against `roles` on every request, so the browser can
-- ask to be a faculty member but never to be an admin it was not
-- granted.
--
-- Safe to re-run.

begin;

-- 1. Columns ---------------------------------------------------------------

alter table public.staff_invites
  add column if not exists roles text[] not null default '{}';

alter table public.profiles
  add column if not exists roles text[] not null default '{}';

comment on column public.staff_invites.roles is
  'Every role this email may use. `role` is the primary one.';
comment on column public.profiles.roles is
  'Every role this account may use. `role` is the primary one.';

-- 2. Backfill from the single role ----------------------------------------

update public.staff_invites
   set roles = array[role]
 where role is not null
   and (roles is null or cardinality(roles) = 0);

update public.profiles
   set roles = array[role]
 where role is not null
   and (roles is null or cardinality(roles) = 0);

-- 3. Keep `role` in step ---------------------------------------------------

-- Highest privilege first, so `role` lands on the most capable one
-- rather than whichever happened to be added first.
create or replace function public.primary_role(p_roles text[])
returns text
language sql
immutable
parallel safe
as $fn$
  select r
  from unnest(coalesce(p_roles, '{}'::text[])) as r
  order by case r
    when 'admin'     then 1
    when 'faculty'   then 2
    when 'volunteer' then 3
    when 'buyer'     then 4
    else 5
  end
  limit 1;
$fn$;

create or replace function public.sync_primary_role()
returns trigger
language plpgsql
as $fn$
begin
  /* A write that only sets `role` (older code paths) seeds `roles`. */
  if new.roles is null or cardinality(new.roles) = 0 then
    if new.role is not null then
      new.roles := array[new.role];
    end if;
  end if;

  new.role := coalesce(
    public.primary_role(new.roles),
    new.role
  );

  return new;
end;
$fn$;

drop trigger if exists staff_invites_primary_role on public.staff_invites;
create trigger staff_invites_primary_role
  before insert or update on public.staff_invites
  for each row execute function public.sync_primary_role();

drop trigger if exists profiles_primary_role on public.profiles;
create trigger profiles_primary_role
  before insert or update on public.profiles
  for each row execute function public.sync_primary_role();

-- 4. Constrain the contents ------------------------------------------------

-- The CHECK on `role` already restricts the primary. This restricts
-- every member of the set.
alter table public.staff_invites
  drop constraint if exists staff_invites_roles_check;

alter table public.staff_invites
  add constraint staff_invites_roles_check
  check (roles <@ array['admin','volunteer','buyer','faculty']::text[]);

alter table public.profiles
  drop constraint if exists profiles_roles_check;

alter table public.profiles
  add constraint profiles_roles_check
  check (roles <@ array['admin','volunteer','buyer','faculty']::text[]);

commit;

-- Verify:
--   select email, role, roles from public.staff_invites limit 5;
--   select public.primary_role(array['volunteer','admin']);  -- admin
