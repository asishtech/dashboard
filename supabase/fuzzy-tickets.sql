-- A ticket that is nearly an event's name.
--
-- Safe to re-run. Run after supabase/merge-dance-into-glow.sql.
--
-- The portal sells "BREAK THE SYSTEM"; the event is called "BREAK THE
-- SYSTEM (AIBPT club)". Normalising both to letters and digits still
-- leaves breakthesystem against breakthesystemaibptclub, so the
-- resolver missed and the registration belonged to no event.
--
-- The fix is a third attempt, after the two exact ones: an event
-- whose name contains the ticket, or a ticket that contains the
-- event's name -- and ONLY when exactly one event qualifies.
--
-- Deliberately not a similarity score. Trigram similarity was tried
-- on college names and had no workable threshold: 0.44 had to merge
-- and 0.66 had to not. Containment is a different kind of rule --
-- it either holds or it does not, and when two events both qualify
-- this returns nothing rather than guessing. There is exactly one
-- such pair in the data today ("VCIPHER (Treasure Hunt)" contains
-- "Treasure Hunt"), and both of those resolve by exact name long
-- before this branch is reached.
--
-- Six characters minimum on both sides. Short names collide with
-- anything: "SIH" as a substring would start matching sentences.

create or replace function public.resolve_event(
  p_event_id text,
  p_product_meta text
)
returns text
language sql
stable
parallel safe
as $fn$
  select case
    when p_event_id = '513' then 'merchandise'
    else coalesce(
      /* 1. A spelling somebody has already mapped by hand. */
      (select a.event_id from public.event_aliases a
        where a.ticket_norm = public.norm_event_name(t.ticket)),

      /* 2. The event's own name. */
      (select e.event_id from public.events e
        where public.norm_event_name(e.name)
            = public.norm_event_name(t.ticket)),

      /* 3. One event, and only one, whose name contains the ticket
            or is contained by it. count() = 1 is the whole safety
            argument: ambiguity resolves to null, which leaves the
            registration unmatched and visible on the events page
            rather than silently filed under a guess. */
      (select case when count(*) = 1 then min(e.event_id) end
         from public.events e
        where length(public.norm_event_name(t.ticket)) >= 6
          and length(public.norm_event_name(e.name)) >= 6
          and (
            public.norm_event_name(e.name)
              like '%' || public.norm_event_name(t.ticket) || '%'
            or public.norm_event_name(t.ticket)
              like '%' || public.norm_event_name(e.name) || '%'
          ))
    )
  end
  from (
    select btrim(split_part(
      coalesce(
        (regexp_match(coalesce(p_product_meta, ''), 'Ticket:\s*(.*)$', 'i'))[1],
        ''
      ),
      ' - Date:', 1
    )) as ticket
  ) t;
$fn$;

-- Every spelling the portal has sold under ---------------------------------

/*
 * One row per distinct ticket text, with how many registrations carry
 * it and where it lands. `matched_by` is the interesting column: two
 * spellings landing on one event by different routes is how a
 * duplicate event gets noticed before somebody counts the room.
 */
create or replace function public.ticket_spellings()
returns json
language sql
stable
as $fn$
/*
 * The normalised form is computed in a CTE rather than inline.
 * Postgres will not match a grouped *expression* referenced from
 * inside a subquery -- only a grouped column -- so the exists()
 * tests below need it to already be a column.
 */
with spelled as (
  select
    coalesce(nullif(btrim(r.ticket), ''), '(no ticket)') as ticket,
    public.norm_event_name(r.ticket)                     as ticket_norm,
    r.resolved_event_id                                  as event_id
  from public.registrations r
)
select coalesce(
  json_agg(row_to_json(x) order by x.registrations desc, x.ticket),
  '[]'::json
)
from (
  select
    s.ticket,
    count(*)      as registrations,
    s.event_id,
    max(e.name)   as event_name,
    case
      when s.event_id is null then 'none'
      /* Merchandise is decided by the upstream bucket (513) before
         any name is looked at, so every garment would otherwise be
         reported as a near miss. */
      when s.event_id = 'merchandise' then 'merchandise'
      when exists (
        select 1 from public.event_aliases a
        where a.ticket_norm = s.ticket_norm
      ) then 'alias'
      when exists (
        select 1 from public.events x
        where x.event_id = s.event_id
          and public.norm_event_name(x.name) = s.ticket_norm
      ) then 'name'
      else 'nearly'
    end           as matched_by
  from spelled s
  left join public.events e on e.event_id = s.event_id
  group by s.ticket, s.ticket_norm, s.event_id
) x;
$fn$;

revoke all on function public.ticket_spellings() from public;
grant execute on function public.ticket_spellings() to service_role;

-- Apply it to the rows already stored --------------------------------------

select public.rebuild_resolved_events();

-- Verify -------------------------------------------------------------------

-- Expect zero rows.
select ticket, count(*)
from public.registrations
where resolved_event_id is null
group by ticket;

-- Expect "BREAK THE SYSTEM" -> BREAK THE SYSTEM (AIBPT club), nearly.
select * from json_to_recordset(public.ticket_spellings())
  as t(ticket text, registrations int, event_name text, matched_by text)
where matched_by <> 'name'
order by registrations desc;
