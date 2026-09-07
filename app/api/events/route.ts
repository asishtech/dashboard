import { NextResponse } from "next/server";
import { allowedEventIds, requireRole } from "@/lib/auth";
import {
  classifyPricing,
  isMixed,
  type Pricing,
} from "@/lib/event-pricing";
import { merchandiseEventIds } from "@/lib/events";
import { isTeamEvent } from "@/lib/team-events";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export type EventSummary = {
  event_id: string;
  name: string;
  event_date: string | null;
  registrations: number;
  participants: number;
  revenue: number;
  scanned: number;
  lastRegistration: string | null;
  /* Admin override; null until someone sets it. */
  pricing?: string | null;
  paidRegistrations?: number;
  freeRegistrations?: number;
  /*
   * Absent until supabase/external-registrations.sql runs. See
   * registration_origin() there for how each is decided.
   */
  externalRegistrations?: number;
  internalRegistrations?: number;
  unknownRegistrations?: number;
  externalParticipants?: number;
  /*
   * Absent until supabase/event-capacity.sql runs. Null where the
   * organisers' sheet gave no figure, which is not zero seats.
   */
  capacity?: number | null;
  capacityNote?: string | null;
  /* Signed: negative means the event is over its cap. */
  seatsRemaining?: number | null;
  fillPercentage?: number | null;
};

const PRICING_FILTERS = ["paid", "free", "unclassified"] as const;

/*
 * GET /api/events
 *
 * Every event with its totals. Admins see all of them; a coordinator
 * only sees the events assigned to their address.
 *
 * Filtering happens here rather than in the client so that a
 * coordinator never receives another club's numbers in the first
 * place.
 */
