import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, ROLE_COOKIE, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";

/*
 * GET  -- which roles this account holds, and which is active.
 * POST -- switch the active role.
 *
 * The cookie is only ever written after checking the requested role
 * against the set on the profile. A browser can ask to be a faculty
 * member; it cannot ask to be an admin it was not granted.
 */
export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      roles: session.profile.roles,
      activeRole: session.activeRole,
    });
  } catch (error) {
    /*
     * Unwrapped, this threw before writing a body, and the browser
     * reported "Unexpected end of JSON input" -- which says nothing
     * about the cause. The usual cause is a missing environment
     * variable on a new deployment: getSession only reaches
     * supabaseAdmin() once somebody is signed in, so the route answers
     * 401 perfectly well right up until it matters.
     */
    console.error("Role lookup failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read your roles",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const role = body.role as Role;

    if (!role || !session.profile.roles.includes(role)) {
      return NextResponse.json(
        { error: "You do not have that role" },
        { status: 403 }
      );
    }

    const store = await cookies();

    store.set(ROLE_COOKIE, role, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      /* Same horizon as a working day; re-validated per request. */
      maxAge: 60 * 60 * 12,
    });

    return NextResponse.json({ success: true, activeRole: role });
  } catch (error) {
    console.error("Role switch failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to switch role",
      },
      { status: 500 }
    );
  }
}
