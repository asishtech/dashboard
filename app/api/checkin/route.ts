import { NextResponse } from "next/server";
import { canReadEvent, requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export type CheckinPass = {
  id: number;
  registration_id: string;
  name: string | null;
  email: string | null;
  event_id: string | null;
  event_name: string;
  event_day: string | null;
  event_venue: string | null;
  is_merch: boolean;
  entered_at: string | null;
};

/*
 * A coordinator may admit their own event's attendees and no others.
 * An event whose ticket matched nothing has no owner, so only staff
 * with unrestricted scope can admit it.
 */
async function mayAdmit(
  session: Awaited<ReturnType<typeof requireRole>>,
  pass: CheckinPass
) {
  if (session instanceof NextResponse) return false;

  if (session.activeRole !== "faculty") return true;

  if (!pass.event_id) return false;

  return canReadEvent(session, pass.event_id);
}

async function lookup(token: string): Promise<CheckinPass | null> {
  const { data, error } = await supabaseAdmin().rpc(
    "checkin_lookup",
    { p_token: token }
  );

  if (error) {
    /* 42883 / PGRST202: supabase/event-checkin.sql has not been run. */
    if (error.code === "42883" || error.code === "PGRST202") {
      throw new Error(
        "Run supabase/event-checkin.sql to enable event entry."
      );
    }

    throw error;
  }

  return (data as CheckinPass | null) ?? null;
}

/*
 * GET /api/checkin?token=...
 *
 * What this pass is, and whether the holder is already inside.
 * Deliberately read-only: looking at a code must not admit anybody,
 * which is precisely what the old lookup did.
 */
export async function GET(request: Request) {
  const auth = await requireRole("volunteer", "admin", "faculty");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const token = new URL(request.url).searchParams
      .get("token")
      ?.trim();

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    const pass = await lookup(token);

    if (!pass) {
      return NextResponse.json(
        { error: "That QR code is not recognised" },
        { status: 404 }
      );
    }

    if (!(await mayAdmit(auth, pass))) {
      return NextResponse.json(
        {
          error:
            "This pass belongs to an event you do not coordinate.",
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, pass });
  } catch (error) {
    console.error("Check-in GET error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read that pass",
      },
      { status: 500 }
    );
  }
}

/*
 * POST /api/checkin  { token }
 *
 * Admit the holder. One entry per QR, ever.
 *
 * The uniqueness is the database's, not this function's: two
 * volunteers scanning the same pass at the same moment both reach the
 * insert, and exactly one of them wins. The loser gets the same
 * "already inside" answer as a late re-scan, which is the truth.
 */
export async function POST(request: Request) {
  const auth = await requireRole("volunteer", "admin", "faculty");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const body = await request.json().catch(() => ({}));

    const token =
      typeof body.token === "string" ? body.token.trim() : "";

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    const pass = await lookup(token);

    if (!pass) {
      return NextResponse.json(
        { error: "That QR code is not recognised" },
        { status: 404 }
      );
    }

    if (!(await mayAdmit(auth, pass))) {
      return NextResponse.json(
        {
          error:
            "This pass belongs to an event you do not coordinate.",
        },
        { status: 403 }
      );
    }

    if (pass.entered_at) {
      return NextResponse.json(
        {
          error: "Already checked in",
          alreadyEntered: true,
          enteredAt: pass.entered_at,
          pass,
        },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin().from("qr_scans").insert({
      registration_id: pass.id,
      /* Bigint upstream; the resolved slug lives on the registration. */
      event_id: pass.is_merch ? 513 : 514,
      /*
       * NOT NULL, and omitting it was rejecting every check-in with a
       * 500. It is also the useful column: it records which pass was
       * presented, not merely which registration it resolved to.
       */
      qr_token: token,
      scanned_at: new Date().toISOString(),
      scanned_by: auth.user.id,
    });

    if (error) {
      /* 23505: someone admitted them between the read and the write. */
      if (error.code === "23505") {
        const current = await lookup(token);

        return NextResponse.json(
          {
            error: "Already checked in",
            alreadyEntered: true,
            enteredAt: current?.entered_at ?? null,
            pass: current ?? pass,
          },
          { status: 409 }
        );
      }

      /*
       * A rejected insert here is a schema mismatch, not a user error.
       * Returning the database's own message beats a bare 500 that
       * tells a volunteer at a gate nothing at all.
       */
      return NextResponse.json(
        { error: `Could not record entry: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      enteredAt: new Date().toISOString(),
      pass: { ...pass, entered_at: new Date().toISOString() },
    });
  } catch (error) {
    console.error("Check-in POST error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to record entry",
      },
      { status: 500 }
    );
  }
}
