from pathlib import Path
import shutil

ROOT = Path.cwd()

API = ROOT / "app/api/dashboard/route.ts"
PAGE = ROOT / "app/admin/page.tsx"

print("=" * 70)
print(" V-TAPP DASHBOARD EVENT SEGREGATION UPDATER")
print("=" * 70)
print()

if not API.exists():
    raise SystemExit(f"Missing: {API}")

if not PAGE.exists():
    raise SystemExit(f"Missing: {PAGE}")


# ============================================================
# BACKUPS
# ============================================================

api_backup = API.with_suffix(".route.ts.event-dashboard-backup")
page_backup = PAGE.with_suffix(".page.tsx.event-dashboard-backup")

shutil.copy2(API, api_backup)
shutil.copy2(PAGE, page_backup)

print(f"Backup created: {api_backup}")
print(f"Backup created: {page_backup}")
print()


# ============================================================
# 1. REPLACE DASHBOARD API
# ============================================================

api_code = r'''import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";

import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";


type ItemRow = {

  quantity:
    number | string | null;

  distribution:
    | { status: string | null }[]
    | { status: string | null }
    | null;

};


function toArray(
  distribution: ItemRow["distribution"]
) {

  if (Array.isArray(distribution)) {

    return distribution;

  }

  return distribution
    ? [distribution]
    : [];

}


type RegistrationRow = {

  registration_id:
    number | string | null;

  event_id:
    number | string | null;

  ticket:
    string | null;

  sale_type:
    string | null;

  product_meta:
    string | null;

  total:
    number | string | null;

};


export async function GET() {

  const auth =
    await requireRole(
      "admin",
      "volunteer"
    );

  if (auth instanceof NextResponse) {

    return auth;

  }


  const started =
    Date.now();


  try {

    const db =
      supabaseAdmin();


    const [
      inventoryResult,
      registrationsResult,
      itemsResult,
    ] = await Promise.all([

      /*
       * MERCHANDISE INVENTORY
       */

      db
        .from("inventory_status")
        .select(
          "id,item,initial_stock,sold,remaining,remaining_percentage"
        )
        .order("item"),


      /*
       * ALL V-TAPP REGISTRATIONS
       */

      db
        .from("registrations")
        .select(
          `
            registration_id,
            event_id,
            ticket,
            sale_type,
            product_meta,
            total
          `,
          {
            count: "exact",
          }
        ),


      /*
       * MERCHANDISE DISTRIBUTION
       */

      db
        .from("registration_items")
        .select(
          "quantity,distribution:distributions(status)"
        ),

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


    /*
     * ========================================================
     * REVENUE + EVENT SEGREGATION
     * ========================================================
     */

    let totalRevenue = 0;

    let merchandiseRevenue = 0;

    let eventRevenue = 0;

    let merchandiseRegistrations = 0;

    let eventRegistrations = 0;


    const eventMap: Record<
      string,
      {
        event_id: string;
        name: string;
        registrations: number;
        revenue: number;
      }
    > = {};


    const ticketMap: Record<
      string,
      {
        ticket: string;
        registrations: number;
        revenue: number;
      }
    > = {};


    for (
      const registration
      of (registrationsResult.data ?? [])
        as RegistrationRow[]
    ) {

      const amount =
        Number(
          registration.total ?? 0
        );


      const eventId =
        String(
          registration.event_id ??
          "unknown"
        );


      totalRevenue += amount;


      /*
       * EVENT 513 = MERCHANDISE
       *
       * EVENT 514 = V-TAPP EVENTS
       */

      if (eventId === "513") {

        merchandiseRevenue += amount;

        merchandiseRegistrations++;

      } else {

        eventRevenue += amount;

        eventRegistrations++;

      }


      /*
       * EVENT BREAKDOWN
       */

      if (!eventMap[eventId]) {

        eventMap[eventId] = {

          event_id: eventId,

          name:
            eventId === "513"
              ? "Merchandise"
              : eventId === "514"
                ? "V-TAPP 2026 Events"
                : `Event ${eventId}`,

          registrations: 0,

          revenue: 0,

        };

      }


      eventMap[eventId].registrations += 1;

      eventMap[eventId].revenue += amount;


      /*
       * TICKET NAME
       *
       * Prefer ticket.
       * Otherwise extract Ticket: from product_meta.
       */

      let ticket =
        registration.ticket ??
        "";


      if (!ticket) {

        const meta =
          String(
            registration.product_meta ??
            ""
          );


        const match =
          meta.match(
            /Ticket:\s*(.+)/i
          );


        if (match) {

          ticket =
            match[1].trim();

        }

      }


      if (!ticket) {

        ticket =
          registration.sale_type ??
          "Unknown";

      }


      if (!ticket) {

        ticket =
          "Unknown";

      }


      /*
       * TICKET BREAKDOWN
       */

      if (!ticketMap[ticket]) {

        ticketMap[ticket] = {

          ticket,

          registrations: 0,

          revenue: 0,

        };

      }


      ticketMap[ticket].registrations += 1;

      ticketMap[ticket].revenue += amount;

    }


    /*
     * ========================================================
     * MERCHANDISE DISTRIBUTION
     * ========================================================
     */

    let given = 0;

    let pending = 0;


    for (
      const item
      of (itemsResult.data ?? [])
        as ItemRow[]
    ) {

      const quantity =
        Math.max(
          Number(
            item.quantity ?? 1
          ),
          1
        );


      let givenForItem = 0;


      for (
        const distribution
        of toArray(
          item.distribution
        )
      ) {

        if (
          distribution?.status ===
          "GIVEN"
        ) {

          givenForItem++;

        }

      }


      given +=
        Math.min(
          givenForItem,
          quantity
        );


      pending +=
        Math.max(
          quantity -
            givenForItem,
          0
        );

    }


    /*
     * ========================================================
     * RESPONSE
     * ========================================================
     */

    return NextResponse.json(

      {

        success: true,


        /*
         * OVERALL
         */

        registrations:
          registrationsResult.count ??
          registrationsResult.data?.length ??
          0,

        totalAmount:
          totalRevenue,


        /*
         * REVENUE SEGREGATION
         */

        merchandiseRevenue:
          merchandiseRevenue,

        eventRevenue:
          eventRevenue,


        /*
         * REGISTRATION SEGREGATION
         */

        merchandiseRegistrations:
          merchandiseRegistrations,

        eventRegistrations:
          eventRegistrations,


        /*
         * EVENT BREAKDOWN
         */

        eventBreakdown:
          Object.values(
            eventMap
          ),


        /*
         * TICKET BREAKDOWN
         */

        ticketBreakdown:
          Object.values(
            ticketMap
          ),


        /*
         * EXISTING INVENTORY
         */

        inventory:
          inventoryResult.data ??
          [],


        /*
         * EXISTING DISTRIBUTION
         */

        distribution: {

          given,

          pending,

          total:
            given + pending,

        },


        responseTimeMs:
          Date.now() -
          started,

      },

      {

        headers: {

          "Cache-Control":
            "no-store",

        },

      }

    );

  } catch (error) {

    console.error(
      "Dashboard API error:",
      error
    );


    return NextResponse.json(

      {

        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Dashboard data failed",

      },

      {
        status: 500,
      }

    );

  }

}
'''

