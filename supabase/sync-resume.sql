-- Somewhere to put the feed while the sync works through it.
--
-- Safe to re-run.
--
-- The events portal answers /events/api/vtapp with every registration
-- it has -- 4,287 of them, 2.5 MB -- and ignores every pagination
-- parameter tried against it: limit, per_page, page, offset,
-- page_size, start/count and updated_after all return the same full
-- payload. It takes between 7 and 17 seconds depending on the minute.
--
-- The function serving /api/sync is killed at thirty seconds, so as
-- the fest filled the fetch plus the writes stopped fitting and the
-- button started returning 504. Nothing can make one request reliably
-- do all of it, because the slowest part is not ours to speed up.
--
-- So the fetch happens once and lands here, and the writing is done
-- in as many passes as it takes, each one bounded by its own
-- deadline. A pass that runs out of time returns how many rows are
-- left and the browser presses again. Nothing is lost between
-- passes, and no single request has to be quick.

begin;

create table if not exists public.sync_payload (
  /* One row, forever. */
  id         int primary key default 1 check (id = 1),

  payload    jsonb not null,
  records    int not null default 0,
  fetched_at timestamptz not null default now()
);

alter table public.sync_payload enable row level security;

comment on table public.sync_payload is
  'The last upstream V-TAPP response, held so a resumable sync does not refetch 2.5 MB per pass.';

commit;

-- Verify:
--   select records, fetched_at, pg_size_pretty(pg_column_size(payload)::bigint)
--   from public.sync_payload;
