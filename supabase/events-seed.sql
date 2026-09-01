-- V-TAPP events, aliases and coordinators.
--
-- Supersedes the first cut, which keyed `events` on the upstream
-- `event_id`. That only ever yields two rows -- 513 Merchandise and
-- 514 Events -- so assigning a coordinator to 514 would have handed
-- them all 495 registrations across every club.
--
-- The real unit is the ticket inside `product_meta`:
--   'V-TAPP 2026 Events - Date: ... - Ticket: Art Attack'
--                                             ^^^^^^^^^^
-- so `events.event_id` is now our own slug and `source_event_id`
-- keeps the upstream bucket.
--
-- Safe to re-run.

begin;

-- 1. Normalisation ---------------------------------------------------------

-- Case, punctuation and spacing all collapse, so 'AI Film Making',
-- 'AI filmmaking' and 'ai-filmmaking' are one key. This is what makes
-- matching survive inconsistent data entry.
create or replace function public.norm_event_name(txt text)
returns text
language sql
immutable
parallel safe
as $fn$
  select regexp_replace(
    lower(coalesce(txt, '')),
    '[^a-z0-9]+', '', 'g'
  );
$fn$;

-- 2. Reshape events --------------------------------------------------------

alter table public.events
  add column if not exists source_event_id text,
  add column if not exists day             text,
  add column if not exists venue           text;

comment on column public.events.event_id is
  'Our slug for one event, e.g. art-attack. Not the upstream V-TAPP id.';
comment on column public.events.source_event_id is
  'Upstream V-TAPP event_id: 513 merchandise, 514 events.';

-- The two placeholder rows from the first cut are replaced by the
-- real per-event rows below.
delete from public.event_coordinators where event_id in ('513', '514');
delete from public.events             where event_id in ('513', '514');

-- 3. Ticket aliases --------------------------------------------------------

create table if not exists public.event_aliases (
  ticket_norm text primary key,
  ticket_raw  text not null,
  event_id    text not null
    references public.events(event_id) on delete cascade
);

comment on table public.event_aliases is
  'Registration titles that do not normalise to their event name.';

commit;

-- 4. Seed events -----------------------------------------------------------

