import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth";
import { readAll } from "@/lib/paged";

/*
 * readAll, wrapped to look like a single supabase result so callers
 * that already read .data / .error / .count need no changes.
 */
async function paged<T>(
  build: (
    from: number,
    to: number
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
    count?: number | null;
  }>
) {
  const { rows, total } = await readAll<T>(build);
  return { data: rows, error: null as { message: string } | null, count: total };
}
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

    /*
     * Paged, and shaped like a normal result so nothing downstream
     * changes. This is the fallback used when dashboard_summary() is
     * missing; a truncated read would not fail here, it would quietly
     * report a smaller fest, which is the worst of both.
     */
    paged<{
      event_id: string | null;
      product_meta: string | null;
      total: number | null;
    }>((from, to) =>
      db
        .from("registrations")
        .select("event_id,product_meta,total", { count: "exact" })
        .order("id", { ascending: true })
        .range(from, to)
    ),

    paged<{ quantity: number | string | null; distribution: unknown }>(
      (from, to) =>
        db
          .from("registration_items")
          .select("quantity,distribution:distributions(status)", {
            count: "exact",
          })
          .order("id", { ascending: true })
          .range(from, to)
    ),

    paged<{ event_id: number | string | null }>((from, to) =>
      db
        .from("qr_scans")
        .select("event_id", { count: "exact" })
        .order("id", { ascending: true })
        .range(from, to)
    ),
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

export type PeopleSummary = {
  participants: {
    people: number;
    signedIn: number;
  };
  coordinators: {
    people: number;
    eventsCovered: number;
    eventsTotal: number;
    eventsUncovered: number;
  };
  staff: {
    total: number;
    active: number;
    inactive: number;
    byRole: Record<string, number>;
  };
};

/*
 * Who runs the fest, as opposed to who attends it.
 *
 * Kept out of viaRpc/viaScan because it answers a different question
 * and must not be able to break the numbers that matter most: every
 * read here degrades to zeroes rather than failing the request.
 */
async function readPeople(
  db: ReturnType<typeof supabaseAdmin>
): Promise<PeopleSummary> {
  const empty: PeopleSummary = {
    coordinators: {
      people: 0,
      eventsCovered: 0,
      eventsTotal: 0,
      eventsUncovered: 0,
    },
    participants: { people: 0, signedIn: 0 },
    staff: { total: 0, active: 0, inactive: 0, byRole: {} },
  };

  try {
    const [assignments, events, staff, buyers, signedIn] =
      await Promise.all([
        db.from("event_coordinators").select("email,event_id"),
        db.from("events").select("event_id,source_event_id"),
        db.from("staff_invites").select("role,roles,active"),

        /*
         * The real buyer population. staff_invites only holds granted
         * access, and buyer is the default rather than a grant, so
         * anyone who simply bought something never appears there --
         * counting it from that table gave a number that meant nothing.
         *
         * Paged: PostgREST stops at 1000 rows, so at 1060 registrations
         * this head count was quietly computed from a subset.
         */
        readAll<{ email: string | null }>((from, to) =>
          db
            .from("registrations")
            .select("email")
            .order("id", { ascending: true })
            .range(from, to)
        ),

        db
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "buyer"),
      ]);

    const buyerEmails = new Set(
      buyers.rows
        .map((row) => String(row.email ?? "").trim().toLowerCase())
        .filter(Boolean)
    );

    const rows = assignments.error ? [] : (assignments.data ?? []);

    const people = new Set(
      rows.map((row) => String(row.email).trim().toLowerCase())
    );

    const covered = new Set(rows.map((row) => String(row.event_id)));

    /*
     * Merchandise is a row in `events` for the resolver's benefit, not
     * an event anyone coordinates, so it must not count as uncovered.
     */
    const realEvents = (events.error ? [] : (events.data ?? [])).filter(
      (row) =>
        String(row.source_event_id ?? "") !== "513" &&
        String(row.event_id) !== "merchandise"
    );

    const eventsCovered = realEvents.filter((row) =>
      covered.has(String(row.event_id))
    ).length;

    const byRole: Record<string, number> = {};

    let active = 0;
    let inactive = 0;

    for (const row of staff.error ? [] : (staff.data ?? [])) {
      if (row.active) active += 1;
      else inactive += 1;

      /*
       * A multi-role account is counted under each role it holds, so
       * the role totals can exceed the head count. That is the honest
       * reading of "how many admins are there".
       */
      const held =
        Array.isArray(row.roles) && row.roles.length > 0
          ? (row.roles as string[])
          : [row.role as string].filter(Boolean);

      for (const role of held) {
        /*
         * Buyer is the default for every signed-in account, so a
         * "buyer" invite says nothing about access. Counting it beside
         * admin and volunteer implied there were four buyers at the
         * fest rather than four invite rows that happen to carry it.
         */
        if (role === "buyer") continue;

        byRole[role] = (byRole[role] ?? 0) + 1;
      }
    }

    return {
      participants: {
        people: buyerEmails.size,
        signedIn: signedIn.error ? 0 : (signedIn.count ?? 0),
      },
      coordinators: {
        people: people.size,
        eventsCovered,
        eventsTotal: realEvents.length,
        eventsUncovered: realEvents.length - eventsCovered,
      },
      staff: {
        total: staff.error ? 0 : (staff.data ?? []).length,
        active,
        inactive,
        byRole,
      },
    };
  } catch (error) {
    console.error("People summary failed:", error);
    return empty;
  }
}

export async function GET() {
  /* Read-only: the registrations desk sees these totals, and every
     route that changes them still requires "admin". */
  const auth = await requireRole("admin", "registrations");

  if (auth instanceof NextResponse) {
    return auth;
  }

  const started = Date.now();

  try {
    const db = supabaseAdmin();

    const [summary, people] = await Promise.all([
      (async () => (await viaRpc(db)) ?? (await viaScan(db)))(),
      readPeople(db),
    ]);

    return NextResponse.json(
      {
        success: true,
        ...summary,
        ...people,
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
