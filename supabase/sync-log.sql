/*
 * sync_log — a single-row sentinel table.
 *
 * The V-TAPP sync writes rows to `registrations` throughout its run
 * (not just at the end), so Supabase Realtime fires mid-sync. Pages
 * that subscribe to `registrations` refresh with partial data and then
 * go silent for up to 2 minutes before the reconciliation poll fires.
 *
 * This table fixes that. The sync API writes to it once, AFTER every
 * registration row has been upserted. Every open page (admin, events)
 * subscribes to it and refreshes on that signal — which arrives after
 * the sync is fully complete, not during it.
 *
 * The table never grows: id = 1 is the only row, and upsert replaces it.
 *
 * Safe to re-run.
 */

create table if not exists public.sync_log (
  id        integer primary key default 1,
  synced_at timestamptz not null default now(),
  /*
   * Hard constraint: only one row ever exists.
   * This is the only one, forever.
   */
  constraint sync_log_singleton check (id = 1)
);

insert into public.sync_log (id, synced_at)
values (1, now())
on conflict (id) do nothing;

/*
 * Row-level security: staff can read (for the Realtime subscription
 * to work the anon key must be able to SELECT), but only the
 * service-role key can write.
 */
alter table public.sync_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'sync_log' and policyname = 'sync_log_read'
  ) then
    create policy sync_log_read
      on public.sync_log for select
      using (true);
  end if;
end $$;

/*
 * Add to the realtime publication so subscribers receive the signal.
 *
 * The publication may not exist yet if enable-realtime.sql has not
 * been run; skip rather than error.
 */
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    alter publication supabase_realtime add table public.sync_log;
  end if;
end $$;