insert into public.events (event_id, name, source_event_id, day, venue) values
  ('art-attack', 'Art Attack', '514', 'D2', 'Sports Triangle'),
  ('binary-blast', 'Binary Blast', '514', 'D2', 'AB1 - 133'),
  ('bits-racer', 'Bits Racer', '514', 'D1', 'AB1 - G01'),
  ('code-colosseum', 'CODE COLOSSEUM', '514', 'D1', 'CB - G15'),
  ('digital-kingdom-chainquest', 'Digital Kingdom (ChainQuest)', '514', 'D1 + D2', 'AB1 - 137, 138'),
  ('escape-room-404', 'Escape Room 404', '514', 'D1', 'AB2-G19'),
  ('fintech-innovate-hackathon', 'FinTech Innovate Hackathon', '514', 'D2', 'CB - 323,324,325'),
  ('hackerrank-coding-challenge', 'HACKERRANK CODING CHALLENGE', '514', 'D1', 'CB - 114, 115, 116'),
  ('hybrid-electric-vehicle-simulation-model-making-competition', 'Hybrid Electric Vehicle Simulation Model Making Competition', '514', 'D1', 'CB - 101'),
  ('rc-rally-championship', 'RC Rally Championship', '514', 'D1 and D2', 'AB 2 - G17'),
  ('satellite-mission-masters-the-spacecraft-challenge', 'Satellite Mission Masters: The Spacecraft Challenge', '514', 'D1 and D2', 'AB 1 - 323, 324'),
  ('span-x', 'SPAN-X', '514', 'D1', 'CB - 108,109'),
  ('zero-mercy-the-last-one-standing', 'Zero Mercy : The Last One Standing', '514', 'D1 and D2', 'AB2 - 317,318,319'),
  ('quantum-coding-competition', 'Quantum Coding Competition', '514', 'D1', 'CB - 106'),
  ('harry-potter-the-triwizard-tournament', 'Harry Potter: The Triwizard Tournament', '514', 'D2', 'AB2 - 102'),
  ('the-bias-heist-crack-the-hidden-bias', 'The Bias Heist: Crack the Hidden Bias', '514', 'D2', 'CB - 225'),
  ('neural-web-the-ai-reflex-protocol', 'Neural Web: The AI Reflex Protocol', '514', 'D2', 'CB - 230,231'),
  ('treasure-hunt', 'Treasure Hunt', '514', 'D1', 'open space'),
  ('vcipher-treasure-hunt', 'VCIPHER (Treasure Hunt)', '514', 'D2', 'OPEN SPACE'),
  ('cipher-to-citizen', 'Cipher to Citizen', '514', 'D1 + D2', 'CB-113'),
  ('vit-ap-full-throttle', 'VIT-AP Full Throttle', '514', 'D1  & D2(emergency)', 'Open Space (Ground)'),
  ('the-perfect-heist', 'The Perfect Heist', '514', 'D2', 'CB - 219, 220'),
  ('electronic-autopsy', 'Electronic Autopsy', '514', 'D1 + D2', 'CB - 213,214,215'),
  ('the-doomsday-algorithm-mcu-data-prediction-league', 'The Doomsday Algorithm: MCU Data Prediction League', '514', 'D1', 'CB - 121,122'),
  ('big-boss-the-ultimate-quest', 'Big Boss : The Ultimate Quest', '514', 'D1+D2', 'CB – 217'),
  ('kbc-kaun-banega-codepathi', 'KBC (Kaun Banega Codepathi)', '514', 'D1 + D2', 'AB1 - G04 & CB - G13'),
  ('circuit-x', 'Circuit X', '514', 'D2', 'AB2 - 118'),
  ('build-it-back', 'Build it Back', '514', 'D1', 'CB - 107'),
  ('setu-last-mile-connectivity-challenge', 'SETU-Last Mile Connectivity Challenge', '514', 'D2', 'AB2 - 212'),
  ('tech-escape-quest', 'Tech Escape Quest', '514', 'D2', 'AB1 - 303, 304'),
  ('nexus-ascend-beyond-the-binary', 'Nexus Ascend: Beyond the Binary', '514', 'D2', 'CB - G12'),
  ('neural-gauntlet', 'NEURAL GAUNTLET', '514', 'D2', 'AB1 - 119'),
  ('brain-rot-battle', 'Brain Rot Battle', '514', 'D2', 'CB - G14'),
  ('alice-in-hackerland', 'Alice in Hackerland', '514', 'D1+D2', 'AB2 -214,215,216'),
  ('break-the-system-aibpt-club', 'BREAK THE SYSTEM (AIBPT club)', '514', 'D2', 'CB - 109'),
  ('crack-a-doc', 'Crack -A-Doc', '514', 'D2', 'AB1 - G01'),
  ('3d-workshop', '3D Workshop', '514', 'D1 + D2', 'AB1 - Mech Workshop'),
  ('mathauction', 'MathAuction', '514', 'D1 + D2', 'CB - 118'),
  ('codeathon', 'CodeAthon', '514', 'D1 + D2', 'CB - 201'),
  ('google-challenge-arena', 'Google Challenge Arena', '514', 'D1 + D2', 'AB2 - 111, 112'),
  ('bounce-and-score', 'Bounce and Score', '514', 'D1 + D2', 'BasketBall Court'),
  ('vr-zone', 'VR Zone', '514', 'D1 + D2', 'AB1 - 101'),
  ('glow-in-the-dark', 'Glow in the Dark', '514', 'D1 + D2', 'CB G16'),
  ('speed-circuit', 'Speed Circuit', '514', 'D1 + D2', 'CB - G17'),
  ('men-and-menstrual-mystery', 'Men and Menstrual Mystery', '514', 'D1+D2', 'CB Portico'),
  ('interstellar-a-journey-beyond-limits', 'Interstellar: A Journey Beyond Limits', '514', 'D2', 'Auditorium'),
  ('monster-energy-drink-campus-unleashed', 'Monster Energy Drink Campus Unleashed', '514', 'D2', 'AB1 - 301,302'),
  ('free-fire-classic-royale', 'Free fire classic royale', '514', 'D2', 'AB1 - 134'),
  ('codm-unleashed', 'CODM Unleashed', '514', 'D1 + D2', 'AB1 - 135'),
  ('minecraft-bedwars', 'Minecraft Bedwars', '514', 'D2', 'AB1 - GO3'),
  ('stranger-things-can-you-escape-vecna-s-mind', 'Stranger Things: Can you escape Vecna''s Mind?', '514', 'D1+D2', 'AB 2 - 105'),
  ('2898-a-d-the-final-drop', '2898 A.D – The Final Drop', '514', 'D1 + D2', 'AB1 - G10'),
  ('gauntlet-breakout-challenge', 'Gauntlet Breakout Challenge', '514', 'D1 + D2', 'AB2 - 218'),
  ('swiss-chess', 'Swiss Chess', '514', 'D2', 'CB - 106'),
  ('orbital-guard', 'Orbital Guard', '514', 'D1', 'CB - G13'),
  ('pitch-please-ideathon', 'pitch please (ideathon)', '514', 'D1', 'AB1 133 & 134'),
  ('civictech-challenge', 'CivicTech Challenge', '514', 'D1 + D2', 'CB - 110, 111'),
  ('quest-a-thon', 'Quest -A- Thon', '514', 'D1 + D2', 'AB1 – 414, 415, 416 & 417'),
  ('the-ai-odyssey-from-prompt-to-product', 'The AI Odyssey: From prompt to product', '514', 'D2', 'CB - 314,315'),
  ('smart-india-agrimonitor-matlab-hackathon', 'Smart India AgriMonitor: MATLAB Hackathon', '514', 'D2', 'CB - 101'),
  ('engineering-challenge', 'Engineering Challenge', '514', 'D1 + D2', 'CB - 119,120'),
  ('ieee-component-bazar', 'IEEE Component Bazar', '514', 'D1', 'CB-219,220'),
  ('sih', 'SIH', '514', 'D1', 'CB - 305, 405, 409, 414,416, 417,419'),
  ('vit-ap-s-what-if', 'VIT AP''s WHAT IF??', '514', 'D2', 'CB – G18'),
  ('startup-survivor-the-business-model-gauntlet', 'Startup Survivor : The Business Model Gauntlet', '514', 'D1', 'CB - G12'),
  ('shark-tank-vit-ap', 'Shark Tank VIT-AP', '514', 'D2', 'CB - G13'),
  ('mastering-uncertainty-unlocking-the-quantum-world', 'Mastering Uncertainty: Unlocking the Quantum World', '514', 'D1', 'CB - G14'),
  ('build-a-rover', 'Build-A-Rover', '514', 'D2', 'CB - 108'),
  ('bridging-the-gap-between-engineering-education-and-modern-in', 'Bridging the gap between engineering education and modern industry', '514', 'D1', 'CB - G18'),
  ('drone-workshop-and-inagural-event-by-bharat-electronics', 'Drone Workshop and Inagural Event (By Bharat Electronics)', '514', 'D1', 'Auditorium'),
  ('communication-system-modeling-with-matlab-simulink', 'Communication System Modeling with MATLAB & SIMULINK', '514', 'D1', 'AB2 - 301'),
  ('noisebusters-beat-the-noise-with-ai-a-hands-on-live-demo', 'NoiseBusters: Beat the Noise with AI — A Hands-On Live Demo', '514', 'D2', 'AB2 - 301'),
  ('beyond-the-noise-ai-powered-speech-enhancement-experience-it', 'Beyond the Noise: AI-Powered Speech Enhancement — Experience It Live', '514', 'D1', 'CB - G11'),
  ('make-your-own-game', 'Make Your Own Game', '514', 'D2', 'AB2 101'),
  ('make-your-own-perfume', 'Make Your Own Perfume', '514', 'D2', 'AB2 - G19'),
  ('jugaad-exe-tech-expo', 'Jugaad.exe (Tech Expo)', '514', 'D2', 'AB1 - G02'),
  ('hands-on-red-team-blue-team-cybersecurity-workshop', 'Hands on Red Team & Blue Team Cybersecurity Workshop', '514', 'D2', 'AB2 - 306'),
  ('zero-day', 'Zero Day', '514', 'D1', 'AB2 - 212'),
  ('hands-on-workshop-on-ai-and-cyber-security', 'Hands on Workshop on AI and Cyber Security', '514', 'D1+D2', 'CB- 301,302'),
  ('sustainx', 'SustainX', '514', 'D1+D2', 'CB- 316, 317'),
  ('pokemine-rush', 'Pokemine rush', '514', 'D1', 'AB 1- G11'),
  ('pwngrounds', 'PWNGrounds', '514', 'D1+D2', 'CB -102'),
  ('content-creation-workshop', 'Content Creation Workshop', '514', 'D2', 'Auditorium'),
  ('creating-website-using-claude', 'Creating website using Claude', '514', 'D1', 'Einstein Hall'),
  ('building-android-app-using-claude', 'Building android app using Claude', '514', 'D1', 'Einstein Hall'),
  ('ai-filmmaking', 'AI filmmaking', '514', 'D1', 'Einstein Hall'),
  ('multi-agent-system-designing-teams-of-ai-agent', 'Multi agent system: Designing teams of AI agent', '514', 'D2', 'CB-319'),
  ('reverse-engineer-what-did-they-build', 'REVERSE ENGINEER — WHAT DID THEY BUILD?', '514', 'Day 1', 'CB-202'),
  ('tech-auction-bid-build-survive', 'TECH AUCTION — BID. BUILD. SURVIVE.', '514', 'Day 2', 'CB-202')
