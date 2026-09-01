import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { supabaseAnonKey, supabaseUrl } from "./env";
import { supabaseAdmin } from "./supabase";

export type Role =
  | "admin"
  | "volunteer"
  | "buyer"
  /*
   * Event coordinators, staff and student alike. The assignment
   * table is still `event_coordinators` because that describes the
   * relationship (who runs which event); this is the role they sign
   * in as.
   */
  | "faculty";

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

/*
 * Events a coordinator is allowed to see.
 *
 * Admins are not restricted; everyone else is limited to their
 * explicit assignments in `event_coordinators`. Returning null means
 * "no restriction", which is different from returning [] ("assigned
 * to nothing"), and the two must not be conflated -- collapsing them
 * would hand a coordinator with no assignments the full dataset.
 */
export async function allowedEventIds(
  session: Session
): Promise<string[] | null> {
  /*
   * Admin is a superset. Someone can be both an admin and listed as
   * an event's coordinator; the admin role wins and they see
   * everything.
   */
  if (session.profile.role === "admin") {
    return null;
  }

  const email = session.user.email?.trim().toLowerCase();

  if (!email) {
    return [];
  }

  const { data, error } = await supabaseAdmin()
    .from("event_coordinators")
    .select("event_id")
    .eq("email", email);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => String(row.event_id));
}

/*
 * Whether this session may read a specific event.
 */
export async function canReadEvent(
  session: Session,
  eventId: string
): Promise<boolean> {
  const allowed = await allowedEventIds(session);

  return allowed === null || allowed.includes(eventId);
}
