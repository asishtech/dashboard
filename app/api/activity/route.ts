import { NextResponse } from "next/server";
import { getSession, requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/* PostgREST/Postgres: the migration has not been run. */
const MISSING = ["42883", "PGRST202", "42P01"];

/*
 * GET /api/activity
 *
 * What the site is doing right now, and whether anything is broken.
 *
 * Read-only and derived from timestamps that already exist, so
 * watching this page costs two queries a poll and writes nothing.
 */
export async function GET() {
  const auth = await requireRole("admin", "registrations");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const db = supabaseAdmin();

    const [pulse, health] = await Promise.all([
      db.rpc("activity_pulse"),
      db.rpc("app_health"),
    ]);

    if (
      pulse.error &&
      MISSING.includes(pulse.error.code ?? "")
    ) {
      return NextResponse.json({
        success: true,
        ready: false,
        reason:
          "Run supabase/activity-pulse.sql to enable the live view.",
      });
    }

    if (pulse.error) throw pulse.error;

    return NextResponse.json({
      success: true,
      ready: true,
      pulse: pulse.data,
      /*
       * Health is allowed to be absent. It reads sync_state and
       * email_log, which arrive with different migrations, and a
       * missing one of those must not take the live view down with
       * it.
       */
      health: health.error ? null : health.data,
    });
  } catch (error) {
    console.error("Activity API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read activity",
      },
      { status: 500 }
    );
  }
}

/*
 * POST /api/activity  { path }
 *
 * The heartbeat. Any signed-in account may say it is here -- a
 * volunteer at a gate is exactly who this is counting -- but it can
 * only ever record *itself*: the id and role come from the session,
 * never from the request.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const path =
      typeof body.path === "string"
        ? body.path.slice(0, 120)
        : null;

    const { error } = await supabaseAdmin().rpc("touch_presence", {
      p_user_id: session.user.id,
      p_email: session.user.email ?? null,
      p_role: session.activeRole,
      p_path: path,
    });

    /*
     * A heartbeat that fails is not worth a red banner on a scanner
     * screen. Report it quietly and let the gate carry on.
     */
    if (error && !MISSING.includes(error.code ?? "")) {
      console.error("Presence heartbeat failed:", error);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}