API.write_text(api_code)

print("✓ Dashboard API replaced")
print()


# ============================================================
# 2. UPDATE DASHBOARD FRONTEND
# ============================================================

s = PAGE.read_text()


# ------------------------------------------------------------
# DashboardData type
# ------------------------------------------------------------

old_type = '''type DashboardData = {
  success?: boolean;
  /* Present only on a failed response. */
  error?: string;
  registrations: number;
  totalAmount: number;
  inventory: Inventory[];
  distribution: {
    given: number;
    pending: number;
    total: number;
  };
  responseTimeMs?: number;
};'''


new_type = '''type DashboardData = {
  success?: boolean;
  error?: string;

  registrations: number;

  totalAmount: number;

  merchandiseRevenue?: number;
  eventRevenue?: number;

  merchandiseRegistrations?: number;
  eventRegistrations?: number;

  eventBreakdown?: {
    event_id: string;
    name: string;
    registrations: number;
    revenue: number;
  }[];

  ticketBreakdown?: {
    ticket: string;
    registrations: number;
    revenue: number;
  }[];

  inventory: Inventory[];

  distribution: {
    given: number;
    pending: number;
    total: number;
  };

  responseTimeMs?: number;
};'''


if old_type in s:

    s = s.replace(
        old_type,
        new_type,
        1
    )

    print(
        "✓ DashboardData type updated"
    )

