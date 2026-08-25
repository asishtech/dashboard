import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole("admin", "volunteer");

  if (auth instanceof NextResponse) {
    return auth;
  }

  const { data, error } = await supabaseAdmin()
    .from("inventory_status")
    .select(
      "id,item,initial_stock,sold,remaining,remaining_percentage"
    )
    .order("item");

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ inventory: data ?? [] });
}

export async function PUT(request: Request) {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const body = await request.json();
    const inventory = body.inventory;

    if (!Array.isArray(inventory) || inventory.length === 0) {
      return NextResponse.json(
        { error: "Invalid inventory payload" },
        { status: 400 }
      );
    }

    const updates = inventory.map((item) => ({
      id: Number(item.id),
      initialStock: Number(item.initial_stock),
    }));

    const invalid = updates.find(
      (item) =>
        !Number.isFinite(item.id) ||
        !Number.isFinite(item.initialStock) ||
        item.initialStock < 0
    );

    if (invalid) {
      return NextResponse.json(
        {
          error: `Invalid stock value for item ${invalid.id}`,
        },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    /*
     * Read every affected row in one query instead of one
     * round-trip per item, then validate the whole batch
     * before writing anything.
     */
    const { data: current, error: currentError } = await db
      .from("inventory_status")
      .select("id,sold")
      .in(
        "id",
        updates.map((item) => item.id)
      );

    if (currentError) {
      throw currentError;
    }

    const soldById = new Map(
      (current ?? []).map((row) => [
        Number(row.id),
        Number(row.sold ?? 0),
      ])
    );

    for (const item of updates) {
      const sold = soldById.get(item.id);

      if (sold === undefined) {
        return NextResponse.json(
          { error: `Unknown inventory item ${item.id}` },
          { status: 404 }
        );
      }

      if (item.initialStock < sold) {
        return NextResponse.json(
          {
            error: `Cannot set stock below sold quantity for item ${item.id}`,
          },
          { status: 400 }
        );
      }
    }

    const updatedAt = new Date().toISOString();

    /*
     * Writes are independent, so issue them concurrently
     * rather than serially.
     */
    const results = await Promise.all(
      updates.map((item) =>
        db
          .from("inventory")
          .update({
            initial_stock: item.initialStock,
            updated_at: updatedAt,
          })
          .eq("id", item.id)
      )
    );

    const failed = results.find((result) => result.error);

    if (failed?.error) {
      throw failed.error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update inventory",
      },
      { status: 500 }
    );
  }
}
