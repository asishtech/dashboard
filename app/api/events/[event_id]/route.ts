import { NextResponse } from "next/server";
import { canReadEvent, requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export type Attendee = {
  registration_id: string;
  name: string | null;
  email: string | null;
  scanned: boolean;
};

/*
 * GET /api/events/[event_id]
 *
 * One event, its totals, and its attendee list.
 *
 * The attendee shape is deliberately narrow -- registration id, name,
 * email and whether they have been scanned in. The upstream feed also
 * carries mobile numbers, invoice ids and payment dates; club
 * coordinators have no need for those, so they are never selected.
 * See public.event_attendees() in
 * supabase/events-and-coordinators.sql.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ event_id: string }> }
) {
  const auth = await requireRole("admin", "coordinator");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { event_id } = await params;

    if (!event_id) {
      return NextResponse.json(
        { error: "Event id is required" },
        { status: 400 }
      );
    }

    /*
     * Authorize before reading. A coordinator guessing another
     * club's id must get a 403, not their data.
     */
    if (!(await canReadEvent(auth, event_id))) {
      return NextResponse.json(
        { error: "You do not have access to this event" },
        { status: 403 }
      );
    }

    const db = supabaseAdmin();

    const [eventResult, summariesResult, attendeesResult] =
      await Promise.all([
        db
          .from("events")
          .select("event_id,name,event_date")
          .eq("event_id", event_id)
          .maybeSingle(),

        db.rpc("event_summaries"),

        db.rpc("event_attendees", { p_event_id: event_id }),
      ]);

    if (eventResult.error) throw eventResult.error;
    if (summariesResult.error) throw summariesResult.error;
    if (attendeesResult.error) throw attendeesResult.error;

    if (!eventResult.data) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    const summary = (
      (summariesResult.data ?? []) as {
        event_id: string;
        registrations: number;
        participants: number;
        revenue: number;
        scanned: number;
      }[]
    ).find((row) => String(row.event_id) === event_id);

    const attendees = (attendeesResult.data ?? []) as Attendee[];

    const isAdmin = auth.profile.role === "admin";

    return NextResponse.json({
      success: true,

      event: {
        ...eventResult.data,
        registrations: summary?.registrations ?? 0,
        participants: summary?.participants ?? 0,
        scanned: summary?.scanned ?? 0,

        /*
         * Money is omitted from the payload entirely for
         * coordinators rather than hidden by the UI. Anything sent
         * to the browser is readable in devtools.
         */
        ...(isAdmin ? { revenue: summary?.revenue ?? 0 } : {}),
      },

      canSeeRevenue: isAdmin,

      attendees,
    });
  } catch (error) {
    console.error("Event detail API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load event",
      },
      { status: 500 }
    );
  }
}