elif "eventBreakdown?:" in s:

    print(
        "✓ DashboardData type already updated"
    )

else:

    print(
        "⚠ Could not locate DashboardData type"
    )


# ------------------------------------------------------------
# Add state after dashboardTotalAmount
# ------------------------------------------------------------

if "setMerchandiseRevenue" not in s:

    marker = '''  const [
    dashboardTotalAmount,
    setDashboardTotalAmount,
  ] = useState(0);'''


    addition = '''  const [
    dashboardTotalAmount,
    setDashboardTotalAmount,
  ] = useState(0);

  const [
    merchandiseRevenue,
    setMerchandiseRevenue,
  ] = useState(0);

  const [
    eventRevenue,
    setEventRevenue,
  ] = useState(0);

  const [
    merchandiseRegistrations,
    setMerchandiseRegistrations,
  ] = useState(0);

  const [
    eventRegistrations,
    setEventRegistrations,
  ] = useState(0);

  const [
    eventBreakdown,
    setEventBreakdown,
  ] = useState<
    {
      event_id: string;
      name: string;
      registrations: number;
      revenue: number;
    }[]
  >([]);

  const [
    ticketBreakdown,
    setTicketBreakdown,
  ] = useState<
    {
      ticket: string;
      registrations: number;
      revenue: number;
    }[]
  >([]);'''


    if marker in s:

        s = s.replace(
            marker,
            addition,
            1
        )

        print(
            "✓ Dashboard event state added"
        )

    else:

        print(
            "⚠ Could not locate dashboard amount state"
        )

else:

    print(
        "✓ Dashboard event state already exists"
    )


# ------------------------------------------------------------
# Map API response into state
# ------------------------------------------------------------

if "setEventBreakdown(" not in s:

    marker = '''        setDashboardTotalAmount(
          Number(
            data.totalAmount ?? 0
          )
        );'''


    addition = '''        setDashboardTotalAmount(
          Number(
            data.totalAmount ?? 0
          )
        );

        setMerchandiseRevenue(
          Number(
            data.merchandiseRevenue ?? 0
          )
        );

        setEventRevenue(
          Number(
            data.eventRevenue ?? 0
          )
        );

        setMerchandiseRegistrations(
          Number(
            data.merchandiseRegistrations ?? 0
          )
        );

        setEventRegistrations(
          Number(
            data.eventRegistrations ?? 0
          )
        );

        setEventBreakdown(
          data.eventBreakdown ?? []
        );

        setTicketBreakdown(
          data.ticketBreakdown ?? []
        );'''


    if marker in s:

        s = s.replace(
            marker,
            addition,
            1
        )

        print(
            "✓ Dashboard API response mapping added"
        )

    else:

        print(
            "⚠ Could not locate dashboard amount mapping"
        )

else:

    print(
        "✓ Dashboard API mapping already exists"
    )


# ------------------------------------------------------------
# Replace key figures section
# ------------------------------------------------------------

