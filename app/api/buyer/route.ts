import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/auth";

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

export async function GET() {
  try {
    /*
     * Deliberately the RLS-bound client, not the service-role
     * one: a buyer must only ever reach their own registrations.
     */
    const supabase = await createSupabaseServer();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const email = user.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "Google account has no email" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("registrations")
      .select(
        `
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
          distribution:distributions(status)
        )
      `
      )
      .ilike("email", email)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const registrations = (data ?? []).map((registration) => ({
      ...registration,
      items: ((registration.items ?? []) as ItemRow[]).map(
        (item) => ({
          ...item,
          status: toArray(item.distribution).some(
            (distribution) => distribution?.status === "GIVEN"
          )
            ? "GIVEN"
            : "PENDING",
        })
      ),
    }));

    return NextResponse.json({ registrations });
  } catch (error) {
    console.error("Buyer API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load buyer data",
      },
      { status: 500 }
    );
  }
}
