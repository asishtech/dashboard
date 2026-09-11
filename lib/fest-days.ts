/*
 * Which of the fest's two calendar days an event's tickets are sold
 * for, and which day it is right now.
 *
 * Shared between the gate's server-side entry check
 * (app/api/gate/route.ts) and the desk's own labelling
 * (components/CollegeRoster.tsx) so the two never quietly disagree
 * about what "Day 2" means.
 */

/*
 * events.day carries a mix of spellings from the organisers' sheet --
 * "D1", "D2", "D1 + D2", and a couple of "Day 1" / "Day 2" that
 * slipped through -- so this reads for either rather than assuming
 * one form.
 */
export function festDaysOf(
  raw: string | null | undefined
): Set<"D1" | "D2"> {
  const days = new Set<"D1" | "D2">();
  const text = (raw ?? "").toUpperCase();

  if (text.includes("D1") || text.includes("DAY 1")) days.add("D1");
  if (text.includes("D2") || text.includes("DAY 2")) days.add("D2");

  return days;
}

/* The fest's two calendar dates, in IST. Fixed rather than derived
   from anything: there are exactly two days and they do not move. */
export const FEST_DAY_1_IST = "2026-09-11";
export const FEST_DAY_2_IST = "2026-09-12";

const IST_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
});

export function todayIst(): string {
  return IST_DATE_FORMAT.format(new Date());
}

/* The IST calendar date a timestamp falls on -- for sorting a gate
   visit into Day 1 or Day 2 by when it actually happened, rather than
   by which events the visitor is registered for. */
export function istDateOf(iso: string): string {
  return IST_DATE_FORMAT.format(new Date(iso));
}
