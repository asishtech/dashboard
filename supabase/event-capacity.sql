-- Expected participants per event, from the organisers' sheet.
--
-- Safe to re-run.
--
-- Run after:
--   supabase/events-seed.sql
--   supabase/event-details.sql
--   supabase/resolve-once.sql      <- defines event_summaries(); this
--                                     file redefines it, so if you ever
--                                     re-run that one, re-run this after.
--
-- This is the events counterpart to `inventory`: merchandise already
-- knew how many caps existed and could therefore say how many were
-- left. Events knew only how many people had registered, with nothing
-- to measure that against, so nobody could see a hall filling up until
-- it was full.

begin;

alter table public.events
  add column if not exists capacity      integer,
  add column if not exists capacity_note text;

/*
 * A hall cannot seat a negative number of people, and a zero cap is
 * meaningful (an event closed to further registration), so the floor
 * is 0 rather than 1.
 */
do $$
begin
  alter table public.events
    add constraint events_capacity_non_negative
    check (capacity is null or capacity >= 0);
exception
  when duplicate_object then null;
end
$$;

comment on column public.events.capacity is
  'Seats to plan against. NULL means the sheet did not say -- which is not the same as zero, and must not be drawn as a full bar.';

/*
 * The sheet answers this question in more than one way. Most rows give
 * a number, nineteen do not: ranges ('60-120'), a range counted in
 * something else ('15-20 teams'), and 'NA'.
 *
 * `capacity` takes the upper bound, because that is the point at which
 * you stop admitting people -- planning against the lower bound would
 * show an event as overfull while seats remained. The original text is
 * kept beside it so nobody reads 20 as twenty people when the sheet
 * meant twenty teams.
 */
comment on column public.events.capacity_note is
  'The sheet as written, where it did not give a plain number.';

commit;

-- Values ------------------------------------------------------------------

