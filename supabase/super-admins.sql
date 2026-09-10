-- A short list of who may actually change inventory, or grant and
-- edit admin and coordinator access.
--
-- Safe to re-run.
--
-- "admin" already gates these routes, but admin is a role anyone
-- could eventually hold, and some actions are sensitive enough that
-- holding the role should not be sufficient on its own -- changing
-- stock, or deciding who else gets to be an admin. This is a second,
-- narrower gate on top of the first: being admin AND being on this
-- list, not one or the other.
--
-- Deliberately a table, not a hard-coded list in application code, so
-- adding someone is a row an existing super admin inserts from
-- /admin/access rather than a deploy.

begin;

create table if not exists public.super_admins (
  email      text primary key,
  added_at   timestamptz not null default now(),
  added_by   text
);

/* Lower-cased on the way in, same as event_coordinators and
   event_volunteers: a scope that misses because of a capital letter
   fails open, which is the wrong direction for this particular
   table. */
create or replace function public.normalize_super_admin_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end;
$$;

drop trigger if exists super_admins_normalize on public.super_admins;

create trigger super_admins_normalize
  before insert or update on public.super_admins
  for each row execute function public.normalize_super_admin_email();

alter table public.super_admins enable row level security;

comment on table public.super_admins is
  'Emails allowed to change inventory or grant/edit admin and coordinator access, on top of holding the admin role itself.';

insert into public.super_admins (email)
values
  ('rahul.22mic7152@vitapstudent.ac.in'),
  ('gokul.23bce7451@vitapstudent.ac.in')
on conflict (email) do nothing;

commit;

-- Verify:
--   select email, added_at from public.super_admins order by added_at;
