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
  /* Primary role, the highest-privilege one they hold. */
  role: Role;
  /* Every role they may use. */
  roles: Role[];
  active: boolean;
};

export type Session = {
  user: User;
  profile: Profile;

  /*
   * The role this request acts as. Chosen by the user from the roles
   * they hold, and re-validated here on every request -- the cookie
   * is a request, not a grant.
   */
  activeRole: Role;
};

/* Cookie carrying the chosen role. Value is never trusted as-is. */
export const ROLE_COOKIE = "vtapp_active_role";

/*
 * Highest privilege first. Used to pick a default when no role has
 * been chosen, and to resolve the primary role.
 */
const ROLE_ORDER: Role[] = [
  "admin",
  "faculty",
  "volunteer",
  "buyer",
];

export function primaryRole(roles: Role[]): Role | null {
  for (const r of ROLE_ORDER) {
    if (roles.includes(r)) return r;
  }

  return roles[0] ?? null;
}

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
    .select("role,roles,active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.active) {
    return null;
  }

  /*
   * `roles` was added later, so fall back to the single `role` for
   * any row a migration has not reached.
   */
  const roles = (
    Array.isArray(profile.roles) && profile.roles.length > 0
      ? profile.roles
      : [profile.role]
  ).filter(Boolean) as Role[];

  if (roles.length === 0) {
    return null;
  }

  /*
   * Resolve the active role. The cookie only decides *which of their
   * own roles* applies; anything it asks for that they do not hold is
   * discarded and the primary role is used instead.
   */
  const cookieStore = await cookies();
  const requested = cookieStore.get(ROLE_COOKIE)?.value as
    | Role
    | undefined;

  const activeRole =
    requested && roles.includes(requested)
      ? requested
      : (primaryRole(roles) as Role);

  return {
    user,
    profile: {
      role: (profile.role ?? activeRole) as Role,
      roles,
      active: profile.active,
    },
    activeRole,
  };
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

  /*
   * Deliberately the active role, not the set. Switching to Faculty
   * is meant to actually reduce what you can reach, otherwise the
   * switcher is decoration.
   */
  if (!allowed.includes(session.activeRole)) {
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
  if (session.activeRole === "admin") {
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