if "Events + merchandise" not in s:

    start_marker = re.search(
        r'\s*\{/\*\s*Key figures\s*\*/\}',
        s
    )


    if start_marker:

        remaining =
            s[start_marker.end():]


        end_marker = re.search(
            r'<div className="grid grid-main mb-8">',
            remaining
        )


        if end_marker:

            end =
                start_marker.end() +
                end_marker.start()


            new_section = r'''

        {/* Key figures */}

        <section className="stat-grid">

          <div className="stat stat-feature">

            <span className="stat-label">
              Total Revenue
            </span>

            <strong className="stat-value">

              {loading
                ? "—"
                : formatAmount(
                    dashboardTotalAmount
                  )}

            </strong>

            <span className="stat-meta">
              Events + merchandise
            </span>

          </div>


          <div className="stat">

            <span className="stat-label">
              Event Revenue
            </span>

            <strong className="stat-value">

              {loading
                ? "—"
                : formatAmount(
                    eventRevenue
                  )}

            </strong>

            <span className="stat-meta">

              {loading
                ? "—"
                : eventRegistrations}

              {" "}event registrations

            </span>

          </div>


          <div className="stat">

            <span className="stat-label">
              Merchandise Revenue
            </span>

            <strong className="stat-value">

              {loading
                ? "—"
                : formatAmount(
                    merchandiseRevenue
                  )}

            </strong>

            <span className="stat-meta">

              {loading
                ? "—"
                : merchandiseRegistrations}

              {" "}orders

            </span>

          </div>


          <div className="stat">

            <span className="stat-label">
              Total Registrations
            </span>

            <strong className="stat-value">

              {loading
                ? "—"
                : registrations}

            </strong>

            <span className="stat-meta">
              All V-TAPP registrations
            </span>

          </div>

        </section>


        <section className="grid grid-main mb-8">

          <section className="panel">

            <div className="panel-header">

              <div>

                <h2 className="panel-title">
                  Event Overview
                </h2>

                <p className="panel-subtitle">
                  Revenue and registrations by event
                </p>

              </div>

            </div>


            <div className="panel-body stack">

              {loading ? (

                [1, 2].map((row) => (

                  <div key={row}>

                    <div
                      className="skeleton skeleton-line"
                    />

                    <div
                      className="skeleton skeleton-line"
                    />

                  </div>

                ))

              ) : eventBreakdown.length === 0 ? (

                <div className="empty">

                  <p className="empty-title">
                    No event data yet
                  </p>

                  <p className="empty-body">
                    Run a V-TAPP sync to load
                    registrations.
                  </p>

                </div>

              ) : (

                eventBreakdown.map((event) => (

                  <div
                    className="meter"
                    key={event.event_id}
                  >

                    <div className="meter-head">

                      <span className="meter-label">
                        {event.name}
                      </span>

                      <span className="meter-value">
                        {formatAmount(
                          event.revenue
                        )}
                      </span>

                    </div>


                    <div className="meter-foot">

                      <span>
                        Event ID {event.event_id}
                      </span>

                      <span>
                        {event.registrations}
                        {" "}registrations
                      </span>

                    </div>

                  </div>

                ))

              )}

            </div>

          </section>


          <section className="panel">

            <div className="panel-header">

              <div>

                <h2 className="panel-title">
                  Ticket Breakdown
                </h2>

                <p className="panel-subtitle">
                  Registrations and revenue
                </p>

              </div>

            </div>


            <div className="panel-body stack">

              {loading ? (

                [1, 2, 3, 4].map((row) => (

                  <div key={row}>

                    <div
                      className="skeleton skeleton-line"
                    />

                    <div
                      className="skeleton skeleton-line"
                    />

                  </div>

                ))

              ) : ticketBreakdown.length === 0 ? (

                <div className="empty">

                  <p className="empty-title">
                    No ticket data yet
                  </p>

                </div>

              ) : (

                [...ticketBreakdown]
                  .sort(
                    (a, b) =>
                      b.registrations -
                      a.registrations
                  )
                  .slice(0, 10)
                  .map((ticket) => (

                    <div
                      className="meter"
                      key={ticket.ticket}
                    >

                      <div className="meter-head">

                        <span className="meter-label">
                          {ticket.ticket}
                        </span>

                        <span className="meter-value">
                          {ticket.registrations}
                        </span>

                      </div>


                      <div className="meter-foot">

                        <span>
                          {ticket.registrations}
                          {" "}registrations
                        </span>

                        <span>
                          {formatAmount(
                            ticket.revenue
                          )}
                        </span>

                      </div>

                    </div>

                  ))

              )}

            </div>

          </section>

        </section>

'''


            s = (
                s[:start_marker.start()]
                + new_section
                + s[end:]
            )


            print(
                "✓ Dashboard key figures replaced"
            )

        else:

            print(
                "⚠ Could not locate dashboard grid"
            )

    else:

        print(
            "⚠ Could not locate Key figures section"
        )

else:

    print(
        "✓ Dashboard key figures already updated"
    )


# ------------------------------------------------------------
# Rename merchandise-specific panels
# ------------------------------------------------------------

s = s.replace(
    "Stock levels",
    "Merchandise Stock",
    1
)

s = s.replace(
    "Distribution",
    "Merchandise Distribution",
    1
)


PAGE.write_text(s)

print(
    "✓ Main dashboard frontend updated"
)

print()


# ============================================================
# DONE
# ============================================================

print("=" * 70)
print(" UPDATE COMPLETE")
print("=" * 70)
print()
print("Run:")
print()
print("  npm run build")
print()
