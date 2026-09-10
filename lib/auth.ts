import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { supabaseAnonKey, supabaseUrl } from "./env";
import { supabaseAdmin } from "./supabase";
import { merchandiseEventIds } from "./events";
import { primaryRole, type Role } from "./roles";

export { primaryRole };

export type { Role };

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
 * True once we have seen that `profiles.roles` is absent.
 *
 * The multi-role migration adds that column. Selecting a column that
 * does not exist makes PostgREST reject the whole query, which would
 * mean nobody -- including the admin who has to run the migration --
 * could sign in. So the first failure is remembered and every later
 * read skips straight to the single-role shape.
 */
let rolesColumnMissing = false;

/* Postgres: undefined_column. */
const UNDEFINED_COLUMN = "42703";

type ProfileRow = {
  role: Role | null;
  roles?: Role[] | null;
  active: boolean | null;
};

async function readProfile(
  userId: string
): Promise<ProfileRow | null> {
  const db = supabaseAdmin();

  if (!rolesColumnMissing) {
    const { data, error } = await db
      .from("profiles")
      .select("role,roles,active")
      .eq("id", userId)
      .maybeSingle();

    if (!error) {
      return data as ProfileRow | null;
    }

    if (error.code !== UNDEFINED_COLUMN) {
      throw error;
    }

    console.warn(
      "profiles.roles is missing; falling back to the single role. Run supabase/multi-role.sql to enable role switching."
    );

    rolesColumnMissing = true;
  }

  const { data, error } = await db
    .from("profiles")
    .select("role,active")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ProfileRow | null;
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

  const profile = await readProfile(user.id);

  if (!profile?.active) {
    return null;
  }

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
  /*
   * A missing environment variable throws inside getSession, before
   * any handler has written a response. That surfaces as a 500 with an
   * empty body and "Unexpected end of JSON input" in the browser --
   * true, useless, and indistinguishable from a crash. Name it.
   */
  try {
    return await resolveRole(allowed);
  } catch (error) {
    console.error("Authorization failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Configuration error: ${error.message}`
            : "Authorization failed",
      },
      { status: 500 }
    );
  }
}

async function resolveRole(
  allowed: Role[]
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
 * Require that this session has actually proven a second factor, not
 * merely that the account has one enrolled.
 *
 * Call after requireRole(), never instead of it -- this answers "did
 * they verify a code this session", not "are they allowed here at
 * all". getAuthenticatorAssuranceLevel() reads the aal claim off the
 * session's own JWT, so a request cannot claim AAL2 by sending
 * anything in the body; it has to have actually completed
 * supabase.auth.mfa.verify() first; and that verification lives in
 * the session cookie, not the client.
 *
 * `nextLevel` distinguishes two different client experiences: 'aal2'
 * means a factor is enrolled and this request just needs a fresh
 * code, while staying at 'aal1' means nobody has enrolled one yet.
 * lib/use-step-up.ts branches on `enrolled` to show the right modal.
 */
export async function requireAal2(): Promise<NextResponse | null> {
  const supabase = await createSupabaseServer();

  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (error) {
    throw error;
  }

  if (data.currentLevel === "aal2") {
    return null;
  }

  return NextResponse.json(
    {
      error:
        data.nextLevel === "aal2"
          ? "This action requires a two-factor code."
          : "This action requires two-factor authentication to be set up first.",
      requiresStepUp: true,
      enrolled: data.nextLevel === "aal2",
    },
    { status: 403 }
  );
}

/*
 * A second, narrower gate on top of requireRole("admin") -- being
 * admin is not enough on its own for changing inventory or deciding
 * who else gets to be an admin or a coordinator. supabase/super-admins.sql
 * is the list; /admin/access and /api/admin/super-admins manage it.
 *
 * Checked by email against the service-role table rather than any
 * role or claim on the session, so the only way onto this gate is a
 * row an existing super admin put there.
 */
export async function requireSuperAdmin(
  session: Session
): Promise<NextResponse | null> {
  const email = session.user.email?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json(
      { error: "This account has no email on record." },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseAdmin()
    .from("super_admins")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  /* 42P01 / PGRST205: supabase/super-admins.sql has not been run.
     Refuse rather than let everyone through while it is missing --
     the whole point of this table is that admin alone is not enough,
     and a request cannot tell the difference between "not on the
     list" and "the list does not exist yet". */
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code ?? "")) {
      return NextResponse.json(
        {
          error:
            "Run supabase/super-admins.sql before this action can be used.",
        },
        { status: 409 }
      );
    }

    throw error;
  }

  if (!data) {
    return NextResponse.json(
      {
        error:
          "This action is restricted to a specific list of accounts. Ask one of them to add you from Security.",
      },
      { status: 403 }
    );
  }

  return null;
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

  /*
   * The registrations desk is not scoped to assignments either. The
   * point of the role is a whole-festival view; scoping it by
   * event_coordinators would hand it an empty list, since nobody puts
   * the desk down as a coordinator.
   */
  if (session.activeRole === "registrations") {
    return null;
  }

  const email = session.user.email?.trim().toLowerCase();

  if (!email) {
    return [];
  }

  /*
   * Volunteers are scoped by their own table, not by
   * event_coordinators -- a volunteer is not a coordinator, and
   * putting them in that table would list a first-year student as the
   * person responsible for an event.
   *
   * No rows means merchandise only, not no restriction. An admin who
   * has not yet limited a new volunteer to a particular event should
   * not have quietly handed them every event's door; merchandise is
   * the one thing safe to leave open by default, since handing over a
   * hoodie carries none of the risk an event's entry does.
   */
  if (session.activeRole === "volunteer") {
    const { data, error } = await supabaseAdmin()
      .from("event_volunteers")
      .select("event_id")
      .eq("email", email);

    /* 42P01: supabase/volunteer-scope.sql has not been run. Nothing
       is scoped yet, so nothing is restricted. */
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        return null;
      }

      throw error;
    }

    const scope = (data ?? []).map((row) => String(row.event_id));

    if (scope.length > 0) return scope;

    return [...(await merchandiseEventIds())];
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

/*
 * Whether this person may hand merchandise over the counter.
 *
 * Only volunteers are tested. An admin is unrestricted, and a
 * coordinator's scope lists the events they run rather than anything
 * about the merchandise counter -- testing them here would take the
 * counter away from staff who have been using it, to fix a problem
 * nobody reported.
 *
 * A volunteer with no scope defaults to merchandise (allowedEventIds()
 * puts it there), so this is almost always true for them too. A
 * volunteer scoped to particular events and not merchandise is the
 * one case this actually excludes.
 */
export async function canHandOutMerch(
  session: Session
): Promise<boolean> {
  if (session.activeRole !== "volunteer") return true;

  const allowed = await allowedEventIds(session);

  if (allowed === null) return true;

  const merch = await merchandiseEventIds();

  return allowed.some((eventId) => merch.has(eventId));
}
