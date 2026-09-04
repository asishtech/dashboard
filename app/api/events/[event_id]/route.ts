import { NextResponse } from "next/server";
import { canReadEvent, requireRole } from "@/lib/auth";
import { classifyPricing, isMixed } from "@/lib/event-pricing";
import { merchandiseEventIds } from "@/lib/events";
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
  const auth = await requireRole("admin", "faculty");

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

    /*
     * The merchandise row exists so the resolver can map hoodie
     * orders; it is not an event. Dropping it from the list is not
     * enough on its own -- an old bookmark would still open it here.
     */
    if ((await merchandiseEventIds()).has(event_id)) {
      return NextResponse.json(
        {
          error:
            "Merchandise is not an event. See Registrations and Inventory.",
        },
        { status: 404 }
      );
    }

    const db = supabaseAdmin();

    /*
     * One literal, not a concatenation: supabase-js reads the select
     * string at the type level, and `"a," + "b"` is not a literal, so
     * the row type collapses to unknown.
     */
    const DETAIL_COLUMNS =
      "event_id,name,event_date,day,venue,pricing,event_type,time_slot,team_size,registration_fee,prize_pool,logistics,external_guest,certificates,description,capacity,capacity_note";

    const BASIC_COLUMNS = "event_id,name,event_date,day,venue,pricing";

    const [detailed, summariesResult, attendeesResult] =
      await Promise.all([
        db
          .from("events")
          .select(DETAIL_COLUMNS)
          .eq("event_id", event_id)
          .maybeSingle(),

        db.rpc("event_summaries"),

        db.rpc("event_attendees", { p_event_id: event_id }),
      ]);

    /*
     * 42703: supabase/event-details.sql or event-capacity.sql has not
     * been run, so those sheet columns do not exist yet. Fall back
     * rather than 500 -- the totals and the attendee list are the part
     * people actually need.
     */
    const eventResult =
      detailed.error?.code === "42703"
        ? await db
            .from("events")
            .select(BASIC_COLUMNS)
            .eq("event_id", event_id)
            .maybeSingle()
        : detailed;

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
        pricing?: string | null;
        paidRegistrations?: number;
        freeRegistrations?: number;
        externalRegistrations?: number;
        internalRegistrations?: number;
        unknownRegistrations?: number;
        externalParticipants?: number;
        capacity?: number | null;
        capacityNote?: string | null;
        seatsRemaining?: number | null;
        fillPercentage?: number | null;
      }[]
    ).find((row) => String(row.event_id) === event_id);

    const attendees = (attendeesResult.data ?? []) as Attendee[];

    const isAdmin = auth.activeRole === "admin";

    return NextResponse.json({
      success: true,

      event: {
        ...(eventResult.data as Record<string, unknown>),
        registrations: summary?.registrations ?? 0,
        participants: summary?.participants ?? 0,
        scanned: summary?.scanned ?? 0,

        pricing: summary?.pricing ?? null,
        pricingResolved: classifyPricing(summary ?? {}),
        pricingMixed: isMixed(summary ?? {}),

        /*
         * Absent until supabase/external-registrations.sql runs, which
         * the UI reads as "not available" rather than as zero.
         */
        externalRegistrations: summary?.externalRegistrations,
        internalRegistrations: summary?.internalRegistrations,
        unknownRegistrations: summary?.unknownRegistrations,
        externalParticipants: summary?.externalParticipants,

        /*
         * The row above already carries capacity and capacity_note.
         * These two are the arithmetic against live registrations, so
         * they come from the summary -- and camelCased to match what
         * <SeatsMeter> reads on the events list.
         */
        capacityNote: summary?.capacityNote,
        seatsRemaining: summary?.seatsRemaining,
        fillPercentage: summary?.fillPercentage,

        /*
         * Money is omitted from the payload entirely for
         * coordinators rather than hidden by the UI. Anything sent
         * to the browser is readable in devtools.
         */
        ...(isAdmin
          ? {
              revenue: summary?.revenue ?? 0,
              paidRegistrations: summary?.paidRegistrations ?? 0,
              freeRegistrations: summary?.freeRegistrations ?? 0,
            }
          : {}),
      },

      canSeeRevenue: isAdmin,
      canSetPricing: isAdmin,

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

/*
 * PATCH /api/events/[event_id]
 *
 * Label an event paid or free, and set how many seats it has.
 *
 * Pricing is only needed for events with no registrations yet -- once
 * tickets sell, the totals classify it on their own. Sending `null`
 * hands either field back to the data.
 *
 * Capacity is seeded from the organisers' sheet by
 * supabase/event-capacity.sql; this is for the ones that change after
 * a venue is swapped, and the nineteen the sheet left blank.
 *
 * Admin only: a coordinator can read their own event but must not
 * relabel it or move its cap.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ event_id: string }> }
) {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { event_id } = await params;

    const body = await request.json();

    const update: Record<string, unknown> = {};

    /*
     * Both fields are optional and independent: the pricing control
     * and the capacity control are separate, and each sends only its
     * own key. `in` rather than a truthiness check, because null is a
     * meaningful value for both -- it hands the field back to the
     * data.
     */
    if ("pricing" in body) {
      const pricing = body.pricing;

      if (
        pricing !== null &&
        pricing !== "paid" &&
        pricing !== "free"
      ) {
        return NextResponse.json(
          { error: "pricing must be 'paid', 'free' or null" },
          { status: 400 }
        );
      }

      update.pricing = pricing;
    }

    if ("capacity" in body) {
      const capacity = body.capacity;

      if (capacity === null) {
        /* Back to "the sheet gave no figure", not to zero seats. */
        update.capacity = null;
      } else {
        const seats = Number(capacity);

        if (!Number.isInteger(seats) || seats < 0) {
          return NextResponse.json(
            {
              error:
                "capacity must be a whole number of seats, or null",
            },
            { status: 400 }
          );
        }

        update.capacity = seats;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin()
      .from("events")
      .update(update)
      .eq("event_id", event_id)
      .select("event_id,pricing,capacity")
      .maybeSingle();

    /* 42703: supabase/event-pricing.sql or event-capacity.sql has not
       been run yet. */
    if (error?.code === "42703") {
      return NextResponse.json(
        {
          error:
            "capacity" in update
              ? "Run supabase/event-capacity.sql before setting a cap."
              : "Run supabase/event-pricing.sql before labelling events.",
        },
        { status: 409 }
      );
    }

    /* 23514: the events_capacity_non_negative check. */
    if (error?.code === "23514") {
      return NextResponse.json(
        { error: "Capacity cannot be negative" },
        { status: 400 }
      );
    }

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, event: data });
  } catch (error) {
    console.error("Event pricing PATCH error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update event",
      },
      { status: 500 }
    );
  }
}
