import {
  createServerClient,
} from "@supabase/ssr";

import {
  NextResponse,
} from "next/server";

import type {
  NextRequest,
} from "next/server";


export async function proxy(
  request: NextRequest
) {
  let response =
    NextResponse.next({
      request,
    });

  const supabase =
    createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },

          setAll(cookiesToSet) {
            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                request.cookies.set(
                  name,
                  value
                );

                response =
                  NextResponse.next({
                    request,
                  });

                response.cookies.set(
                  name,
                  value,
                  options
                );
              }
            );
          },
        },
      }
    );

  const {
    data: {
      user,
    },
  } =
    await supabase.auth.getUser();

  const path =
    request.nextUrl.pathname;


  /*
   * Public authentication routes.
   */
  const isAuthRoute =
    path === "/login" ||
    path.startsWith("/auth/");


  if (isAuthRoute) {
    return response;
  }


  /*
   * Buyer QR pages are NOT public.
   */
  const isClaimRoute =
    path.startsWith("/claim/");


  /*
   * Everything except authentication
   * requires a Google login.
   */
  if (!user) {

    const loginUrl =
      new URL(
        "/login",
        request.url
      );

    loginUrl.searchParams.set(
      "next",
      path
    );

    return NextResponse.redirect(
      loginUrl
    );
  }


  /*
   * Get role.
   */
  const {
    data: profile,
    error,
  } =
    await supabase
      .from("profiles")
      .select(
        "role,active"
      )
      .eq(
        "id",
        user.id
      )
      .single();


  if (
    error ||
    !profile ||
    !profile.active
  ) {

    await supabase.auth.signOut();

    return NextResponse.redirect(
      new URL(
        "/login?error=unauthorized",
        request.url
      )
    );
  }


  const isAdmin =
    path.startsWith("/admin");

  const isVolunteer =
    path.startsWith("/volunteer");

  const isBuyer =
    path.startsWith("/buyer");


  /*
   * Admin.
   */
  if (isAdmin) {

    if (
      profile.role !== "admin"
    ) {
      return redirectByRole(
        profile.role,
        request
      );
    }

    return response;
  }


  /*
   * Volunteer.
   */
  if (isVolunteer) {

    if (
      profile.role !== "volunteer" &&
      profile.role !== "admin"
    ) {
      return redirectByRole(
        profile.role,
        request
      );
    }

    return response;
  }


  /*
   * Buyer.
   */
  if (isBuyer) {

    if (
      profile.role !== "buyer" &&
      profile.role !== "admin"
    ) {
      return redirectByRole(
        profile.role,
        request
      );
    }

    return response;
  }


  /*
   * Claim QR.
   *
   * Authentication is required here.
   * The actual page will additionally
   * verify the buyer email.
   */
  if (isClaimRoute) {
    return response;
  }


  /*
   * Root:
   *
   * Nobody gets the dashboard without
   * authentication.
   */
  if (path === "/") {

    return redirectByRole(
      profile.role,
      request
    );
  }


  return response;
}


function redirectByRole(
  role: string,
  request: NextRequest
) {

  let destination =
    "/login";

  if (role === "admin") {
    destination = "/admin";
  }

  else if (
    role === "volunteer"
  ) {
    destination = "/volunteer";
  }

  else if (
    role === "buyer"
  ) {
    destination = "/buyer";
  }

  return NextResponse.redirect(
    new URL(
      destination,
      request.url
    )
  );
}


export const config = {
  matcher: [
    /*
     * Run on everything except
     * static Next.js assets.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
