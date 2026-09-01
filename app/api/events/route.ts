import { NextResponse } from "next/server";
import { allowedEventIds, requireRole } from "@/lib/auth";
import {
  classifyPricing,
  isMixed,
  type Pricing,
} from "@/lib/event-pricing";
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
  const auth = await requireRole("admin", "faculty");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { data, error } = await supabaseAdmin().rpc(
      "event_summaries"
    );

    if (error) {
      throw error;
    }

    const allowed = await allowedEventIds(auth);

    const all = (data ?? []) as EventSummary[];

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
    const classified = searched.map((event) => ({
      ...event,
      pricingResolved: classifyPricing(event),
      pricingMixed: isMixed(event),
    }));

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

    return NextResponse.json({
      success: true,
      scoped: allowed !== null,
      canSeeRevenue: isAdmin,
      canSetPricing: isAdmin,
      pricingCounts: counts,
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
