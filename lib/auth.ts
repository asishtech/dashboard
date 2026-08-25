import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { supabaseAnonKey, supabaseUrl } from "./env";
import { supabaseAdmin } from "./supabase";

export type Role = "admin" | "volunteer" | "buyer";

export type Profile = {
  role: Role;
  active: boolean;
};

export type Session = {
  user: User;
  profile: Profile;
};

/*
 * Request-scoped Supabase client that reads and refreshes the
 * caller's auth cookies. Row level security applies, so this is
 * the right client for anything acting *as* the signed-in user.
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },

      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /*
           * Server components get a read-only cookie store.
           * The proxy refreshes the session instead.
           */
        }
      },
    },
  });
}

/*
 * Resolve the signed-in user together with their profile.
 *
 * Returns null when the caller is anonymous, has no profile, or
 * has been deactivated. The profile is read with the service-role
 * client so authorization does not depend on the `profiles` RLS
 * policy being permissive enough to read one's own row.
 */
export async function getSession(): Promise<Session | null> {
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabaseAdmin()
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.active) {
    return null;
  }

  return { user, profile: profile as Profile };
}

/*
 * Authorize an API route.
 *
 * Resolves to a `Session` when the caller holds one of the
 * allowed roles, or to a ready-to-return error response.
 *
 * Usage:
 *   const auth = await requireRole("admin");
 *   if (auth instanceof NextResponse) return auth;
 */
export async function requireRole(
  ...allowed: Role[]
): Promise<Session | NextResponse> {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  if (!allowed.includes(session.profile.role)) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  return session;
}
