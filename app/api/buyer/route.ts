import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export type BuyerEvent = {
  id: number;
  registration_id: string;
  event_id: string | null;
  name: string;
  day: string | null;
  venue: string | null;
  total: number;
  scanned: boolean;
  qr_token: string;
};

export type BuyerMerchItem = {
  id: number;
  item: string;
  size: string | null;
  quantity: number;
  status: "GIVEN" | "PENDING";
};

export type BuyerOrder = {
  id: number;
  registration_id: string;
  total: number;
  qr_token: string;
  items: BuyerMerchItem[];
};

/* Upstream bucket for merchandise; everything else is an event. */
const MERCH_SOURCE_ID = "513";

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
  if (Array.isArray(distribution)) return distribution;
  return distribution ? [distribution] : [];
}

/*
 * GET /api/buyer
 *
 * Everything one email owns, in two lists that never mix: event
 * bookings and merchandise orders. Several of each is normal -- a
 * person can register for six events and buy two hoodies -- so this
 * is keyed on the address, not on a single registration.
 */
export async function GET() {
  try {
    /*
     * The RLS-bound client establishes *who is asking*. The email
     * comes from the verified session and never from the request, so
     * the service-role read below can only ever be about the caller.
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

    const viaRpc = await readViaRpc(email);

    if (viaRpc) {
      return NextResponse.json({ success: true, ...viaRpc });
    }

    return NextResponse.json({
      success: true,
      ...(await readViaScan(supabase, email)),
    });
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

/*
 * Preferred path: one round trip, and the event name/day/venue come
 * from the same resolver the admin screens use, so a booking reads
 * identically on both sides.
 */
async function readViaRpc(email: string) {
  const { data, error } = await supabaseAdmin().rpc(
    "buyer_dashboard",
    { p_email: email }
  );

  /*
   * 42883 / PGRST202: supabase/buyer-dashboard.sql has not been run.
   * Anything else is a real failure worth surfacing.
   */
  if (error) {
    if (error.code === "42883" || error.code === "PGRST202") {
      return null;
    }

    throw error;
  }

  const payload = data as {
    events: BuyerEvent[];
    merchandise: BuyerOrder[];
    name: string | null;
  } | null;

  if (!payload) return null;

  return {
    events: payload.events ?? [],
    merchandise: payload.merchandise ?? [],
    name: payload.name ?? null,
  };
}

/*
 * Fallback until the migration runs. It splits on the upstream bucket
 * alone, so an event keeps its raw ticket string instead of its real
 * name -- correct, just less readable.
 */
async function readViaScan(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  email: string
) {
  const { data, error } = await supabase
    .from("registrations")
    .select(
      `
      id,
      registration_id,
      name,
      email,
      event_id,
      ticket,
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
    .ilike("email", email)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = data ?? [];

  const events: BuyerEvent[] = [];
  const merchandise: BuyerOrder[] = [];

  for (const row of rows) {
    const isMerch = String(row.event_id ?? "") === MERCH_SOURCE_ID;

    if (isMerch) {
      merchandise.push({
        id: row.id,
        registration_id: row.registration_id,
        total: Number(row.total ?? 0),
        qr_token: row.qr_token,
        items: ((row.items ?? []) as ItemRow[]).map((item) => ({
          id: item.id,
          item: item.item,
          size: item.size,
          quantity: Number(item.quantity ?? 1),
          status: toArray(item.distribution).some(
            (d) => d?.status === "GIVEN"
          )
            ? "GIVEN"
            : "PENDING",
        })),
      });

      continue;
    }

    events.push({
      id: row.id,
      registration_id: row.registration_id,
      event_id: null,
      name: row.ticket?.trim() || "Event booking",
      day: null,
      venue: null,
      total: Number(row.total ?? 0),
      scanned: false,
      qr_token: row.qr_token,
    });
  }

  return {
    events,
    merchandise,
    name: rows[0]?.name ?? null,
  };
}
