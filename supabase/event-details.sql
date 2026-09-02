-- Event details from the organisers' master sheet.
--
-- Safe to re-run. Schema only: the values live in
-- supabase/local/event-details.local.sql, which is gitignored because
-- it carries coordinators' names and phone numbers.
--
-- Until now `events` held a name, a day and a venue. Everything else an
-- organiser needs -- what kind of event it is, when it runs, what it
-- costs to enter, whether it is a team entry, what it needs from
-- logistics -- lived only in a spreadsheet.

begin;

alter table public.events
  add column if not exists event_type       text,
  add column if not exists time_slot        text,
  add column if not exists team_size        text,
  add column if not exists registration_fee integer,
  add column if not exists prize_pool       text,
  add column if not exists budget           text,
  add column if not exists logistics        text,
  add column if not exists external_guest   boolean,
  add column if not exists certificates     text,
  add column if not exists description      text;

comment on column public.events.registration_fee is
  'Entry fee in rupees, parsed from "100/-". 0 means free. NULL means the sheet did not say.';

/*
 * `certificates` stays text on purpose. The sheet answers two different
 * questions in that one column -- sometimes a count ("12"), sometimes
 * whether any are given at all ("no") -- and coercing both into a
 * number would turn "no certificates" into "zero certificates
 * ordered", which reads the same and means something else.
 */
comment on column public.events.certificates is
  'As written by the organisers: sometimes a count, sometimes yes/no.';

/*
 * `budget` and `prize_pool` likewise stay text: several carry notes
 * rather than a figure, and rounding those into a number would quietly
 * discard the note.
 */

commit;

-- Pricing, from the sheet rather than inferred ----------------------------

-- events.pricing was derived from whether any registration had a
-- non-zero total, which cannot tell a free event from one that has not
-- sold yet. The sheet states the fee outright, so it wins.
update public.events
   set pricing = case
                   when registration_fee = 0 then 'free'
                   when registration_fee > 0 then 'paid'
                   else pricing
                 end
 where registration_fee is not null;

-- Day, written four ways -------------------------------------------------

-- 'D1', 'D1+D2', 'D1 and D2', 'Day 1'. Grouping by day otherwise splits
-- one day into several, and the events list sorts them apart.
update public.events
   set day = case
               when day ~* 'd(ay)?\s*1' and day ~* 'd(ay)?\s*2'
                 then 'D1 + D2'
               when day ~* 'd(ay)?\s*1' then 'D1'
               when day ~* 'd(ay)?\s*2' then 'D2'
               else day
             end
 where day is not null;

-- Coordinator phone numbers -----------------------------------------------

-- Requires supabase/coordinator-details.sql for the columns; the values
-- come with the local seed.

-- Verify:
--   select event_id, event_type, registration_fee, pricing, time_slot
--     from public.events where registration_fee is not null limit 10;
--   select count(*) from public.events where registration_fee is null;
--   select count(*) from public.event_coordinators where phone is not null;