export async function GET(request: Request) {
  const auth = await requireRole(
    "admin",
    "faculty",
    "registrations"
  );

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const [summaries, merchIds, allowed, teamSizes, unmatched] =
      await Promise.all([
        supabaseAdmin().rpc("event_summaries"),
        merchandiseEventIds(),
        allowedEventIds(auth),
        /*
         * team_size is not in event_summaries and does not belong
         * there -- it never changes as registrations come in, so
         * recomputing it inside an aggregate over 2,400 rows would be
         * work done per request for a value written once. Read
         * straight from the table and merged below.
         */
        supabaseAdmin().from("events").select("event_id,team_size"),

        /*
         * Registrations that belong to no event.
         *
         * event_summaries() aggregates over events, so a registration
         * whose ticket matches nothing in `events` is in none of its
         * rows -- and the totals on this page are quietly short by
         * that many while /admin, which counts registrations, is not.
         * That is how 2,418 and 2,397 came to be on two screens.
         *
         * The tickets come back too, up to a couple of hundred rows,
         * because the count alone says something is wrong without
         * saying what to do: the names are the events that need
         * adding.
         */
        supabaseAdmin()
          .from("registrations")
          .select("ticket", { count: "exact" })
          .is("resolved_event_id", null)
          .limit(300),
      ]);

    if (summaries.error) {
      throw summaries.error;
    }

    /*
     * Merchandise is a row in `events` for the resolver's benefit, not
     * something to browse alongside Art Attack. It has its own screens
     * (Registrations, Inventory), so it is dropped here -- which also
     * keeps the revenue total on this page to actual event revenue.
     */
    const all = ((summaries.data ?? []) as EventSummary[]).filter(
      (event) => !merchIds.has(String(event.event_id))
    );

    const events =
      allowed === null
        ? all
        : all.filter((event) =>
            allowed.includes(String(event.event_id))
          );

    /*
     * Search is applied server-side too, so a narrow result set does
     * not depend on the client having received everything.
     */
    const query = new URL(request.url).searchParams
      .get("q")
      ?.trim()
      .toLowerCase();

    const searched = query
      ? events.filter(
          (event) =>
            event.name.toLowerCase().includes(query) ||
            String(event.event_id).toLowerCase().includes(query)
        )
      : events;

    /*
     * The paid/free split is resolved here so the list, the detail
     * screen and the counts below can never disagree about which
     * bucket an event is in.
     */
    const teamSizeById = new Map(
      ((teamSizes.data ?? []) as {
        event_id: string;
        team_size: string | null;
      }[]).map((row) => [String(row.event_id), row.team_size])
    );

    const classified = searched.map((event) => {
      const teamSize = teamSizeById.get(String(event.event_id));

      return {
        ...event,
        pricingResolved: classifyPricing(event),
        pricingMixed: isMixed(event),
        teamSize: teamSize ?? null,
        isTeam: isTeamEvent(teamSize),
      };
    });

    const requested = new URL(request.url).searchParams.get("pricing");

    const pricingFilter = (
      PRICING_FILTERS as readonly string[]
    ).includes(requested ?? "")
      ? (requested as Pricing)
      : null;

    const filtered = pricingFilter
      ? classified.filter(
          (event) => event.pricingResolved === pricingFilter
        )
      : classified;

    /*
     * Counts describe everything the caller may see, not the current
     * filter, so the tab labels stay stable while switching tabs.
     */
    const counts = classified.reduce(
      (acc, event) => {
        acc[event.pricingResolved] += 1;
        return acc;
      },
      { paid: 0, free: 0, unclassified: 0 } as Record<Pricing, number>
    );

    /*
     * Origin totals across everything the caller may see. `unknown` is
     * reported alongside `external` on purpose: it is the number that
     * tells you whether the external figure can be trusted, and a
     * large unknown usually means the form's university field is
     * named something registration_university() does not match.
     */
    const origin = classified.reduce(
      (acc, event) => {
        acc.external += Number(event.externalRegistrations ?? 0);
        acc.internal += Number(event.internalRegistrations ?? 0);
        acc.unknown += Number(event.unknownRegistrations ?? 0);
        return acc;
      },
      { external: 0, internal: 0, unknown: 0 }
    );

    /*
     * `externalParticipants` is deliberately not summed. It counts
     * distinct emails *within* one event, so adding it across events
     * counts anyone who entered two of them twice -- which is exactly
     * the mistake a "unique outside visitors" headline invites.
     */

    /*
     * The migration has not run if nothing carries an origin at all;
     * saying so beats showing a confident zero.
     */
    const originAvailable = classified.some(
      (event) => event.externalRegistrations !== undefined
    );

    /*
     * Same distinction for capacity: the column absent altogether means
     * supabase/event-capacity.sql has not run, and the whole column is
     * hidden. A null on one event means the organisers' sheet gave no
     * figure for it, and that one row reads "—".
     */
    const capacityAvailable = classified.some(
      (event) => event.capacity !== undefined
    );

    /*
     * Coordinators were scoped to participant name, email and
     * registration number, so revenue is dropped from the payload
     * rather than hidden by the UI.
     */
    const isAdmin = auth.activeRole === "admin";

    const payload = isAdmin
      ? filtered
      : filtered.map((event) => {
          const stripped: Partial<typeof event> = { ...event };
          delete stripped.revenue;
          delete stripped.paidRegistrations;
          delete stripped.freeRegistrations;
          return stripped;
        });

    /*
     * Only for somebody who sees the whole festival. A coordinator's
     * totals are their own events' and were never meant to add up to
     * the site-wide figure, so telling them about 21 registrations in
     * events they do not run would be noise.
     */
    const looseTickets = new Map<string, number>();

    if (allowed === null) {
      for (const row of (unmatched.data ?? []) as {
        ticket: string | null;
      }[]) {
        const ticket = (row.ticket ?? "").trim() || "No ticket named";

        looseTickets.set(
          ticket,
          (looseTickets.get(ticket) ?? 0) + 1
        );
      }
    }

    return NextResponse.json({
      success: true,
      scoped: allowed !== null,
      /*
       * The difference between this page's total and /admin's. Zero
       * when every registration resolves, which is the normal state.
       */
      unmatchedRegistrations:
        allowed === null ? (unmatched.count ?? 0) : 0,
      unmatchedTickets: [...looseTickets.entries()]
        .map(([ticket, count]) => ({ ticket, count }))
        .sort((a, b) => b.count - a.count),
      canSeeRevenue: isAdmin,
      canSetPricing: isAdmin,
      pricingCounts: counts,
      originAvailable,
      capacityAvailable,
      /* Absent only if supabase/event-details.sql never ran. */
      teamAvailable: classified.some(
        (event) => event.teamSize !== null
      ),
      teamCount: classified.filter((event) => event.isTeam).length,
      originCounts: origin,
      count: payload.length,
      events: payload,
    });
  } catch (error) {
    console.error("Events API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load events",
      },
      { status: 500 }
    );
  }
}
