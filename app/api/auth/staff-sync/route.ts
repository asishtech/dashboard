import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const cookieStore = await cookies();

    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(
                ({ name, value, options }) => {
                  cookieStore.set(
                    name,
                    value,
                    options
                  );
                }
              );
            } catch {}
          },
        },
      }
    );

    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user?.email) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const email =
      user.email.trim().toLowerCase();

    /*
     * Check whether this Google account has
     * been explicitly authorized as staff.
     */
    const {
      data: invite,
      error: inviteError,
    } = await supabase
      .from("staff_invites")
      .select("email,role,active")
      .eq("email", email)
      .maybeSingle();

    if (inviteError) {
      console.error(
        "Staff invite lookup failed:",
        inviteError
      );

      return NextResponse.json(
        {
          error:
            "Unable to verify staff authorization",
        },
        { status: 500 }
      );
    }

    /*
     * No staff invitation.
     *
     * Do not modify the user's existing role.
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

    /*
     * The Google account is authorized.
     *
     * Create/update the profile using the
     * service-role server client.
     */
    const {
      error: profileError,
    } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          role: invite.role,
          active: true,
        },
        {
          onConflict: "id",
        }
      );

    if (profileError) {
      throw profileError;
    }

    return NextResponse.json({
      success: true,
      invited: true,
      active: true,
      role: invite.role,
    });
  } catch (error) {
    console.error(
      "Staff sync failed:",
      error
    );

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
