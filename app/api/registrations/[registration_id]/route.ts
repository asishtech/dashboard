import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ItemRow = {
  id: number;
  item: string;
  size: string | null;
  quantity: number | string | null;
  distribution:
    | { status: string | null }[]
    | { status: string | null }
    | null;
};

function toArray(distribution: ItemRow["distribution"]) {
  if (Array.isArray(distribution)) {
    return distribution;
  }

  return distribution ? [distribution] : [];
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ registration_id: string }> }
) {
  const auth = await requireRole("admin", "registrations");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { registration_id } = await params;

    if (!registration_id) {
      return NextResponse.json(
        { error: "Registration ID is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin()
      .from("registrations")
      .select(
        `
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
          distribution:distributions(status)
        )
      `
      )
      .eq("registration_id", registration_id)
      .maybeSingle();

    if (error) {
      console.error("Registration lookup error:", error);
    }

    if (error || !data) {
      return NextResponse.json(
        { error: "Registration not found" },
        { status: 404 }
      );
    }

    let totalItems = 0;
    let givenItems = 0;

    const items = ((data.items ?? []) as ItemRow[]).map((item) => {
      const quantity = Math.max(Number(item.quantity ?? 1), 1);

      const given = toArray(item.distribution).filter(
        (distribution) => distribution?.status === "GIVEN"
      ).length;

      const status = given >= quantity ? "GIVEN" : "PENDING";

      totalItems += quantity;

      if (status === "GIVEN") {
        givenItems += quantity;
      }

      return {
        id: item.id,
        item: item.item,
        size: item.size,
        quantity,
        status,
      };
    });

    return NextResponse.json({
      success: true,

      /*
       * Whether to offer "Reverse" on a collected item. PATCH
       * /api/distribution enforces this independently.
       */
      canEdit: auth.activeRole === "admin",

      registration: {
        registration_id: data.registration_id,
        name: data.name,
        email: data.email,
        total: Number(data.total ?? 0),
        qr_token: data.qr_token,
        items,

        distribution: {
          total: totalItems,
          given: givenItems,
          pending: Math.max(totalItems - givenItems, 0),
        },
      },
    });
  } catch (error) {
    console.error("Registration detail API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load registration",
      },
      { status: 500 }
    );
  }
}
