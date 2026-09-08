-- Which volunteer may scan what.
--
-- Safe to re-run.
--
-- Until now a volunteer could scan every pass at the festival: the
-- one at the merchandise counter could admit somebody to Art Attack,
-- and the one on Art Attack's door could hand out a hoodie. Nobody
-- did, but "nobody did" is not a permission model, and a volunteer is
-- a student with a phone who was handed the link an hour ago.
--
-- Two kinds fall out of one table rather than a new column:
--
--   event volunteer -- rows naming the events they work
--   merch volunteer -- one row naming the merchandise event
--
-- Merchandise is already a row in `events` (events-seed.sql inserts
-- it so a hoodie order has something to resolve to), so "may scan
-- merch" is the same shape as "may scan Art Attack" and needs no
-- second mechanism.
--
-- No rows at all means no restriction. That is deliberate: this file
-- landing mid-fest must not lock out every volunteer already
-- scanning. Scope is something an admin adds, not something they have
-- to remember to add.

begin;

create table if not exists public.event_volunteers (
  email      text not null,
  event_id   text not null
    references public.events(event_id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by text,

  primary key (email, event_id)
);

/* Lower-cased on the way in, the same as event_coordinators: Google
   hands back whatever case the invitation was typed in, and a scope
   that misses because of a capital letter fails open. */
create or replace function public.normalize_volunteer_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end;
$$;

drop trigger if exists event_volunteers_normalize on public.event_volunteers;

create trigger event_volunteers_normalize
  before insert or update on public.event_volunteers
  for each row execute function public.normalize_volunteer_email();

create index if not exists event_volunteers_email_idx
  on public.event_volunteers (email);

alter table public.event_volunteers enable row level security;

comment on table public.event_volunteers is
  'Events a volunteer may scan. No rows for an address means no restriction.';

commit;

-- Verify:
--   select email, event_id from public.event_volunteers order by email;
--
-- To make somebody a merchandise-only volunteer:
--   insert into public.event_volunteers (email, event_id)
--   values ('someone@vitapstudent.ac.in', 'merchandise')
--   on conflict do nothing;
--
-- To scope somebody to two events:
--   insert into public.event_volunteers (email, event_id)
--   values ('someone@vitapstudent.ac.in', 'art-attack'),
--          ('someone@vitapstudent.ac.in', 'treasure-hunt')
--   on conflict do nothing;
