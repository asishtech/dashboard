-- Who proposed each event: a club, a chapter, or a faculty member.
--
-- Safe to re-run. Run after supabase/fuzzy-tickets.sql.
--
-- Nothing in the database said this. `event_type` is
-- Competition/Workshop/Hackathon, and the coordinator table does not
-- separate them either -- 79 of the 93 events have both a faculty and
-- a student coordinator, so "has a faculty coordinator" classifies
-- almost everything as faculty and means nothing.
--
-- The answer was in Event_Budgets.xlsx, whose "Proposed By (Club /
-- Chapter / Faculty)" column is exactly this question. 57 of its rows
-- match an event by name, by an existing alias, or by the same
-- unique-containment rule the ticket resolver uses.
--
-- The other 36 events are left null rather than guessed at, and the
-- sheet prints "Not recorded" for them. The budget file is a
-- proposal-stage document: it carries names that were later changed
-- ("Racing Cockpit", "RoboWars", "Hackathon (SIH-2026)") and joint
-- proposals covering two events at once ("SustainX 36 & PokeMine
-- Rush"), none of which can be assigned without someone saying which
-- is which.

begin;

alter table public.events
  add column if not exists proposed_by text,
  add column if not exists proposer_name text;

comment on column public.events.proposed_by is
  'Club, Chapter or Faculty, from the event budget sheet. Null where unrecorded.';

comment on column public.events.proposer_name is
  'The club, chapter or faculty member named as proposer.';

update public.events e
   set proposed_by   = v.proposed_by,
       proposer_name = nullif(v.proposer_name, '')
  from (values
  ('tech-escape-quest', 'Faculty', 'Dr. Y. Raghuvamsi (Faculty)'),
  ('electronic-autopsy', 'Club', 'Newspaper Club'),
  ('bounce-and-score', 'Club', 'Newspaper Club'),
  ('the-doomsday-algorithm-mcu-data-prediction-league', 'Club', 'Data Science Club'),
  ('kbc-kaun-banega-codepathi', 'Chapter', 'ACM Student Chapter'),
  ('nexus-ascend-beyond-the-binary', 'Faculty', 'Dr. Jayashree Pradhan (student through faculty)'),
  ('treasure-hunt', 'Chapter', 'ACM Student Chapter'),
  ('communication-system-modeling-with-matlab-simulink', 'Faculty', 'Dr. Jayashree Pradhan (Faculty)'),
  ('google-challenge-arena', 'Chapter', 'GDGoC VIT-AP'),
  ('cipher-to-citizen', 'Club', 'Electoral Club'),
  ('civictech-challenge', 'Club', 'Electoral Club'),
  ('glow-in-the-dark', 'Club', 'Beat the Heat (BTH)'),
  ('speed-circuit', 'Club', 'Drushya Animation & Gaming Club (DAG Club)'),
  ('vr-zone', 'Club', 'Drushya Animation & Gaming Club (DAG Club)'),
  ('harry-potter-the-triwizard-tournament', 'Club', 'Bioscope Club'),
  ('the-bias-heist-crack-the-hidden-bias', 'Club', 'Machine Learning Club'),
  ('neural-web-the-ai-reflex-protocol', 'Club', 'Machine Learning Club'),
  ('the-ai-odyssey-from-prompt-to-product', 'Faculty', 'Dr. Kritika Bansal - SENSE / IEEE WIE Student Affinity Group'),
  ('pwngrounds', 'Chapter', 'Null Chapter (Cybersecurity Chapter)'),
  ('shark-tank-vit-ap', 'Club', 'Entrepreneurship Club'),
  ('startup-survivor-the-business-model-gauntlet', 'Club', 'Entrepreneurship Club'),
  ('orbital-guard', 'Club', 'SEDS Aurora'),
  ('quantum-coding-competition', 'Club', 'Quantum Frontier Club'),
  ('alice-in-hackerland', 'Club', 'Women in Open Source (WiOS) Club'),
  ('hackerrank-coding-challenge', 'Club', 'Team Next Nexus (TNN), SENSE'),
  ('fintech-innovate-hackathon', 'Club', 'Team Next Nexus (TNN), SENSE'),
  ('binary-blast', 'Faculty', 'Dr. Saladi Saritha (Faculty)'),
  ('zero-mercy-the-last-one-standing', 'Club', 'Anchoring Club'),
  ('vcipher-treasure-hunt', 'Club', 'Bongojo - The Bengali Association'),
  ('vit-ap-full-throttle', 'Faculty', 'Rajan Deorao Lanjekar (Faculty)'),
  ('smart-india-agrimonitor-matlab-hackathon', 'Faculty', 'Dr. Sonia Das (Faculty)'),
  ('monster-energy-drink-campus-unleashed', 'Club', 'Torque Gaming Club'),
  ('circuit-x', 'Faculty', 'Dr. Pradosh Ranjan Sahoo (Faculty)'),
  ('hands-on-red-team-blue-team-cybersecurity-workshop', 'Faculty', 'Dr. K. Ganesh Reddy - Centre of Excellence'),
  ('make-your-own-game', 'Faculty', 'Dr. Sabeel M Basheer (Faculty)'),
  ('mastering-uncertainty-unlocking-the-quantum-world', 'Faculty', 'Dr. Sabeel M Basheer (Faculty)'),
  ('hybrid-electric-vehicle-simulation-model-making-competition', 'Faculty', 'Dr. Swati Shukla (Faculty)'),
  ('2898-a-d-the-final-drop', 'Chapter', 'IETE Student Forum'),
  ('code-colosseum', 'Chapter', 'GeeksforGeeks VIT-AP Student Chapter'),
  ('digital-kingdom-chainquest', 'Club', 'Blockchain Club (Centre of Excellence - Blockchain)'),
  ('neural-gauntlet', 'Chapter', 'GeeksforGeeks VIT-AP Student Chapter'),
  ('make-your-own-perfume', 'Faculty', 'Dr. Sabeel M Basheer (Faculty)'),
  ('bits-racer', 'Chapter', 'Microsoft Student Chapter'),
  ('crack-a-doc', 'Faculty', 'Dr. Yepuganti Karuna (Faculty)'),
  ('art-attack', 'Chapter', 'Microsoft Student Chapter'),
  ('rc-rally-championship', 'Chapter', 'ACS Chapter'),
  ('satellite-mission-masters-the-spacecraft-challenge', 'Chapter', 'IEEE Aerospace and Electronic Systems Society'),
  ('the-perfect-heist', 'Club', 'Intelligent and Intuitive AI Club'),
  ('pitch-please-ideathon', 'Club', 'Android Club'),
  ('jugaad-exe-tech-expo', 'Club', 'Android Club'),
  ('setu-last-mile-connectivity-challenge', 'Faculty', 'Dr. Praveen Tiwari (Faculty)'),
  ('zero-day', 'Chapter', 'CSI Chapter'),
  ('engineering-challenge', 'Chapter', 'CSI Chapter'),
  ('beyond-the-noise-ai-powered-speech-enhancement-experience-it', 'Faculty', 'Dr. Sunnydayal (Faculty)'),
  ('noisebusters-beat-the-noise-with-ai-a-hands-on-live-demo', 'Faculty', 'Dr. Sunnydayal (Faculty)'),
  ('gauntlet-breakout-challenge', 'Chapter', 'IEEE Student Branch - IEEE MTT-S'),
  ('break-the-system-aibpt-club', 'Club', 'AI Based Productive Tools (AiBPT) Club')
  ) as v(event_id, proposed_by, proposer_name)
 where e.event_id = v.event_id;

commit;

-- Verify -------------------------------------------------------------------

select coalesce(proposed_by, 'Not recorded') as proposed_by, count(*)
from public.events
group by 1
order by 2 desc;

-- The ones still to be filled in by hand:
--   update public.events set proposed_by = 'Club',
--          proposer_name = 'Robotics Club'
--    where event_id = 'build-a-rover';
select event_id, name
from public.events
where proposed_by is null
  and source_event_id is distinct from '513'
order by name;
