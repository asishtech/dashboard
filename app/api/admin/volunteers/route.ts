import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { HOSTEL_SOURCE_ID, merchandiseEventIds } from "@/lib/events";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/* 42P01 / PGRST205: supabase/volunteer-scope.sql has not been run. */
const MISSING = ["42P01", "PGRST205"];

function notMigrated() {
  return NextResponse.json(
    {
      error:
        "Run supabase/volunteer-scope.sql to scope volunteers to events.",
    },
    { status: 409 }
  );
}

/*
 * GET /api/admin/volunteers
 *
 * Every volunteer's scope, and the events there are to choose from.
 *
 * An address with no rows defaults to merchandise only, not
 * unrestricted -- see allowedEventIds() in lib/auth.ts. The screen
 * says so explicitly, because a default and a chosen scope of one
 * look identical as a blank cell.
 */
export async function GET() {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const db = supabaseAdmin();

    const [scopes, events, merch] = await Promise.all([
      db.from("event_volunteers").select("email,event_id"),
      db
        .from("events")
        .select("event_id,name,day")
        .order("name"),
      merchandiseEventIds(),
    ]);

    if (scopes.error) {
      if (MISSING.includes(scopes.error.code ?? "")) {
        return notMigrated();
      }

      throw scopes.error;
    }

    if (events.error) throw events.error;

    const byEmail = new Map<string, string[]>();

    for (const row of (scopes.data ?? []) as {
      email: string;
      event_id: string;
    }[]) {
      const key = row.email.toLowerCase();
      const list = byEmail.get(key) ?? [];

      list.push(String(row.event_id));
      byEmail.set(key, list);
    }

    return NextResponse.json({
      success: true,
      scopes: [...byEmail.entries()].map(([email, eventIds]) => ({
        email,
        eventIds,
      })),
      /* Merchandise and Hostel are listed like any other event,
         because that is exactly what they are here: a scope of one. */
      events: (events.data ?? []).map((event) => ({
        event_id: String(event.event_id),
        name: String(event.name),
        day: event.day ?? null,
        isMerch: merch.has(String(event.event_id)),
        isHostel: String(event.event_id) === HOSTEL_SOURCE_ID,
      })),
    });
  } catch (error) {
    console.error("Volunteer scope GET error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read volunteer scopes",
      },
      { status: 500 }
    );
  }
}

/*
 * PUT /api/admin/volunteers  { email, eventIds }
 *
 * Replace one volunteer's scope. An empty list removes the scope
 * entirely, which returns them to the merchandise-only default -- said
 * plainly in the response (merchOnly) so the screen can say it too
 * rather than showing an empty list that looks like a lockout.
 */
export async function PUT(request: Request) {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const body = await request.json().catch(() => ({}));

    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();

    if (!email.includes("@")) {
      return NextResponse.json(
        { error: "A volunteer's email address is required" },
        { status: 400 }
      );
    }

    const eventIds: string[] = Array.isArray(body.eventIds)
      ? [
          ...new Set(
            (body.eventIds as unknown[]).map((id) =>
              String(id).trim()
            )
          ),
        ].filter((id) => id.length > 0)
      : [];

    const db = supabaseAdmin();

    /*
     * Grant the volunteer role itself, the same way granting a
     * coordinator's event also grants "faculty" in
     * app/api/admin/coordinators. Without this, scoping someone here
     * who was never separately invited from the Staff screen leaves
     * them with a row in event_volunteers and no way to ever sign in
     * as a volunteer at all.
     */
    const { data: invite, error: inviteError } = await db
      .from("staff_invites")
      .select("id,role,roles")
      .eq("email", email)
      .maybeSingle();

    if (inviteError) throw inviteError;

    if (!invite) {
      const { error } = await db.from("staff_invites").insert({
        email,
        role: "volunteer",
        roles: ["volunteer"],
        active: true,
      });

      if (error) throw error;
    } else {
      const currentRoles = (
        Array.isArray(invite.roles) && invite.roles.length > 0
          ? invite.roles
          : [invite.role]
      ).filter(Boolean);

      const nextRoles = currentRoles.includes("volunteer")
        ? currentRoles
        : [...currentRoles, "volunteer"];

      const { error } = await db
        .from("staff_invites")
        .update({ roles: nextRoles, active: true })
        .eq("id", invite.id);

      if (error) throw error;
    }

    /*
     * Replace rather than merge: the screen sends the whole scope, so
     * unticking an event has to remove it. Delete first, then insert
     * -- two statements, and between them the volunteer is briefly
     * unrestricted rather than briefly locked out, which is the safer
     * way round for a door with a queue at it.
     */
    const removed = await db
      .from("event_volunteers")
      .delete()
      .eq("email", email);

    if (removed.error) {
      if (MISSING.includes(removed.error.code ?? "")) {
        return notMigrated();
      }

      throw removed.error;
    }

    if (eventIds.length > 0) {
      const { error } = await db.from("event_volunteers").insert(
        eventIds.map((eventId) => ({
          email,
          event_id: eventId,
          created_by: auth.user.email ?? null,
        }))
      );

      /* 23503: an event_id that is not in `events`. */
      if (error?.code === "23503") {
        return NextResponse.json(
          {
            error:
              "One of those events no longer exists. Reload and try again.",
          },
          { status: 409 }
        );
      }

      if (error) throw error;
    }

    return NextResponse.json({
      success: true,
      email,
      eventIds,
      merchOnly: eventIds.length === 0,
    });
  } catch (error) {
    console.error("Volunteer scope PUT error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save that scope",
      },
      { status: 500 }
    );
  }
}
