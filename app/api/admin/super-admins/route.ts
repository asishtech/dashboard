import { NextResponse } from "next/server";
import {
  requireAal2,
  requireRole,
  requireSuperAdmin,
} from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MISSING = ["42P01", "PGRST205"];

function notMigrated() {
  return NextResponse.json(
    { error: "Run supabase/super-admins.sql first." },
    { status: 409 }
  );
}

/*
 * GET /api/admin/super-admins
 *
 * Any admin may see who is on the list -- it is who can change
 * inventory or grant admin/coordinator access, and that is worth
 * being visible to every admin, not only the ones on it. Only being
 * on the list lets you change it, which POST and DELETE enforce.
 */
export async function GET() {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { data, error } = await supabaseAdmin()
      .from("super_admins")
      .select("email,added_at,added_by")
      .order("added_at", { ascending: true });

    if (error) {
      if (MISSING.includes(error.code ?? "")) {
        return notMigrated();
      }

      throw error;
    }

    const email = auth.user.email?.trim().toLowerCase();

    const canManage = (data ?? []).some(
      (row) => row.email === email
    );

    return NextResponse.json({
      success: true,
      superAdmins: data ?? [],
      canManage,
    });
  } catch (error) {
    console.error("Super admins GET error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read the allowlist",
      },
      { status: 500 }
    );
  }
}

/*
 * POST /api/admin/super-admins  { email }
 *
 * Add someone to the list. Only someone already on it may do this --
 * requireSuperAdmin() is the actual gate, requireRole("admin") is just
 * the outer one everything here shares.
 */
export async function POST(request: Request) {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  const superAdmin = await requireSuperAdmin(auth);

  if (superAdmin) {
    return superAdmin;
  }

  const stepUp = await requireAal2();

  if (stepUp) {
    return stepUp;
  }

  try {
    const body = await request.json();

    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();

    if (!EMAIL.test(email)) {
      return NextResponse.json(
        { error: "A valid email is required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin()
      .from("super_admins")
      .insert({ email, added_by: auth.user.email ?? null });

    if (error) {
      if (MISSING.includes(error.code ?? "")) {
        return notMigrated();
      }

      /* 23505: already on the list. */
      if (error.code !== "23505") {
        throw error;
      }
    }

    return NextResponse.json({ success: true, email });
  } catch (error) {
    console.error("Super admins POST error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to add that email",
      },
      { status: 500 }
    );
  }
}

/*
 * DELETE /api/admin/super-admins?email=...
 *
 * Remove someone. The list can never be emptied this way: if nobody
 * were left on it, nobody could ever add anyone back, and the
 * inventory and admin-granting routes would refuse everyone until a
 * migration was hand-run again.
 */
export async function DELETE(request: Request) {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  const superAdmin = await requireSuperAdmin(auth);

  if (superAdmin) {
    return superAdmin;
  }

  const stepUp = await requireAal2();

  if (stepUp) {
    return stepUp;
  }

  try {
    const email = (
      new URL(request.url).searchParams.get("email") ?? ""
    )
      .trim()
      .toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "An email is required" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    const { count, error: countError } = await db
      .from("super_admins")
      .select("email", { count: "exact", head: true });

    if (countError) {
      if (MISSING.includes(countError.code ?? "")) {
        return notMigrated();
      }

      throw countError;
    }

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        {
          error:
            "This is the only account on the list. Add another before removing this one.",
        },
        { status: 409 }
      );
    }

    const { data, error } = await db
      .from("super_admins")
      .delete()
      .eq("email", email)
      .select("email")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: "That email is not on the list" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, email });
  } catch (error) {
    console.error("Super admins DELETE error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to remove that email",
      },
      { status: 500 }
    );
  }
}