on conflict (event_id) do update
  set name  = excluded.name,
      day   = excluded.day,
      venue = excluded.venue
  where public.events.name_locked is not true;

-- Merchandise is a single event; its tickets are garment combos, not
-- separate things to coordinate.
insert into public.events (event_id, name, source_event_id)
values ('merchandise', 'V-TAPP Merchandise', '513')
on conflict (event_id) do nothing;

-- 5. Seed aliases ----------------------------------------------------------

insert into public.event_aliases (ticket_norm, ticket_raw, event_id)
select public.norm_event_name(v.raw), v.raw, v.slug
from (values
  ('HACKER RANKER CODING CHALLENGE', 'hackerrank-coding-challenge'),
  ('Harry Potter Triwizard', 'harry-potter-the-triwizard-tournament'),
  ('orbital guard:open nasa/isro saatellite data Hackathon', 'orbital-guard'),
  ('IEEE Component bazaar', 'ieee-component-bazar'),
  ('Zero Mercy : The Last One', 'zero-mercy-the-last-one-standing'),
  ('Brain Rot Battles', 'brain-rot-battle'),
  ('Interstellar Movie Screening', 'interstellar-a-journey-beyond-limits'),
  ('escape room-11th and 12th september', 'escape-room-404'),
  ('hands on rover building workshop', 'build-a-rover'),
  ('Racing Cockpit', 'speed-circuit')
) as v(raw, slug)
on conflict (ticket_norm) do update
  set event_id = excluded.event_id,
      ticket_raw = excluded.ticket_raw;

