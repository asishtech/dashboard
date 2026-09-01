import { NextResponse } from "next/server";
import { requireRole, type Role } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const STAFF_COLUMNS = "id,email,role,roles,active,created_at";

/* Roles an admin may hand out from the staff screen. */
const ASSIGNABLE: Role[] = [
  "admin",
  "faculty",
  "volunteer",
  "buyer",
];

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

    /*
     * `roles` is the set; `role` remains accepted so older callers
     * keep working. A database trigger derives the primary role from
     * the set, so nothing here has to.
     */
    const requested: Role[] = Array.isArray(body.roles)
      ? body.roles
      : body.role
        ? [body.role]
        : [];

    const roles = requested.filter((r) =>
      ASSIGNABLE.includes(r)
    ) as Role[];

    const role: Role | null = roles.length > 0 ? roles[0] : null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "A valid email is required" },
        { status: 400 }
      );
    }

    if (!role) {
      return NextResponse.json(
        {
          error: `Pick at least one role from: ${ASSIGNABLE.join(", ")}`,
        },
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
        .update({ roles, active: true })
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
      .insert({ email, roles, active: true })
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
 * Change someone's role, their access, or both.
 *
 * Writes `staff_invites` and, when the person has already signed in,
 * the `profiles` row that actually gates access. Updating only the
 * invite would leave them on their old role until they next sign in.
 */
export async function PATCH(request: Request) {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const body = await request.json();

    const id = Number(body.id);

    if (!Number.isFinite(id)) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const patch: { active?: boolean; roles?: Role[] } = {};

    if (typeof body.active === "boolean") {
      patch.active = body.active;
    }

    if (body.roles !== undefined) {
      const next = (
        Array.isArray(body.roles) ? body.roles : []
      ).filter((r: Role) => ASSIGNABLE.includes(r)) as Role[];

      if (next.length === 0) {
        return NextResponse.json(
          {
            error:
              "Keep at least one role. Untick the access box to remove them instead.",
          },
          { status: 400 }
        );
      }

      patch.roles = next;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "Nothing to change" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    const { data: target, error: targetError } = await db
      .from("staff_invites")
      .select("id,email,role,roles")
      .eq("id", id)
      .maybeSingle();

    if (targetError) throw targetError;

    if (!target) {
      return NextResponse.json(
        { error: "Staff account not found" },
        { status: 404 }
      );
    }

    /*
     * Do not let an admin lock themselves out. Demoting or disabling
     * your own account logs you out of the only screen that could
     * undo it, which then needs a hand-written SQL statement to fix.
     */
    const self =
      auth.user.email?.trim().toLowerCase() ===
      String(target.email).trim().toLowerCase();

    if (
      self &&
      (patch.active === false ||
        (patch.roles && !patch.roles.includes("admin")))
    ) {
      return NextResponse.json(
        {
          error:
            "You cannot change your own role or disable your own account. Ask another admin.",
        },
        { status: 409 }
      );
    }

    /*
     * The last admin must stay an admin, or nobody can administer
     * anything.
     */
    const targetIsAdmin = (
      Array.isArray(target.roles) && target.roles.length > 0
        ? target.roles
        : [target.role]
    ).includes("admin");

    if (
      targetIsAdmin &&
      (patch.active === false ||
        (patch.roles && !patch.roles.includes("admin")))
    ) {
      const { count, error: countError } = await db
        .from("staff_invites")
        .select("id", { count: "exact", head: true })
        .contains("roles", ["admin"])
        .eq("active", true);

      if (countError) throw countError;

      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          {
            error:
              "This is the only active admin. Promote someone else first.",
          },
          { status: 409 }
        );
      }
    }

    const { data, error } = await db
      .from("staff_invites")
      .update(patch)
      .eq("id", id)
      .select(STAFF_COLUMNS)
      .maybeSingle();

    if (error) throw error;

    /*
     * `staff_invites` only takes effect at next sign-in. `profiles`
     * is what actually gates access, so someone already signed in
     * keeps their old role until this runs too.
     */
    if (patch.roles || patch.active === false) {
      const { data: authUser } = await db.auth.admin.listUsers();

      const match = authUser?.users?.find(
        (u) =>
          u.email?.trim().toLowerCase() ===
          String(target.email).trim().toLowerCase()
      );

      if (match) {
        const { error: profileError } = await db
          .from("profiles")
          .update({
            ...(patch.roles ? { roles: patch.roles } : {}),
            ...(patch.active !== undefined
              ? { active: patch.active }
              : {}),
          })
          .eq("id", match.id);

        if (profileError) {
          console.error(
            "Invite updated but profile did not:",
            profileError
          );
        }
      }
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
