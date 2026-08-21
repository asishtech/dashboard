import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      registration_id: string;
    }>;
  }
) {
  try {
    const { registration_id } = await params;

    if (!registration_id) {
      return NextResponse.json(
        {
          error: "Registration ID is required",
        },
        {
          status: 400,
        }
      );
    }

    const { data, error } = await supabase
      .from("registrations")
      .select(`
        registration_id,
        name,
        email,
        total,
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
      .eq("registration_id", registration_id)
      .single();

    if (error || !data) {
      console.error(
        "Registration lookup error:",
        error
      );

      return NextResponse.json(
        {
          error: "Registration not found",
        },
        {
          status: 404,
        }
      );
    }

    const items = (data.items ?? []).map(
      (item: any) => {
        const distributions =
          Array.isArray(item.distribution)
            ? item.distribution
            : [];

        const given =
          distributions.filter(
            (distribution: any) =>
              distribution.status === "GIVEN"
          ).length;

        return {
          id: item.id,
          item: item.item,
          size: item.size,
          quantity: Number(
            item.quantity ?? 1
          ),
          status:
            given >=
            Number(item.quantity ?? 1)
              ? "GIVEN"
              : "PENDING",
        };
      }
    );

    const totalItems = items.reduce(
      (sum, item) =>
        sum + Number(item.quantity ?? 0),
      0
    );

    const givenItems = items.reduce(
      (sum, item) =>
        sum +
        (item.status === "GIVEN"
          ? Number(item.quantity ?? 0)
          : 0),
      0
    );

    return NextResponse.json({
      success: true,

      registration: {
        registration_id:
          data.registration_id,

        name: data.name,

        email: data.email,

        total: Number(
          data.total ?? 0
        ),

        qr_token:
          data.qr_token,

        items,

        distribution: {
          total: totalItems,
          given: givenItems,
          pending:
            Math.max(
              totalItems -
                givenItems,
              0
            ),
        },
      },
    });
  } catch (error) {
    console.error(
      "Registration detail API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load registration",
      },
      {
        status: 500,
      }
    );
  }
}
