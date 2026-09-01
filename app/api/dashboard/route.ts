import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/*
 * Event ids from the upstream V-TAPP feed.
 *
 * Only the fallback path needs them; the SQL function carries its
 * own copy. They were previously repeated as bare literals in six
 * places in this file.
 */
const MERCHANDISE_EVENT_ID = "513";
const EVENTS_EVENT_ID = "514";

type Inventory = {
  id: number;
  item: string;
  initial_stock: number;
  sold: number;
  remaining: number;
  remaining_percentage: number;
};

type Breakdown = {
  event_id: string;
  name: string;
  registrations: number;
  revenue: number;
};

type TicketBreakdown = {
  ticket: string;
  registrations: number;
  revenue: number;
};

type Summary = {
  registrations: number;
  totalAmount: number;
  eventRevenue: number;
  merchandiseRevenue: number;
  eventRegistrations: number;
  merchandiseRegistrations: number;
  eventRegistrationCount: number;
  merchandiseRegistrationCount: number;
  eventQrScanned: number;
  merchandiseQrScanned: number;
  qrScans: number;
  eventBreakdown: Breakdown[];
  ticketBreakdown: TicketBreakdown[];
  inventory: Inventory[];
  distribution: {
    given: number;
    pending: number;
    total: number;
  };
};

type ItemRow = {
  quantity: number | string | null;
  distribution:
    | { status: string | null }[]
    | { status: string | null }
    | null;
};

/*
 * Supabase returns an embedded one-to-one relation as an object and
 * a one-to-many relation as an array. Normalize both shapes.
 */
function toArray(distribution: ItemRow["distribution"]) {
  if (Array.isArray(distribution)) {
    return distribution;
  }

  return distribution ? [distribution] : [];
}

function eventName(eventId: string) {
  if (eventId === MERCHANDISE_EVENT_ID) return "Merchandise";
  if (eventId === EVENTS_EVENT_ID) return "V-TAPP 2026 Events";

  return `Event ${eventId}`;
}

/*
 * Ticket label out of `product_meta`, which looks like
 *   'V-TAPP merchandise - Date: ... - Ticket: Combo 5 (...)'
 */
function ticketOf(productMeta: string) {
  const match = productMeta.match(/Ticket:\s*(.*)$/i);

  const ticket = (match?.[1] ?? "").split(" - Date:")[0].trim();

  return ticket || "Unknown";
}

/*
 * Preferred path: one round-trip, aggregated in Postgres.
 *
 * Resolves to null when the function has not been installed yet
 * (see supabase/dashboard-summary.sql), so the caller can fall back
 * rather than fail.
 */
async function viaRpc(
  db: SupabaseClient
): Promise<Summary | null> {
  const { data, error } = await db.rpc("dashboard_summary");

  if (error) {
    const missing =
      error.code === "PGRST202" ||
      error.code === "42883" ||
      /could not find the function|does not exist/i.test(
        error.message ?? ""
      );

    if (missing) {
      console.warn(
        "dashboard_summary() not installed; falling back to in-Node aggregation. Run supabase/dashboard-summary.sql."
      );

      return null;
    }

    throw error;
  }

  return data as Summary;
}

/*
 * Fallback: pull the rows and reduce them here.
 *
 * Correct, but it transfers every registration, scan and item on
 * every load, so it degrades as the event grows. Kept only so the
 * dashboard still works before the SQL function is installed.
 */
async function viaScan(db: SupabaseClient): Promise<Summary> {
  const [
    inventoryResult,
    registrationsResult,
    itemsResult,
    qrScansResult,
  ] = await Promise.all([
    db
      .from("inventory_status")
      .select(
        "id,item,initial_stock,sold,remaining,remaining_percentage"
      )
      .order("item"),

    db
      .from("registrations")
      .select("event_id,product_meta,total", { count: "exact" }),

    db
      .from("registration_items")
      .select("quantity,distribution:distributions(status)"),

    db.from("qr_scans").select("event_id", { count: "exact" }),
  ]);

  if (inventoryResult.error) throw inventoryResult.error;
  if (registrationsResult.error) throw registrationsResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (qrScansResult.error) throw qrScansResult.error;

  let eventQrScanned = 0;
  let merchandiseQrScanned = 0;

  for (const scan of qrScansResult.data ?? []) {
    const id = String(scan.event_id ?? "");

    if (id === EVENTS_EVENT_ID) eventQrScanned++;
    if (id === MERCHANDISE_EVENT_ID) merchandiseQrScanned++;
  }

  let totalRevenue = 0;
  let eventRevenue = 0;
  let merchandiseRevenue = 0;
  let eventRegistrations = 0;
  let merchandiseRegistrations = 0;

  const events = new Map<string, Breakdown>();
  const tickets = new Map<string, TicketBreakdown>();

  for (const registration of registrationsResult.data ?? []) {
    const amount = Number(registration.total ?? 0);
    const eventId = String(registration.event_id ?? "unknown");

    totalRevenue += amount;

    if (eventId === MERCHANDISE_EVENT_ID) {
      merchandiseRevenue += amount;
      merchandiseRegistrations++;
    } else {
      eventRevenue += amount;
      eventRegistrations++;
    }

    const event = events.get(eventId) ?? {
      event_id: eventId,
      name: eventName(eventId),
      registrations: 0,
      revenue: 0,
    };

    event.registrations++;
    event.revenue += amount;
    events.set(eventId, event);

    const label = ticketOf(String(registration.product_meta ?? ""));

    const ticket = tickets.get(label) ?? {
      ticket: label,
      registrations: 0,
      revenue: 0,
    };

    ticket.registrations++;
    ticket.revenue += amount;
    tickets.set(label, ticket);
  }

  let given = 0;
  let pending = 0;

  for (const item of (itemsResult.data ?? []) as ItemRow[]) {
    const quantity = Math.max(Number(item.quantity ?? 1), 1);

    let givenForItem = 0;

    for (const distribution of toArray(item.distribution)) {
      if (distribution?.status === "GIVEN") givenForItem++;
    }

    given += Math.min(givenForItem, quantity);
    pending += Math.max(quantity - givenForItem, 0);
  }

  const byRevenue = <T extends { revenue: number }>(a: T, b: T) =>
    b.revenue - a.revenue;

  return {
    registrations:
      registrationsResult.count ??
      registrationsResult.data?.length ??
      0,
    totalAmount: totalRevenue,
    eventRevenue,
    merchandiseRevenue,
    eventRegistrations,
    merchandiseRegistrations,
    eventRegistrationCount: eventRegistrations,
    merchandiseRegistrationCount: merchandiseRegistrations,
    eventQrScanned,
    merchandiseQrScanned,
    qrScans: qrScansResult.count ?? 0,
    eventBreakdown: [...events.values()].sort(byRevenue),
    ticketBreakdown: [...tickets.values()].sort(byRevenue),
    inventory: (inventoryResult.data ?? []) as Inventory[],
    distribution: { given, pending, total: given + pending },
  };
}

export async function GET() {
  const auth = await requireRole("admin", "volunteer");

  if (auth instanceof NextResponse) {
    return auth;
  }

  const started = Date.now();

  try {
    const db = supabaseAdmin();

    const summary = (await viaRpc(db)) ?? (await viaScan(db));

    return NextResponse.json(
      {
        success: true,
        ...summary,
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
