import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const REGISTRATION_SELECT = `
  id,
  registration_id,
  name,
  email,
  items:registration_items(
    id,
    item,
    size,
    quantity,
    distribution:distributions(status,given_at)
  )
`;

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

function withStatus(registration: {
  items?: ItemRow[] | null;
}) {
  return {
    ...registration,
    items: (registration.items ?? []).map((item) => ({
      ...item,
      status:
        toArray(item.distribution).find(
          (distribution) => distribution?.status === "GIVEN"
        )
          ? "GIVEN"
          : "PENDING",
    })),
  };
}

/*
 * ADMIN
 *
 * Reverse or re-apply a distribution:
 *
 * GIVEN   -> PENDING
 * PENDING -> GIVEN
 */
export async function PATCH(request: Request) {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const body = await request.json();

    const registrationItemId = Number(body.registrationItemId);

    const status =
      body.status === "GIVEN"
        ? "GIVEN"
        : body.status === "PENDING"
          ? "PENDING"
          : null;

    if (!Number.isFinite(registrationItemId) || !status) {
      return NextResponse.json(
        {
          error:
            "registrationItemId and valid status are required",
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    /*
     * Update by foreign key directly. The previous read-then-write
     * pair was an extra round-trip and left room for a race
     * between the two statements.
     */
    const { data: updated, error: updateError } =
      await supabaseAdmin()
        .from("distributions")
        .update({
          status,
          updated_at: now,
          given_at: status === "GIVEN" ? now : null,
        })
        .eq("registration_item_id", registrationItemId)
        .select(
          "id,status,registration_item_id,given_at,updated_at"
        )
        .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    if (!updated) {
      return NextResponse.json(
        { error: "Distribution record not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      distribution: updated,
    });
  } catch (error) {
    console.error("Admin distribution update failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Distribution update failed",
      },
      { status: 500 }
    );
  }
}

/*
 * VOLUNTEER
 *
 * Hand an item over to the buyer.
 */
export async function POST(request: Request) {
  const auth = await requireRole("volunteer", "admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const body = await request.json();

    const registrationItemId = Number(body.registrationItemId);

    if (!Number.isFinite(registrationItemId)) {
      return NextResponse.json(
        { error: "Registration item is required" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    const { data: item, error: itemError } = await db
      .from("registration_items")
      .select("id,registration_id")
      .eq("id", registrationItemId)
      .maybeSingle();

    if (itemError) {
      throw itemError;
    }

    if (!item) {
      return NextResponse.json(
        { error: "Registration item not found" },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();

    /*
     * Claim the row by moving it out of PENDING in a single
     * conditional update. Two volunteers scanning the same QR
     * at once means exactly one of them matches the filter.
     */
    const { data: claimed, error: claimError } = await db
      .from("distributions")
      .update({
        status: "GIVEN",
        given_at: now,
        updated_at: now,
      })
      .eq("registration_item_id", registrationItemId)
      .eq("status", "PENDING")
      .select("id")
      .maybeSingle();

    if (claimError) {
      throw claimError;
    }

    let distributionId = claimed?.id ?? null;

    if (!distributionId) {
      /*
       * Nothing moved: either the row is already GIVEN, or no
       * distribution row exists for this item yet.
       */
      const { data: existing, error: existingError } = await db
        .from("distributions")
        .select("id,status")
        .eq("registration_item_id", registrationItemId)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existing) {
        return NextResponse.json(
          { error: "This item has already been given." },
          { status: 409 }
        );
      }

      const { data: created, error: createError } = await db
        .from("distributions")
        .insert({
          registration_item_id: registrationItemId,
          status: "GIVEN",
          given_at: now,
          updated_at: now,
        })
        .select("id")
        .single();

      if (createError) {
        throw createError;
      }

      distributionId = created.id;
    }

    /*
     * Return the whole registration so the scanner UI can
     * repaint without a second request.
     */
    const { data: registration, error: registrationError } =
      await db
        .from("registrations")
        .select(REGISTRATION_SELECT)
        .eq("id", item.registration_id)
        .single();

    if (registrationError || !registration) {
      throw (
        registrationError ??
        new Error("Registration could not be loaded")
      );
    }

    const shaped = withStatus(
      registration as { items?: ItemRow[] | null }
    );

    return NextResponse.json({
      success: true,
      distributionId,
      registration: shaped,
    });
  } catch (error) {
    console.error("Distribution POST error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to distribute item",
      },
      { status: 500 }
    );
  }
}
