import { NextResponse } from "next/server";
import { allowedEventIds, requireRole } from "@/lib/auth";
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
};

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
  const auth = await requireRole("admin", "coordinator");

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

    const filtered = query
      ? events.filter(
          (event) =>
            event.name.toLowerCase().includes(query) ||
            String(event.event_id).toLowerCase().includes(query)
        )
      : events;

    /*
     * Coordinators were scoped to participant name, email and
     * registration number, so revenue is dropped from the payload
     * rather than hidden by the UI.
     */
    const isAdmin = auth.profile.role === "admin";

    const payload = isAdmin
      ? filtered
      : filtered.map((event) => {
          const stripped: Partial<EventSummary> = { ...event };
          delete stripped.revenue;
          return stripped;
        });

    return NextResponse.json({
      success: true,
      scoped: allowed !== null,
      canSeeRevenue: isAdmin,
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
