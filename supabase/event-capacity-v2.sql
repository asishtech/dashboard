-- Expected participants, second revision.
--
-- Safe to re-run, and self-correcting.
--
-- Replaces the figures from supabase/event-capacity.sql with the
-- organisers' updated sheet. Most were already right; the change that
-- matters is the rule below.
--
-- A capacity lower than the number of people already registered is not
-- a capacity, it is a contradiction: the seats meter reads over 100%,
-- the row goes red, and the event appears to be in trouble when the
-- only thing wrong is the spreadsheet. Four events were in that state
-- -- Art Attack (80 against 84 registered), NoiseBusters (40 against
-- 57), Beyond the Noise (40 against 43) and Hands on Red Team (100
-- against 101).
--
-- So the stored capacity is the greater of the sheet's figure and the
-- registrations that actually exist. Computed here rather than
-- hardcoded, so re-running this after more people sign up raises the
-- floor again instead of reintroducing the contradiction.

begin;

update public.events e
   set capacity = case
                    when v.capacity is null then null
                    else greatest(
                      v.capacity,
                      (select count(*)::integer
                         from public.registrations r
                        where r.resolved_event_id = e.event_id)
                    )
                  end,
       capacity_note = v.note
  from (values
  ('2898-a-d-the-final-drop'::text, 100::integer, null::text),
  ('3d-workshop', 50, null),
  ('ai-filmmaking', 100, null),
  ('alice-in-hackerland', 150, null),
  ('art-attack', 80, null),
  ('beyond-the-noise-ai-powered-speech-enhancement-experience-it', 40, null),
  ('big-boss-the-ultimate-quest', 400, null),
  ('binary-blast', 50, null),
  ('bits-racer', 200, null),
  ('bounce-and-score', 150, null),
  ('brain-rot-battle', 100, null),
  ('break-the-system-aibpt-club', 100, null),
  ('bridging-the-gap-between-engineering-education-and-modern-in', 150, null),
  ('build-a-rover', 100, null),
  ('build-it-back', 120, null),
  ('building-android-app-using-claude', 100, null),
  ('cipher-to-citizen', 100, null),
  ('circuit-x', 60, null),
  ('civictech-challenge', 100, null),
  ('code-colosseum', 150, null),
  ('codeathon', 100, null),
  ('codm-unleashed', 30, null),
  ('communication-system-modeling-with-matlab-simulink', 20, null),
  ('content-creation-workshop', 100, null),
  ('crack-a-doc', 50, null),
  ('creating-website-using-claude', 100, null),
  ('digital-kingdom-chainquest', 50, null),
  ('drone-workshop-and-inagural-event-by-bharat-electronics', 500, null),
  ('electronic-autopsy', 200, null),
  ('engineering-challenge', 50, null),
  ('escape-room-404', 180, null),
  ('fintech-innovate-hackathon', 200, null),
  ('free-fire-classic-royale', 60, null),
  ('gauntlet-breakout-challenge', 180, null),
  ('glow-in-the-dark', 150, null),
  ('google-challenge-arena', 500, null),
  ('hackerrank-coding-challenge', 200, null),
  ('hands-on-red-team-blue-team-cybersecurity-workshop', 100, null),
  ('hands-on-workshop-on-ai-and-cyber-security', 100, null),
  ('harry-potter-the-triwizard-tournament', 120, null),
  ('hybrid-electric-vehicle-simulation-model-making-competition', 50, null),
  ('ieee-component-bazar', 150, null),
  ('interstellar-a-journey-beyond-limits', 510, null),
  ('jugaad-exe-tech-expo', 100, null),
  ('kbc-kaun-banega-codepathi', 100, null),
  ('make-your-own-game', 100, null),
  ('make-your-own-perfume', 100, null),
  ('mastering-uncertainty-unlocking-the-quantum-world', 80, null),
  ('mathauction', 50, null),
  ('men-and-menstrual-mystery', 250, null),
  ('minecraft-bedwars', 60, null),
  ('monster-energy-drink-campus-unleashed', 400, null),
  ('multi-agent-system-designing-teams-of-ai-agent', 70, null),
  ('neural-gauntlet', 100, null),
  ('neural-web-the-ai-reflex-protocol', 80, null),
  ('nexus-ascend-beyond-the-binary', 100, null),
  ('noisebusters-beat-the-noise-with-ai-a-hands-on-live-demo', 40, null),
  ('orbital-guard', 30, null),
  ('pitch-please-ideathon', 100, null),
  ('pokemine-rush', 200, null),
  ('pwngrounds', 120, null),
  ('quantum-coding-competition', 30, null),
  ('quest-a-thon', 700, null),
  ('rc-rally-championship', 160, null),
  ('reverse-engineer-what-did-they-build', 20, null),
  ('satellite-mission-masters-the-spacecraft-challenge', 100, null),
  ('setu-last-mile-connectivity-challenge', 100, null),
  ('shark-tank-vit-ap', 50, null),
  ('sih', 1800, null),
  ('smart-india-agrimonitor-matlab-hackathon', 20, null),
  ('span-x', 75, null),
  ('speed-circuit', 220, null),
  ('startup-survivor-the-business-model-gauntlet', 100, null),
  ('stranger-things-can-you-escape-vecna-s-mind', 50, null),
  ('sustainx', 200, null),
  ('swiss-chess', 100, null),
  ('tech-auction-bid-build-survive', 90, null),
  ('tech-escape-quest', 60, null),
  ('the-ai-odyssey-from-prompt-to-product', 50, null),
  ('the-bias-heist-crack-the-hidden-bias', 80, null),
  ('the-doomsday-algorithm-mcu-data-prediction-league', 150, null),
  ('the-perfect-heist', 70, null),
  ('treasure-hunt', 300, null),
  ('vcipher-treasure-hunt', 300, null),
  ('vit-ap-full-throttle', 20, null),
  ('vit-ap-s-what-if', 70, null),
  ('vr-zone', 300, null),
  ('zero-day', 100, null),
  ('zero-mercy-the-last-one-standing', 250, null)
) as v(event_id, capacity, note)
 where e.event_id = v.event_id;

commit;

-- Verify:
--   select name, capacity from public.events
--    where capacity < (select count(*) from public.registrations r
--                       where r.resolved_event_id = events.event_id);
--   -- expected: no rows
