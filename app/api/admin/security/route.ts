import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export type StaffTwoFactor = {
  id: string;
  email: string;
  name: string | null;
  enrolled: boolean;
  /* When the earliest verified factor was set up, if any. */
  enrolledAt: string | null;
};

/*
 * GET /api/admin/security
 *
 * Which admins actually have two-factor set up, not just which
 * actions require it. requireAal2() in lib/auth.ts only ever checks
 * the caller's own session; there was nothing that let an admin see
 * whether the *other* admins on the account had enrolled at all.
 *
 * auth.admin.mfa.listFactors() takes a user id, not an email, so this
 * reads profiles (which already carries the auth.users id) rather
 * than staff_invites.
 */
export async function GET() {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const db = supabaseAdmin();

    const { data: admins, error } = await db
      .from("profiles")
      .select("id,email,full_name,role,roles,active")
      .eq("active", true);

    if (error) throw error;

    const adminProfiles = (admins ?? []).filter((profile) => {
      const roles =
        Array.isArray(profile.roles) && profile.roles.length > 0
          ? profile.roles
          : [profile.role];

      return roles.includes("admin");
    });

    const staff: StaffTwoFactor[] = await Promise.all(
      adminProfiles.map(async (profile) => {
        const { data, error: factorsError } =
          await db.auth.admin.mfa.listFactors({
            userId: profile.id,
          });

        /* A lookup failing for one account must not blank the whole
           list -- report them as unverifiable rather than drop them. */
        if (factorsError) {
          console.error(
            `MFA lookup failed for ${profile.email}:`,
            factorsError
          );

          return {
            id: profile.id,
            email: profile.email,
            name: profile.full_name,
            enrolled: false,
            enrolledAt: null,
          };
        }

        const verified = (data?.factors ?? [])
          .filter((factor) => factor.status === "verified")
          .sort((a, b) => a.created_at.localeCompare(b.created_at));

        return {
          id: profile.id,
          email: profile.email,
          name: profile.full_name,
          enrolled: verified.length > 0,
          enrolledAt: verified[0]?.created_at ?? null,
        };
      })
    );

    staff.sort((a, b) => a.email.localeCompare(b.email));

    return NextResponse.json({ success: true, staff });
  } catch (error) {
    console.error("Security API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read two-factor status",
      },
      { status: 500 }
    );
  }
}
