/*
 * Whether an event is entered as a team.
 *
 * Read from `events.team_size`, which the organisers' sheet fills with
 * free text: "Individual", "Team(2)", "Team (3–5 members)",
 * "Individual/Team(upto 4)", "Team of 2". No enum, so the test is
 * whether the word appears at all.
 *
 * "Individual/Team(2)" counts as a team event on purpose -- it can be
 * entered as one, and an organiser asking "which events have teams"
 * wants it in the answer.
 */
export function isTeamEvent(teamSize?: string | null) {
  return /team/i.test(teamSize ?? "");
}

/*
 * The team size as a number, where the text states one.
 *
 * Best effort and deliberately loose: it drives a column, not a
 * capacity check. "Team(2-4)" gives 4, the largest a team may be,
 * because that is the figure a room is planned against.
 */
export function maxTeamSize(teamSize?: string | null) {
  const numbers = (teamSize ?? "").match(/\d+/g);

  if (!numbers || numbers.length === 0) return null;

  return Math.max(...numbers.map(Number));
}
