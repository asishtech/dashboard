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

export async function GET(request: Request) {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const url = new URL(request.url);

    /*
     * Paging is opt-in. Without an explicit `limit` the full set
     * is returned, so existing callers keep seeing every row.
     */
    const limitParam = url.searchParams.get("limit");

    const limit = limitParam
      ? Math.min(Math.max(Number(limitParam), 1), 500)
      : null;

    const offset = Math.max(
      Number(url.searchParams.get("offset") ?? 0),
      0
    );

    const db = supabaseAdmin();

    /*
     * These three reads are independent, so run them
     * concurrently instead of one after another.
     *
     * Columns are listed explicitly: the previous `select("*")`
     * also pulled `raw_data`, the full upstream V-TAPP payload,
     * for every registration on every poll.
     */
    const [registrationsResult, inventoryResult, syncStateResult] =
      await Promise.all([
        (() => {
          const query = db
            .from("registrations")
            .select(
              `
              registration_id,
              name,
              email,
              ticket,
              sale_type,
              total,
              created_at,
              items:registration_items(
                id,
                item,
                size,
                quantity,
                distribution:distributions(status)
              )
            `,
              { count: "exact" }
            )
            .order("created_at", { ascending: false });

          return limit
            ? query.range(offset, offset + limit - 1)
            : query;
        })(),

        db
          .from("inventory_status")
          .select(
            "id,item,initial_stock,sold,remaining,remaining_percentage"
          )
          .order("item"),

        db
          .from("sync_state")
          .select("last_sync_at,last_success,last_error")
          .eq("id", 1)
          .maybeSingle(),
      ]);

    if (registrationsResult.error) {
      throw registrationsResult.error;
    }

    if (inventoryResult.error) {
      throw inventoryResult.error;
    }

    /*
     * Flatten the embedded distribution into a `status` field.
     *
     * The client renders `item.status`; without this the nested
     * relation never matched and every item read as PENDING.
     */
    const registrations = (registrationsResult.data ?? []).map(
      (registration) => ({
        ...registration,

        items: ((registration.items ?? []) as ItemRow[]).map(
          (item) => {
            const quantity = Math.max(
              Number(item.quantity ?? 1),
              1
            );

            const given = toArray(item.distribution).filter(
              (distribution) => distribution?.status === "GIVEN"
            ).length;

            return {
              id: item.id,
              item: item.item,
              size: item.size,
              quantity,
              status: given >= quantity ? "GIVEN" : "PENDING",
            };
          }
        ),
      })
    );

    return NextResponse.json({
      success: true,
      count: registrationsResult.count ?? registrations.length,
      limit,
      offset,
      data: registrations,
      inventory: inventoryResult.data ?? [],
      syncState: syncStateResult.data ?? null,
    });
  } catch (error) {
    console.error("Registrations API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
