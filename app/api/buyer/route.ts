import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function getSupabase() {

  const cookieStore =
    await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {

        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {

          cookiesToSet.forEach(
            ({
              name,
              value,
              options,
            }) => {

              cookieStore.set(
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
}


export async function GET() {

  try {

    const supabase =
      await getSupabase();


    const {
      data: {
        user,
      },
    } =
      await supabase.auth.getUser();


    if (!user) {

      return NextResponse.json(
        {
          error:
            "Not authenticated",
        },
        {
          status: 401,
        }
      );

    }


    const email =
      user.email?.trim()
        .toLowerCase();


    if (!email) {

      return NextResponse.json(
        {
          error:
            "Google account has no email",
        },
        {
          status: 400,
        }
      );

    }


    /*
     * IMPORTANT:
     *
     * Only return registrations belonging
     * to the authenticated Google email.
     */

    const {
      data,
      error,
    } =
      await supabase
        .from("registrations")
        .select(`
          id,
          registration_id,
          name,
          email,
          ticket,
          qr_token,
          items:registration_items(
            id,
            item,
            size,
            quantity,
            distribution:distributions(
              status
            )
          )
        `)
        .ilike(
          "email",
          email
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        );


    if (error) {

      throw error;

    }


    const registrations =
      (data ?? []).map(
        (registration: any) => {

          return {
            ...registration,

            items:
              (
                registration.items ??
                []
              ).map(
                (item: any) => {

                  const distribution =
                    Array.isArray(
                      item.distribution
                    )
                      ? item.distribution
                      : item.distribution
                        ? [
                            item.distribution,
                          ]
                        : [];

                  return {
                    ...item,

                    status:
                      distribution.some(
                        (d: any) =>
                          d.status ===
                          "GIVEN"
                      )
                        ? "GIVEN"
                        : "PENDING",
                  };

                }
              ),
          };

        }
      );


    return NextResponse.json({
      registrations,
    });

  } catch (error) {

    console.error(
      "Buyer API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load buyer data",
      },
      {
        status: 500,
      }
    );

  }
}
