import { NextResponse } from "next/server";
import { allowedEventIds, requireRole } from "@/lib/auth";
import { readAll } from "@/lib/paged";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/*
 * GET /api/checkin/manifest
 *
 * Every pass this account may admit, small enough to keep on the
 * device. Downloaded while there is a signal so the scanner can
 * resolve a code in a hall that has none.
 *
 * Deliberately narrow. Email, phone, amounts and anything else the
 * feed carries are left out: this lands in localStorage on a
 * volunteer's own phone, and the only question at a gate is "who is
 * this and are they already in".
 */
export async function GET() {
  const auth = await requireRole("volunteer", "admin", "faculty");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const db = supabaseAdmin();

    const allowed = await allowedEventIds(auth);

    const [registrations, scans, events] = await Promise.all([
      readAll<{
        id: number;
        registration_id: string;
        name: string | null;
        qr_token: string | null;
        event_id: string | null;
        resolved_event_id: string | null;
      }>((from, to) =>
        db
          .from("registrations")
          .select(
            "id,registration_id,name,qr_token,event_id,resolved_event_id"
          )
          .not("qr_token", "is", null)
          .order("id", { ascending: true })
          .range(from, to)
      ),

      readAll<{ registration_id: number; created_at: string }>(
        (from, to) =>
          db
            .from("qr_scans")
            .select("registration_id,created_at")
            .order("id", { ascending: true })
            .range(from, to)
      ),

      db.from("events").select("event_id,name,day,venue"),
    ]);

    const eventById = new Map(
      (events.data ?? []).map((row) => [String(row.event_id), row])
    );

    const enteredAt = new Map(
      scans.rows.map((row) => [
        Number(row.registration_id),
        row.created_at,
      ])
    );

    const passes = registrations.rows
      /*
       * A coordinator gets only their own events, matching what
       * /api/checkin will actually let them do. Handing them the whole
       * fest and refusing it later would put every attendee's name on
       * their phone for nothing.
       */
      .filter(
        (row) =>
          allowed === null ||
          (row.resolved_event_id !== null &&
            allowed.includes(row.resolved_event_id))
      )
      .map((row) => {
        const event = row.resolved_event_id
          ? eventById.get(row.resolved_event_id)
          : undefined;

        return {
          id: row.id,
          token: row.qr_token as string,
          registration_id: row.registration_id,
          name: row.name,
          event_id: row.resolved_event_id,
          event_name: event?.name ?? "V-TAPP event",
          event_day: event?.day ?? null,
          event_venue: event?.venue ?? null,
          is_merch: String(row.event_id ?? "") === "513",
          entered_at: enteredAt.get(row.id) ?? null,
        };
      });

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      count: passes.length,
      passes,
    });
  } catch (error) {
    console.error("Check-in manifest error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to build the offline pass list",
      },
      { status: 500 }
    );
  }
}
