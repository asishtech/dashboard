-- Enable Realtime for the dashboard tables.
--
-- Run once against your Supabase project (SQL Editor, or
-- `supabase db execute -f supabase/enable-realtime.sql`).
--
-- Two things have to be true before a browser receives a change:
--
--   1. The table is in the `supabase_realtime` publication.
--   2. RLS lets the subscribing user SELECT the row.
--
-- Realtime respects row level security. A change to a row the user
-- could not have read is never delivered. If the dashboard shows
-- "Polling" instead of "Live" after running this, the cause is
-- almost always (2), not (1).

begin;

-- 1. Publication -----------------------------------------------------------

-- `alter publication ... add table` has no IF NOT EXISTS form and
-- errors if the table is already a member; `drop table` likewise has
-- no IF EXISTS form and errors if it is not. So don't drop at all --
-- just add each table that is currently missing. Safe to re-run.
do $$
declare
  tbl text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  foreach tbl in array array[
    'registrations',
    'registration_items',
    'distributions',
    'inventory'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        tbl
      );
    end if;
  end loop;
end $$;

-- 2. Replica identity ------------------------------------------------------

-- Without this, DELETE and UPDATE events carry only the primary key,
-- so the client cannot tell which row changed beyond its id. FULL is
-- the simplest correct choice for tables this size.
alter table public.registrations      replica identity full;
alter table public.registration_items replica identity full;
alter table public.distributions      replica identity full;
alter table public.inventory          replica identity full;

commit;

-- 3. Read policies ---------------------------------------------------------
--
-- Uncomment and adapt if staff cannot currently SELECT these tables.
-- The app authorizes writes server-side with the service-role key, so
-- these only need to grant reads to signed-in staff.
--
-- create policy "staff read registrations"
--   on public.registrations for select
--   using (
--     exists (
--       select 1 from public.profiles p
--       where p.id = auth.uid()
--         and p.active
--         and p.role in ('admin', 'volunteer')
--     )
--   );
--
-- Repeat for registration_items, distributions and inventory.

-- 4. Verify ----------------------------------------------------------------
--
-- select tablename
--   from pg_publication_tables
--  where pubname = 'supabase_realtime'
--  order by tablename;
