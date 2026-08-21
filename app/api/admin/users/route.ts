import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function requireAdmin() {
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
              ({ name, value, options }) =>
                cookieStore.set(
                  name,
                  value,
                  options
                )
            );
          } catch {}
        },
      },
    }
  );

  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) return null;

  const { data: profile } =
    await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", user.id)
      .maybeSingle();

  if (
    profile?.role !== "admin" ||
    profile?.active !== true
  ) {
    return null;
  }

  return user;
}

/*
 * GET
 *
 * Show configured privileged emails.
 */
export async function GET() {
  try {
    const admin = await requireAdmin();

    if (!admin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const { data, error } =
      await supabase
        .from("staff_invites")
        .select(
          "id,email,role,active,created_at"
        )
        .order("created_at", {
          ascending: false,
        });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      users: data ?? [],
    });
  } catch (error) {
    console.error(
      "Admin users GET error:",
      error
    );

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
 * Admin only.
 *
 * We only store:
 *   email
 *   role
 *
 * The actual Google user/profile is
 * resolved when the person signs in.
 */
export async function POST(
  request: Request
) {
  try {
    const admin = await requireAdmin();

    if (!admin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

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

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (!role) {
      return NextResponse.json(
        {
          error:
            "Role must be admin or volunteer",
        },
        { status: 400 }
      );
    }

    const {
      data: existing,
      error: existingError,
    } = await supabase
      .from("staff_invites")
      .select("id,email,role,active")
      .eq("email", email)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      const { data, error } =
        await supabase
          .from("staff_invites")
          .update({
            role,
            active: true,
          })
          .eq("id", existing.id)
          .select(
            "id,email,role,active,created_at"
          )
          .single();

      if (error) throw error;

      return NextResponse.json({
        success: true,
        updated: true,
        user: data,
      });
    }

    const { data, error } =
      await supabase
        .from("staff_invites")
        .insert({
          email,
          role,
          active: true,
        })
        .select(
          "id,email,role,active,created_at"
        )
        .single();

    if (error) throw error;

    return NextResponse.json(
      {
        success: true,
        user: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Admin users POST error:",
      error
    );

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