-- Matched to event_id by slugifying the sheet's event name. All 89 rows
-- matched; only `beyond-the-noise-...` needed pinning by hand, because
-- its event_id was truncated when the events table was seeded.
update public.events e
   set capacity      = v.capacity,
       capacity_note = v.note
  from (values
  ('2898-a-d-the-final-drop'::text, 100::integer, null::text),  -- 2898 A.D – The Final Drop
  ('3d-workshop', null, 'Not stated'),  -- 3D Workshop
  ('ai-filmmaking', 100, null),  -- AI filmmaking
  ('alice-in-hackerland', 150, null),  -- Alice in Hackerland
  ('art-attack', 200, null),  -- Art Attack
  ('beyond-the-noise-ai-powered-speech-enhancement-experience-it', 40, null),  -- Beyond the Noise: AI-Powered Speech Enhancement — Experience It Live
  ('big-boss-the-ultimate-quest', 400, '350-400'),  -- Big Boss : The Ultimate Quest
  ('binary-blast', 50, null),  -- Binary Blast
  ('bits-racer', 200, null),  -- Bits Racer
  ('bounce-and-score', 250, null),  -- Bounce and Score
  ('brain-rot-battle', 100, null),  -- Brain Rot Battle
  ('break-the-system-aibpt-club', 100, null),  -- BREAK THE SYSTEM (AIBPT club)
  ('bridging-the-gap-between-engineering-education-and-modern-in', 150, null),  -- Bridging the gap between engineering education and modern industry
  ('build-a-rover', 100, null),  -- Build-A-Rover
  ('build-it-back', 120, null),  -- Build it Back
  ('building-android-app-using-claude', 100, null),  -- Building android app using Claude
  ('cipher-to-citizen', 100, null),  -- Cipher to Citizen
  ('circuit-x', 60, null),  -- Circuit X
  ('civictech-challenge', 100, null),  -- CivicTech Challenge
  ('code-colosseum', 150, null),  -- CODE COLOSSEUM
  ('codeathon', 100, null),  -- CodeAthon
  ('codm-unleashed', 150, null),  -- CODM Unleashed
  ('communication-system-modeling-with-matlab-simulink', 20, null),  -- Communication System Modeling with MATLAB & SIMULINK
  ('content-creation-workshop', 400, null),  -- Content Creation Workshop
  ('crack-a-doc', 50, null),  -- Crack -A-Doc
  ('creating-website-using-claude', 100, null),  -- Creating website using Claude
  ('digital-kingdom-chainquest', 150, null),  -- Digital Kingdom (ChainQuest)
  ('drone-workshop-and-inagural-event-by-bharat-electronics', null, 'Not stated'),  -- Drone Workshop and Inagural Event (By Bharat Electronics)
  ('electronic-autopsy', 200, null),  -- Electronic Autopsy
  ('engineering-challenge', 200, null),  -- Engineering Challenge
  ('escape-room-404', 150, null),  -- Escape Room 404
  ('fintech-innovate-hackathon', 200, null),  -- FinTech Innovate Hackathon
  ('free-fire-classic-royale', 160, null),  -- Free fire classic royale
  ('gauntlet-breakout-challenge', 180, null),  -- Gauntlet Breakout Challenge
  ('glow-in-the-dark', 150, null),  -- Glow in the Dark
  ('google-challenge-arena', 500, null),  -- Google Challenge Arena
  ('hackerrank-coding-challenge', 200, null),  -- HACKERRANK CODING CHALLENGE
  ('hands-on-red-team-blue-team-cybersecurity-workshop', 100, null),  -- Hands on Red Team & Blue Team Cybersecurity Workshop
  ('hands-on-workshop-on-ai-and-cyber-security', null, 'Not stated'),  -- Hands on Workshop on AI and Cyber Security
  ('harry-potter-the-triwizard-tournament', 120, '60-120'),  -- Harry Potter: The Triwizard Tournament
  ('hybrid-electric-vehicle-simulation-model-making-competition', 50, '25-50'),  -- Hybrid Electric Vehicle Simulation Model Making Competition
  ('ieee-component-bazar', 150, null),  -- IEEE Component Bazar
  ('interstellar-a-journey-beyond-limits', 210, null),  -- Interstellar: A Journey Beyond Limits
  ('jugaad-exe-tech-expo', 100, null),  -- Jugaad.exe (Tech Expo)
  ('kbc-kaun-banega-codepathi', 100, null),  -- KBC (Kaun Banega Codepathi)
  ('make-your-own-game', 100, null),  -- Make Your Own Game
  ('make-your-own-perfume', 100, null),  -- Make Your Own Perfume
  ('mastering-uncertainty-unlocking-the-quantum-world', 80, null),  -- Mastering Uncertainty: Unlocking the Quantum World
  ('mathauction', 100, null),  -- MathAuction
  ('men-and-menstrual-mystery', 250, null),  -- Men and Menstrual Mystery
  ('minecraft-bedwars', 60, null),  -- Minecraft Bedwars
  ('monster-energy-drink-campus-unleashed', 300, null),  -- Monster Energy Drink Campus Unleashed
  ('multi-agent-system-designing-teams-of-ai-agent', null, 'Not stated'),  -- Multi agent system: Designing teams of AI agent
  ('neural-gauntlet', 120, '60-120'),  -- NEURAL GAUNTLET
  ('neural-web-the-ai-reflex-protocol', 120, '100-120'),  -- Neural Web: The AI Reflex Protocol
  ('nexus-ascend-beyond-the-binary', 120, '100-120'),  -- Nexus Ascend: Beyond the Binary
  ('noisebusters-beat-the-noise-with-ai-a-hands-on-live-demo', 40, null),  -- NoiseBusters: Beat the Noise with AI — A Hands-On Live Demo
  ('orbital-guard', 160, null),  -- Orbital Guard
  ('pitch-please-ideathon', 100, null),  -- pitch please (ideathon)
  ('pokemine-rush', 200, null),  -- Pokemine rush
  ('pwngrounds', 120, '80-120'),  -- PWNGrounds
  ('quantum-coding-competition', 30, null),  -- Quantum Coding Competition
  ('quest-a-thon', 700, '500-700'),  -- Quest -A- Thon
  ('rc-rally-championship', 160, null),  -- RC Rally Championship
  ('reverse-engineer-what-did-they-build', null, 'Not stated'),  -- REVERSE ENGINEER — WHAT DID THEY BUILD?
  ('satellite-mission-masters-the-spacecraft-challenge', 250, null),  -- Satellite Mission Masters: The Spacecraft Challenge
  ('setu-last-mile-connectivity-challenge', 100, '60-100'),  -- SETU-Last Mile Connectivity Challenge
  ('shark-tank-vit-ap', 50, null),  -- Shark Tank VIT-AP
  ('sih', 1800, null),  -- SIH
  ('smart-india-agrimonitor-matlab-hackathon', 20, null),  -- Smart India AgriMonitor: MATLAB Hackathon
  ('span-x', 75, null),  -- SPAN-X
  ('speed-circuit', 220, null),  -- Speed Circuit
  ('startup-survivor-the-business-model-gauntlet', 100, null),  -- Startup Survivor : The Business Model Gauntlet
  ('stranger-things-can-you-escape-vecna-s-mind', 100, null),  -- Stranger Things: Can you escape Vecna's Mind?
  ('sustainx', 200, null),  -- SustainX
  ('swiss-chess', null, 'Not stated'),  -- Swiss Chess
  ('tech-auction-bid-build-survive', null, 'Not stated'),  -- TECH AUCTION — BID. BUILD. SURVIVE.
  ('tech-escape-quest', 60, null),  -- Tech Escape Quest
  ('the-ai-odyssey-from-prompt-to-product', 200, null),  -- The AI Odyssey: From prompt to product
  ('the-bias-heist-crack-the-hidden-bias', 200, null),  -- The Bias Heist: Crack the Hidden Bias
  ('the-doomsday-algorithm-mcu-data-prediction-league', 150, null),  -- The Doomsday Algorithm: MCU Data Prediction League
  ('the-perfect-heist', 200, '150-200'),  -- The Perfect Heist
  ('treasure-hunt', 300, null),  -- Treasure Hunt
  ('vcipher-treasure-hunt', 300, null),  -- VCIPHER (Treasure Hunt)
  ('vit-ap-full-throttle', 20, '15-20 teams'),  -- VIT-AP Full Throttle
  ('vit-ap-s-what-if', null, 'Not stated'),  -- VIT AP's WHAT IF??
  ('vr-zone', 300, null),  -- VR Zone
  ('zero-day', 200, null),  -- Zero Day
  ('zero-mercy-the-last-one-standing', 250, null)  -- Zero Mercy : The Last One Standing
) as v(event_id, capacity, note)
 where e.event_id = v.event_id;

