import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/*
 * Runs right after sign-in.
 *
 * This is what grants a role, so it cannot use `requireRole`:
 * the caller only needs to be authenticated. Authorization comes
 * from the `staff_invites` table, never from the request body.
 */
export async function POST() {
  try {
    const authClient = await createSupabaseServer();

    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user?.email) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const email = user.email.trim().toLowerCase();

    const db = supabaseAdmin();

    const { data: invite, error: inviteError } = await db
      .from("staff_invites")
      .select("role,roles,active")
      .eq("email", email)
      .maybeSingle();

    if (inviteError) {
      console.error("Staff invite lookup failed:", inviteError);

      return NextResponse.json(
        { error: "Unable to verify staff authorization" },
        { status: 500 }
      );
    }

    /*
     * No invitation: leave any existing role untouched.
     */
    if (!invite) {
      return NextResponse.json({
        success: true,
        invited: false,
      });
    }

    if (!invite.active) {
      return NextResponse.json({
        success: true,
        invited: true,
        active: false,
      });
    }

    const { error: profileError } = await db
      .from("profiles")
      .upsert(
        {
          id: user.id,
          /*
           * Copy the whole set. Sending only the primary role would
           * quietly drop every other role the moment they signed in.
           */
          roles:
            Array.isArray(invite.roles) && invite.roles.length > 0
              ? invite.roles
              : [invite.role],
          role: invite.role,
          active: true,
        },
        { onConflict: "id" }
      );

    if (profileError) {
      throw profileError;
    }

    return NextResponse.json({
      success: true,
      invited: true,
      active: true,
      role: invite.role,
      roles: invite.roles ?? [invite.role],
    });
  } catch (error) {
    console.error("Staff sync failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Staff synchronization failed",
      },
      { status: 500 }
    );
  }
}
