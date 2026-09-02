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

    /*
     * `roles` only exists after supabase/multi-role.sql. Without the
     * fallback a missing column would stop anyone signing in at all.
     */
    let { data: invite, error: inviteError } = await db
      .from("staff_invites")
      .select("role,roles,active")
      .eq("email", email)
      .maybeSingle();

    if (inviteError?.code === "42703") {
      ({ data: invite, error: inviteError } = await db
        .from("staff_invites")
        .select("role,active")
        .eq("email", email)
        .maybeSingle());
    }

    if (inviteError) {
      console.error("Staff invite lookup failed:", inviteError);

      return NextResponse.json(
        { error: "Unable to verify staff authorization" },
        { status: 500 }
      );
    }

    /*
     * No invitation: this is an ordinary attendee.
     *
     * Buyer is the default, and it is granted here rather than left to
     * a database trigger on auth.users. Whether that trigger exists has
     * never been confirmed, and without a profile row /auth/redirect
     * gives up after five polls and signs the person out with
     * ?error=profile -- a student turned away from their own pass.
     *
     * Only ever inserts. An existing profile is left exactly as it is,
     * so this can never demote an admin who happens to have no invite
     * row.
     */
    if (!invite) {
      const { data: existing, error: existingError } = await db
        .from("profiles")
        .select("id,role")
        .eq("id", user.id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        return NextResponse.json({
          success: true,
          invited: false,
          role: existing.role,
        });
      }

      const created = await db
        .from("profiles")
        .insert({ id: user.id, role: "buyer", roles: ["buyer"], active: true });

      /* 42703: `roles` is absent until supabase/multi-role.sql runs. */
      const { error: insertError } =
        created.error?.code === "42703"
          ? await db
              .from("profiles")
              .insert({ id: user.id, role: "buyer", active: true })
          : created;

      /*
       * 23505 means the database trigger got there first, which is the
       * outcome we wanted anyway.
       */
      if (insertError && insertError.code !== "23505") {
        throw insertError;
      }

      return NextResponse.json({
        success: true,
        invited: false,
        role: "buyer",
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
          ...(Array.isArray(invite.roles) &&
          invite.roles.length > 0
            ? { roles: invite.roles }
            : {}),
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