-- event_summaries(), now measuring registrations against the cap ----------

-- Identical to the definition in supabase/resolve-once.sql apart from
-- the three capacity fields at the end. Kept whole rather than patched,
-- because a function cannot be altered in place.
create or replace function public.event_summaries()
returns json
language sql
stable
parallel safe
as $fn$
with per_event as (
  select
    r.resolved_event_id as event_id,
    count(*)                    as registrations,
    count(distinct r.email)     as participants,
    sum(coalesce(r.total, 0))   as revenue,
    max(r.created_at)           as last_registration,

    count(*) filter (where coalesce(r.total, 0) > 0)  as paid_registrations,
    count(*) filter (where coalesce(r.total, 0) <= 0) as free_registrations,

    count(*) filter (where o.origin = 'external') as external_registrations,
    count(*) filter (where o.origin = 'internal') as internal_registrations,
    count(*) filter (where o.origin = 'unknown')  as unknown_registrations,
    count(distinct r.email) filter (where o.origin = 'external')
      as external_participants,

    /*
     * A left join, not a correlated exists per row. Same answer, one
     * pass over an indexed column instead of 1062 index probes.
     */
    count(q.registration_id) as scanned
  from public.registrations r
  cross join lateral (
    select public.registration_origin(
             r.email,
             public.registration_university(r.raw_data::jsonb)
           ) as origin
  ) o
  left join public.qr_scans q on q.registration_id = r.id
  where r.resolved_event_id is not null
  group by r.resolved_event_id
)
select coalesce(
  json_agg(
    json_build_object(
      'event_id',      e.event_id,
      'name',          e.name,
      'event_date',    e.day,
      'venue',         e.venue,
      'pricing',       e.pricing,
      'registrations', coalesce(p.registrations, 0),
      'participants',  coalesce(p.participants, 0),
      'revenue',       coalesce(p.revenue, 0),
      'paidRegistrations', coalesce(p.paid_registrations, 0),
      'freeRegistrations', coalesce(p.free_registrations, 0),
      'externalRegistrations', coalesce(p.external_registrations, 0),
      'internalRegistrations', coalesce(p.internal_registrations, 0),
      'unknownRegistrations',  coalesce(p.unknown_registrations, 0),
      'externalParticipants',  coalesce(p.external_participants, 0),
      'scanned',       coalesce(p.scanned, 0),
      'lastRegistration', p.last_registration,

      'capacity',      e.capacity,
      'capacityNote',  e.capacity_note,

      /*
       * Signed on purpose. An event past its cap is the case an
       * organiser most needs to see, and clamping at zero would draw
       * it exactly like one that had just filled.
       *
       * NULL where no cap was given, so the UI can leave the column
       * blank instead of implying a full hall.
       */
      'seatsRemaining',
        case when e.capacity is null then null
             else e.capacity - coalesce(p.registrations, 0)
        end,

      /* Capacity 0 would divide by zero; it reads as 100% full. */
      'fillPercentage',
        case when e.capacity is null then null
             when e.capacity = 0     then 100
             else round(
               (coalesce(p.registrations, 0)::numeric / e.capacity) * 100
             )
        end
    )
    order by coalesce(p.registrations, 0) desc, e.name
  ),
  '[]'::json
)
from public.events e
left join per_event p on p.event_id = e.event_id;
$fn$;

-- Verify:
--   select count(*) from public.events where capacity is not null;   -- 70
--   select count(*) from public.events where capacity_note is not null; -- 19
--   select json_agg(x) from (
--     select value->>'name' as name,
--            value->>'capacity' as capacity,
--            value->>'registrations' as registrations,
--            value->>'seatsRemaining' as left,
--            value->>'fillPercentage' as pct
--     from json_array_elements(public.event_summaries())
--     where value->>'capacity' is not null
--     order by (value->>'fillPercentage')::numeric desc nulls last
--     limit 10
--   ) x;
