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
  { params }: { params: Promise<{ token: string }> }
) {
  const auth = await requireRole("volunteer", "admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  const { token } = await params;

  if (!token) {
    return NextResponse.json(
      { error: "QR code not found" },
      { status: 404 }
    );
  }

  const { data: registration, error } = await supabaseAdmin()
    .from("registrations")
    .select(
      `
     id,
    registration_id,
    event_id,
    product_meta,
    name,
    email,
    items:registration_items(
        id,
        item,
        size,
        quantity,
        distribution:distributions(status)
      )
    `
    )
    .eq("qr_token", token)
    .maybeSingle();

  if (error || !registration) {
    return NextResponse.json(
      { error: "QR code not found" },
      { status: 404 }
    );
  }

  /*
   * Record the scan.
   *
   * Nothing wrote `qr_scans` before this, so every check-in metric on
   * the admin dashboard and the events pages sat at zero permanently.
   * Looking up a QR *is* the check-in, so that is where it belongs.
   *
   * Deliberately not awaited into the response path: a volunteer at
   * the door must never be blocked, or shown an error, because the
   * attendance log failed to write.
   */
  void supabaseAdmin()
    .from("qr_scans")
    .insert({
      registration_id: registration.id,
      event_id: registration.event_id,
    })
    .then(({ error: scanError }) => {
      if (scanError) {
        console.error("Could not record QR scan:", scanError);
      }
    });

  const items = ((registration.items ?? []) as ItemRow[]).map(
    (item) => ({
      ...item,
      status: toArray(item.distribution).find(
        (distribution) => distribution?.status === "GIVEN"
      )
        ? "GIVEN"
        : "PENDING",
    })
  );

  return NextResponse.json({
    registration: {
      ...registration,
      items,
    },

    /*
     * An event registration carries no merchandise. Without this the
     * scanner rendered an empty panel and left the volunteer guessing
     * whether the scan had worked.
     */
    isEventOnly: items.length === 0,
  });
}
