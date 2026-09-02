import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/*
 * Paths whose handling depends on the caller's role.
 *
 * Everything else that needs authorization (the /claim pages,
 * every /api route) checks for itself, so the proxy does not
 * spend a database round-trip on them.
 */
function needsRole(path: string) {
  return (
    path === "/" ||
    path.startsWith("/admin") ||
    path.startsWith("/volunteer") ||
    path.startsWith("/buyer") ||
    path.startsWith("/events")
  );
}

function destinationFor(role: string) {
  if (role === "admin") return "/admin";
  if (role === "volunteer") return "/volunteer";
  if (role === "faculty") return "/events";
  if (role === "buyer") return "/buyer";

  return "/login";
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  /*
   * API routes authorize themselves and refresh their own
   * session, so running the auth stack here as well would
   * just double the work on every request.
   */
  if (path.startsWith("/api/")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  /*
   * `getClaims` verifies the JWT locally when the project uses
   * asymmetric signing keys, which removes a network round-trip
   * to the Auth server on every navigation. With symmetric keys
   * it falls back to `getUser`, so this is never slower.
   */
  const { data } = await supabase.auth.getClaims();

  const claims = data?.claims ?? null;

  /*
   * Public authentication routes. Reached after the call above
   * so that an expiring session still gets refreshed here.
   */
  if (path === "/login" || path.startsWith("/auth/")) {
    return response;
  }

  if (!claims) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", path);

    return redirectPreservingCookies(loginUrl, response);
  }

  if (!needsRole(path)) {
    return response;
  }

  /*
   * `roles` only exists after supabase/multi-role.sql. Selecting a
   * missing column makes PostgREST reject the query, which here would
   * sign everybody out, so fall back to the single-role shape.
   */
  let { data: profile } = await supabase
    .from("profiles")
    .select("role,roles,active")
    .eq("id", claims.sub)
    .maybeSingle();

  if (!profile) {
    ({ data: profile } = await supabase
      .from("profiles")
      .select("role,active")
      .eq("id", claims.sub)
      .maybeSingle());
  }

  /*
   * No profile row is not the same as a revoked one.
   *
   * On first sign-in the row does not exist yet -- it is written a
   * moment later by /auth/redirect via staff-sync, or by the database
   * for buyers. Signing out here destroyed that first session, which
   * is why signing in appeared to need two attempts: the second
   * worked only because the first had created the row on its way out.
   *
   * So: send them to the page whose job is to provision the profile,
   * and keep the session. Only an existing-but-deactivated profile is
   * a real revocation worth signing out for.
   */
  if (!profile) {
    return redirectPreservingCookies(
      new URL("/auth/redirect", request.url),
      response
    );
  }

  if (!profile.active) {
    await supabase.auth.signOut();

    return redirectPreservingCookies(
      new URL("/login?error=unauthorized", request.url),
      response
    );
  }

  /*
   * Route by the *active* role, matching what the API enforces. The
   * cookie only selects among roles the profile actually holds;
   * anything else falls back to the primary one, so a forged cookie
   * gains nothing.
   */
  const held: string[] =
    Array.isArray(profile.roles) && profile.roles.length > 0
      ? (profile.roles as string[])
      : [profile.role as string].filter(Boolean);

  const requested = request.cookies.get(
    "vtapp_active_role"
  )?.value;

  const role =
    requested && held.includes(requested)
      ? requested
      : (["admin", "faculty", "volunteer", "buyer"].find((r) =>
          held.includes(r)
        ) ??
        (profile.role as string));

  if (path.startsWith("/admin") && role !== "admin") {
    return redirectPreservingCookies(
      new URL(destinationFor(role), request.url),
      response
    );
  }

  /*
   * The scanner is shared. A club coordinator admits their own event's
   * attendees; /api/checkin scopes them to it, this only decides who
   * may open the screen.
   */
  if (
    path.startsWith("/volunteer") &&
    role !== "volunteer" &&
    role !== "admin" &&
    role !== "faculty"
  ) {
    return redirectPreservingCookies(
      new URL(destinationFor(role), request.url),
      response
    );
  }

  if (
    path.startsWith("/buyer") &&
    role !== "buyer" &&
    role !== "admin"
  ) {
    return redirectPreservingCookies(
      new URL(destinationFor(role), request.url),
      response
    );
  }

  /*
   * Events are shared between admins and club coordinators. The API
   * scopes a coordinator to their own assignments; this only decides
   * who may open the page at all.
   */
  if (
    path.startsWith("/events") &&
    role !== "admin" &&
    role !== "faculty"
  ) {
    return redirectPreservingCookies(
      new URL(destinationFor(role), request.url),
      response
    );
  }

  if (path === "/") {
    return redirectPreservingCookies(
      new URL(destinationFor(role), request.url),
      response
    );
  }

  return response;
}

/*
 * A redirect built from scratch would drop any refreshed (or
 * cleared) auth cookies that Supabase wrote onto `response`.
 */
function redirectPreservingCookies(
  url: URL,
  response: NextResponse
) {
  const redirect = NextResponse.redirect(url);

  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }

  return redirect;
}

export const config = {
  matcher: [
    /*
     * Everything except Next.js internals and static files.
     *
     * The previous matcher let every request for a file in
     * /public through, so serving an icon cost a session
     * lookup plus a `profiles` query.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|json|webmanifest)$).*)",
  ],
};
