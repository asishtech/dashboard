import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const STAFF_COLUMNS = "id,email,role,active,created_at";

/*
 * GET
 *
 * List the configured privileged emails.
 */
export async function GET() {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { data, error } = await supabaseAdmin()
      .from("staff_invites")
      .select(STAFF_COLUMNS)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      users: data ?? [],
    });
  } catch (error) {
    console.error("Admin users GET error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load users",
      },
      { status: 500 }
    );
  }
}

/*
 * POST
 *
 * Authorize a Google account as staff.
 *
 * Only the email and role are stored; the matching profile is
 * created by /api/auth/staff-sync when the person first signs in.
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

    const role =
      body.role === "admin"
        ? "admin"
        : body.role === "volunteer"
          ? "volunteer"
          : null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "A valid email is required" },
        { status: 400 }
      );
    }

    if (!role) {
      return NextResponse.json(
        { error: "Role must be admin or volunteer" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    const { data: existing, error: existingError } = await db
      .from("staff_invites")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      const { data, error } = await db
        .from("staff_invites")
        .update({ role, active: true })
        .eq("id", existing.id)
        .select(STAFF_COLUMNS)
        .single();

      if (error) throw error;

      return NextResponse.json({
        success: true,
        updated: true,
        user: data,
      });
    }

    const { data, error } = await db
      .from("staff_invites")
      .insert({ email, role, active: true })
      .select(STAFF_COLUMNS)
      .single();

    if (error) throw error;

    return NextResponse.json(
      { success: true, user: data },
      { status: 201 }
    );
  } catch (error) {
    console.error("Admin users POST error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to add staff member",
      },
      { status: 500 }
    );
  }
}

/*
 * PATCH
 *
 * Activate or deactivate a staff invite.
 *
 * The staff list already called this endpoint, but no handler
 * existed, so the enable/disable button returned 405.
 *
 * NOTE: this revokes the invite, not an already-provisioned
 * profile. Someone who has signed in keeps their role until
 * `profiles.active` is cleared for their user id as well.
 */
export async function PATCH(request: Request) {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const body = await request.json();

    const id = Number(body.id);
    const active = body.active;

    if (!Number.isFinite(id) || typeof active !== "boolean") {
      return NextResponse.json(
        { error: "id and active are required" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    const { data, error } = await db
      .from("staff_invites")
      .update({ active })
      .eq("id", id)
      .select(STAFF_COLUMNS)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: "Staff account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, user: data });
  } catch (error) {
    console.error("Admin users PATCH error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update staff member",
      },
      { status: 500 }
    );
  }
}
