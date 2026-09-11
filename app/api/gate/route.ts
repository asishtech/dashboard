import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { FEST_DAY_2_IST, festDaysOf, todayIst } from "@/lib/fest-days";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/* 42P01 / PGRST205: supabase/gate-log.sql has not been run. */
const MISSING = ["42P01", "PGRST205", "PGRST202"];

function notMigrated() {
  return NextResponse.json(
    {
      error:
        "Run supabase/gate-log.sql to record gate entry and exit.",
    },
    { status: 409 }
  );
}

/*
 * Whether this email owns at least one Day 2 event registration.
 *
 * Only asked once Day 1 is over -- see the entry check below. A
 * hostel-only or merchandise-only registration carries no event day
 * at all, so it answers no here, same as someone registered for Day 1
 * events alone.
 */
async function hasDay2Registration(
  db: ReturnType<typeof supabaseAdmin>,
  email: string
): Promise<boolean> {
  const regs = await db
    .from("registrations")
    .select("resolved_event_id")
    .ilike("email", email);

  if (regs.error) throw regs.error;

  const eventIds = [
    ...new Set(
      (regs.data ?? [])
        .map((row) => row.resolved_event_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  if (eventIds.length === 0) return false;

  const events = await db
    .from("events")
    .select("day")
    .in("event_id", eventIds);

  if (events.error) throw events.error;

  return (events.data ?? []).some((row) =>
    festDaysOf(row.day).has("D2")
  );
}

/*
 * POST /api/gate  { email, action: "enter" | "exit", name?, college? }
 *
 * A visitor through the front gate, or back out of it.
 *
 * Deliberately not /api/checkin. That endpoint admits one pass to one
 * event, and the desk was using it to let people onto the site --
 * which credited an event with an attendee who never went to it. The
 * gate is a different fact about a different thing, so it gets its
 * own table and its own route.
 *
 * Entry is date-gated: once Day 1 (11 Sept) has passed, only someone
 * registered for a Day 2 event may still come through -- see
 * hasDay2Registration() below. Exit never is.
 */
export async function POST(request: Request) {
  const auth = await requireRole("registrations", "admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const body = await request.json().catch(() => ({}));

    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "An email address is required" },
        { status: 400 }
      );
    }

    const by = auth.user.email ?? null;
    const db = supabaseAdmin();

    if (body.action === "exit") {
      /*
       * Stamp the open visit rather than delete it. Somebody who came
       * and left did come, and a count of who is in the building
       * needs both halves of that.
       */
      const { data, error } = await db
        .from("gate_log")
        .update({ exited_at: new Date().toISOString(), exited_by: by })
        .eq("email_key", email)
        .is("exited_at", null)
        .select("id,entered_at,exited_at")
        .maybeSingle();

      if (error && MISSING.includes(error.code ?? "")) {
        return notMigrated();
      }

      if (error) throw error;

      if (!data) {
        return NextResponse.json(
          {
            error:
              "They are not currently marked as inside, so there is nothing to mark out.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json({
        success: true,
        action: "exit",
        exitedAt: data.exited_at,
      });
    }

    /*
     * Day 1 is over: from here on the gate only admits people
     * registered for at least one Day 2 event, so a Day-1-only ticket
     * cannot walk back in on the strength of yesterday's admission.
     * Exit, above, is never gated -- somebody already inside must
     * always be able to leave.
     */
    if (
      todayIst() >= FEST_DAY_2_IST &&
      !(await hasDay2Registration(db, email))
    ) {
      return NextResponse.json(
        {
          error:
            "Day 1 has ended. The gate only admits people registered for at least one Day 2 event.",
          dayOneOnly: true,
        },
        { status: 403 }
      );
    }

    const { data, error } = await db
      .from("gate_log")
      .insert({
        email_key: email,
        name: body.name ? String(body.name) : null,
        college: body.college ? String(body.college) : null,
        entered_by: by,
      })
      .select("id,entered_at")
      .maybeSingle();

    /*
     * 23505 is the partial unique index: they already have an open
     * visit. Two volunteers pressing at once both reach the insert
     * and one loses, which is the same answer as pressing twice --
     * they are inside, and nothing changed.
     */
    if (error?.code === "23505") {
      const { data: open } = await db
        .from("gate_log")
        .select("entered_at")
        .eq("email_key", email)
        .is("exited_at", null)
        .maybeSingle();

      return NextResponse.json(
        {
          error: "Already inside",
          alreadyInside: true,
          enteredAt: open?.entered_at ?? null,
        },
        { status: 409 }
      );
    }

    if (error && MISSING.includes(error.code ?? "")) {
      return notMigrated();
    }

    if (error) throw error;

    return NextResponse.json({
      success: true,
      action: "enter",
      enteredAt: data?.entered_at ?? null,
    });
  } catch (error) {
    console.error("Gate error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not record that",
      },
      { status: 500 }
    );
  }
}
