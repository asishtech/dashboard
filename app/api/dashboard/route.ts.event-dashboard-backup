import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ItemRow = {
  quantity: number | string | null;
  distribution:
    | { status: string | null }[]
    | { status: string | null }
    | null;
};

/*
 * Supabase returns an embedded one-to-one relation as an
 * object and a one-to-many relation as an array. Normalize
 * both shapes before counting.
 */
function toArray(
  distribution: ItemRow["distribution"]
) {
  if (Array.isArray(distribution)) {
    return distribution;
  }

  return distribution ? [distribution] : [];
}

export async function GET() {
  const auth = await requireRole("admin", "volunteer");

  if (auth instanceof NextResponse) {
    return auth;
  }

  const started = Date.now();

  try {
    const db = supabaseAdmin();

    const [inventoryResult, registrationsResult, itemsResult] =
      await Promise.all([
        db
          .from("inventory_status")
          .select(
            "id,item,initial_stock,sold,remaining,remaining_percentage"
          )
          .order("item"),

        /*
         * Only `total` is needed; the row count comes back in
         * `count` rather than from the length of the payload.
         */
        db
          .from("registrations")
          .select("total", { count: "exact" }),

        db
          .from("registration_items")
          .select("quantity,distribution:distributions(status)"),
      ]);

    if (inventoryResult.error) {
      throw inventoryResult.error;
    }

    if (registrationsResult.error) {
      throw registrationsResult.error;
    }

    if (itemsResult.error) {
      throw itemsResult.error;
    }

    let totalRevenue = 0;

    for (const registration of registrationsResult.data ?? []) {
      totalRevenue += Number(registration.total ?? 0);
    }

    let given = 0;
    let pending = 0;

    for (const item of (itemsResult.data ?? []) as ItemRow[]) {
      const quantity = Math.max(Number(item.quantity ?? 1), 1);

      let givenForItem = 0;

      for (const distribution of toArray(item.distribution)) {
        if (distribution?.status === "GIVEN") {
          givenForItem++;
        }
      }

      given += Math.min(givenForItem, quantity);
      pending += Math.max(quantity - givenForItem, 0);
    }

    return NextResponse.json(
      {
        success: true,

        registrations:
          registrationsResult.count ??
          registrationsResult.data?.length ??
          0,

        totalAmount: totalRevenue,

        inventory: inventoryResult.data ?? [],

        distribution: {
          given,
          pending,
          total: given + pending,
        },

        responseTimeMs: Date.now() - started,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Dashboard API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Dashboard data failed",
      },
      { status: 500 }
    );
  }
}
