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
      registration_id,
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

  return NextResponse.json({
    registration: {
      ...registration,
      items: ((registration.items ?? []) as ItemRow[]).map(
        (item) => ({
          ...item,
          status:
            toArray(item.distribution).find(
              (distribution) => distribution?.status === "GIVEN"
            )
              ? "GIVEN"
              : "PENDING",
        })
      ),
    },
  });
}
