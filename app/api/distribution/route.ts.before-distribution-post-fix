import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function getAdmin() {
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
                cookieStore.set(name, value, options)
            );
          } catch {
            // Server component/cookie restrictions can be ignored here.
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();

  if (
    profile?.role !== "admin" ||
    profile?.active !== true
  ) {
    return null;
  }

  return user;
}


/*
 * ADMIN:
 *
 * Toggle a merchandise item:
 *
 * GIVEN   -> PENDING
 * PENDING -> GIVEN
 */
export async function PATCH(
  request: Request
) {
  try {
    const admin = await getAdmin();

    if (!admin) {
      return NextResponse.json(
        {
          error: "Admin access required",
        },
        {
          status: 403,
        }
      );
    }

    const body = await request.json();

    const registrationItemId = Number(
      body.registrationItemId
    );

    const status =
      body.status === "GIVEN"
        ? "GIVEN"
        : body.status === "PENDING"
          ? "PENDING"
          : null;

    if (
      !registrationItemId ||
      !status
    ) {
      return NextResponse.json(
        {
          error:
            "registrationItemId and valid status are required",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: distribution,
      error: distributionError,
    } = await supabase
      .from("distributions")
      .select(
        "id,status,registration_item_id"
      )
      .eq(
        "registration_item_id",
        registrationItemId
      )
      .single();

    if (
      distributionError ||
      !distribution
    ) {
      return NextResponse.json(
        {
          error:
            "Distribution record not found",
        },
        {
          status: 404,
        }
      );
    }

    const updateData: Record<
      string,
      unknown
    > = {
      status,
      updated_at:
        new Date().toISOString(),
    };

    if (status === "GIVEN") {
      updateData.given_at =
        new Date().toISOString();
    } else {
      updateData.given_at = null;
    }

    const {
      data: updated,
      error: updateError,
    } = await supabase
      .from("distributions")
      .update(updateData)
      .eq(
        "id",
        distribution.id
      )
      .select(
        "id,status,registration_item_id,given_at,updated_at"
      )
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      distribution: updated,
    });

  } catch (error) {
    console.error(
      "Admin distribution update failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Distribution update failed",
      },
      {
        status: 500,
      }
    );
  }
}


/*
 * VOLUNTEER:
 *
 * Existing distribution action.
 */
export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const registrationItemId =
      Number(
        body.registrationItemId
      );

    if (!registrationItemId) {
      return NextResponse.json(
        {
          error:
            "Registration item is required",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: distribution,
      error:
        distributionError,
    } = await supabase
      .from("distributions")
      .select(
        "id,status,registration_item_id"
      )
      .eq(
        "registration_item_id",
        registrationItemId
      )
      .single();

    if (
      distributionError ||
      !distribution
    ) {
      return NextResponse.json(
        {
          error:
            "Distribution record not found",
        },
        {
          status: 404,
        }
      );
    }

    if (
      distribution.status ===
      "GIVEN"
    ) {
      return NextResponse.json(
        {
          error:
            "This item has already been given.",
        },
        {
          status: 409,
        }
      );
    }

    const {
      error: updateError,
    } = await supabase
      .from("distributions")
      .update({
        status: "GIVEN",
        given_at:
          new Date().toISOString(),
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        distribution.id
      )
      .eq(
        "status",
        "PENDING"
      );

    if (updateError) {
      throw updateError;
    }

    const {
      data: item,
    } = await supabase
      .from(
        "registration_items"
      )
      .select(
        "registration_id"
      )
      .eq(
        "id",
        registrationItemId
      )
      .single();

    if (!item) {
      throw new Error(
        "Registration item not found"
      );
    }

    const {
      data: registration,
    } = await supabase
      .from("registrations")
      .select(`
        registration_id,
        name,
        email,
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
      .eq(
        "id",
        item.registration_id
      )
      .single();

    return NextResponse.json({
      success: true,
      registration: {
        ...registration,
        items:
          registration?.items.map(
            (i: any) => ({
              ...i,
              status:
                i.distribution
                  ?.at(0)
                  ?.status ??
                "PENDING",
            })
          ) ?? [],
      },
    });

  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Distribution failed",
      },
      {
        status: 500,
      }
    );
  }
}
