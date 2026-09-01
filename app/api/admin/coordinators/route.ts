import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/*
 * GET /api/admin/coordinators
 *
 * Every coordinator assignment, with the event it grants.
 */
export async function GET() {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const db = supabaseAdmin();

    const [assignments, events] = await Promise.all([
      db
        .from("event_coordinators")
        .select("id,email,event_id,created_at")
        .order("email"),

      db.from("events").select("event_id,name").order("name"),
    ]);

    if (assignments.error) throw assignments.error;
    if (events.error) throw events.error;

    const nameById = new Map(
      (events.data ?? []).map((e) => [
        String(e.event_id),
        e.name as string,
      ])
    );

    return NextResponse.json({
      success: true,

      coordinators: (assignments.data ?? []).map((row) => ({
        ...row,
        event_name:
          nameById.get(String(row.event_id)) ??
          `Event ${row.event_id}`,
      })),

      events: events.data ?? [],
    });
  } catch (error) {
    console.error("Coordinators GET error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load coordinators",
      },
      { status: 500 }
    );
  }
}

/*
 * POST /api/admin/coordinators
 *
 * Grant an email access to an event.
 *
 * Two writes, because access needs both halves: the invite is what
 * gives them the `coordinator` role at sign-in, and the assignment is
 * what scopes them to one event. Granting only one would either lock
 * them out or, worse, sign them in unscoped.
 */
export async function POST(request: Request) {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const body = await request.json();

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const eventId =
      typeof body.eventId === "string" ? body.eventId.trim() : "";

    if (!EMAIL.test(email)) {
      return NextResponse.json(
        { error: "A valid email is required" },
        { status: 400 }
      );
    }

    if (!eventId) {
      return NextResponse.json(
        { error: "An event is required" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    const { data: event, error: eventError } = await db
      .from("events")
      .select("event_id,name")
      .eq("event_id", eventId)
      .maybeSingle();

    if (eventError) throw eventError;

    if (!event) {
      return NextResponse.json(
        { error: "Unknown event" },
        { status: 404 }
      );
    }

    /*
     * Never downgrade an existing admin or volunteer to coordinator
     * just because they were also handed an event.
     */
    const { data: invite, error: inviteError } = await db
      .from("staff_invites")
      .select("id,role")
      .eq("email", email)
      .maybeSingle();

    if (inviteError) throw inviteError;

    if (!invite) {
      const { error } = await db
        .from("staff_invites")
        .insert({ email, role: "faculty", active: true });

      if (error) throw error;
    } else if (invite.role === "faculty") {
      const { error } = await db
        .from("staff_invites")
        .update({ active: true })
        .eq("id", invite.id);

      if (error) throw error;
    }

    const { error: assignError } = await db
      .from("event_coordinators")
      .insert({ email, event_id: eventId });

    if (assignError) {
      /* 23505 = unique_violation: already assigned, which is fine. */
      if (assignError.code !== "23505") {
        throw assignError;
      }
    }

    return NextResponse.json({
      success: true,
      email,
      event: event.name,
      alreadyAssigned: assignError?.code === "23505",
    });
  } catch (error) {
    console.error("Coordinators POST error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to add coordinator",
      },
      { status: 500 }
    );
  }
}

/*
 * DELETE /api/admin/coordinators?id=123
 *
 * Revoke one assignment. The staff invite is left alone: the person
 * may still coordinate another event, and staff access is managed on
 * the staff screen.
 */
export async function DELETE(request: Request) {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const id = Number(
      new URL(request.url).searchParams.get("id")
    );

    if (!Number.isFinite(id)) {
      return NextResponse.json(
        { error: "An assignment id is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin()
      .from("event_coordinators")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Coordinators DELETE error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to remove coordinator",
      },
      { status: 500 }
    );
  }
}