-- 6. Coordinators --------------------------------------------------------

-- Deliberately absent. The assignments are real student and faculty
-- email addresses, so they live in a gitignored local file rather
-- than in this repository. See supabase/local/coordinators.local.sql,
-- or add them through /admin/coordinators.

-- 7. Resolve a registration to an event ------------------------------------

-- Alias first, then a normalised name match, else null (unmapped).
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
      (select a.event_id from public.event_aliases a
        where a.ticket_norm = public.norm_event_name(t.ticket)),
      (select e.event_id from public.events e
        where public.norm_event_name(e.name)
            = public.norm_event_name(t.ticket))
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

-- 8. Aggregates ------------------------------------------------------------

create or replace function public.event_summaries()
returns json
language sql
stable
parallel safe
as $fn$
with resolved as (
  select
    public.resolve_event(r.event_id::text, r.product_meta) as event_id,
    r.email,
    coalesce(r.total, 0) as amount,
    r.id,
    r.created_at
  from public.registrations r
),
per_event as (
  select
    event_id,
    count(*)              as registrations,
    count(distinct email) as participants,
    sum(amount)           as revenue,
    max(created_at)       as last_registration,
    count(*) filter (
      where exists (select 1 from public.qr_scans q where q.registration_id = resolved.id)
    ) as scanned
  from resolved
  where event_id is not null
  group by event_id
)
select coalesce(
  json_agg(
    json_build_object(
      'event_id',      e.event_id,
      'name',          e.name,
      'event_date',    e.day,
      'venue',         e.venue,
      'registrations', coalesce(p.registrations, 0),
      'participants',  coalesce(p.participants, 0),
      'revenue',       coalesce(p.revenue, 0),
      'scanned',       coalesce(p.scanned, 0),
      'lastRegistration', p.last_registration
    )
    order by coalesce(p.registrations, 0) desc, e.name
  ),
  '[]'::json
)
from public.events e
left join per_event p on p.event_id = e.event_id;
$fn$;

create or replace function public.event_attendees(p_event_id text)
returns json
language sql
stable
parallel safe
as $fn$
select coalesce(
  json_agg(
    json_build_object(
      'registration_id', r.registration_id,
      'name',            r.name,
      'email',           r.email,
      'scanned',         exists (
        select 1 from public.qr_scans q where q.registration_id = r.id
      )
    )
    order by r.name
  ),
  '[]'::json
)
from public.registrations r
where public.resolve_event(r.event_id::text, r.product_meta) = p_event_id;
$fn$;

-- Registrations whose title matches no event, so they can be fixed.
create or replace function public.unmapped_tickets()
returns json
language sql
stable
parallel safe
as $fn$
select coalesce(
  json_agg(json_build_object('ticket', ticket, 'registrations', n)
           order by n desc),
  '[]'::json
)
from (
  select
    btrim(split_part(
      coalesce((regexp_match(coalesce(product_meta,''),'Ticket:\s*(.*)$','i'))[1],''),
      ' - Date:', 1
    )) as ticket,
    count(*) as n
  from public.registrations
  where public.resolve_event(event_id::text, product_meta) is null
  group by 1
) x;
$fn$;

revoke all on function public.event_summaries()        from public;
revoke all on function public.event_attendees(text)    from public;
revoke all on function public.unmapped_tickets()       from public;
revoke all on function public.resolve_event(text,text) from public;
grant execute on function public.event_summaries()        to service_role;
grant execute on function public.event_attendees(text)    to service_role;
grant execute on function public.unmapped_tickets()       to service_role;
grant execute on function public.resolve_event(text,text) to service_role;

-- Verify:
--   select public.event_summaries();
--   select public.unmapped_tickets();
--   select count(*) from public.events;
--   select count(*) from public.event_coordinators;
