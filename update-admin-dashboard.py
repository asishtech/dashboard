from pathlib import Path
import shutil
import re

ROOT = Path.cwd()

API = ROOT / "app/api/dashboard/route.ts"
PAGE = ROOT / "app/admin/page.tsx"

print("=" * 70)
print(" V-TAPP ADMIN DASHBOARD EVENT SEGREGATION")
print("=" * 70)
print()

if not API.exists():
    raise SystemExit(f"ERROR: {API} not found")

if not PAGE.exists():
    raise SystemExit(f"ERROR: {PAGE} not found")


# ============================================================
# BACKUPS
# ============================================================

api_backup = ROOT / "app/api/dashboard/route.ts.admin-event-backup-2"
page_backup = ROOT / "app/admin/page.tsx.admin-event-backup-2"

shutil.copy2(API, api_backup)
shutil.copy2(PAGE, page_backup)

print(f"Backup: {api_backup}")
print(f"Backup: {page_backup}")
print()


# ============================================================
# DASHBOARD API
# ============================================================

api = API.read_text()


# ------------------------------------------------------------
# Expand registrations query
# ------------------------------------------------------------

api, query_count = re.subn(
    r'\.from\("registrations"\)\s*'
    r'\.select\(\s*"total"\s*,\s*\{\s*count:\s*"exact"\s*\}\s*\)',
    '''.from("registrations")
          .select(
            "registration_id,event_id,product_meta,total",
            { count: "exact" }
          )''',
    api,
    count=1
)

if query_count:
    print("✓ Dashboard registration query expanded")
elif "registration_id,event_id,product_meta,total" in api:
    print("✓ Dashboard registration query already expanded")
else:
    print("ERROR: Could not locate registrations query")
    raise SystemExit(1)


# ------------------------------------------------------------
# Replace revenue calculation
# ------------------------------------------------------------

revenue_pattern = (
    r'    let totalRevenue = 0;'
    r'.*?'
    r'    }'
)

revenue_replacement = '''    let totalRevenue = 0;

    let eventRevenue = 0;

    let merchandiseRevenue = 0;

    let eventRegistrations = 0;

    let merchandiseRegistrations = 0;


    const eventBreakdown: Record<
      string,
      {
        event_id: string;
        name: string;
        registrations: number;
        revenue: number;
      }
    > = {};


    const ticketBreakdown: Record<
      string,
      {
        ticket: string;
        registrations: number;
        revenue: number;
      }
    > = {};


    for (
      const registration
      of registrationsResult.data ?? []
    ) {

      const amount =
        Number(
          registration.total ?? 0
        );


      const eventId =
        String(
          registration.event_id ?? "unknown"
        );


      const productMeta =
        String(
          registration.product_meta ?? ""
        );


      totalRevenue += amount;


      /*
       * 513 = Merchandise
       * 514 = V-TAPP Events
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

      if (!eventBreakdown[eventId]) {

        eventBreakdown[eventId] = {

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


      eventBreakdown[eventId].registrations++;

      eventBreakdown[eventId].revenue += amount;


      /*
       * TICKET BREAKDOWN
       */

      let ticket = "Unknown";


      const ticketMatch =
        productMeta.match(
          /Ticket:\\s*(.+?)(?:\\s*-\\s*Date:|$)/i
        );


      if (ticketMatch) {

        ticket =
          ticketMatch[1].trim();

      }


      if (!ticket) {

        ticket = "Unknown";

      }


      if (!ticketBreakdown[ticket]) {

        ticketBreakdown[ticket] = {

          ticket,

          registrations: 0,

          revenue: 0,

        };

      }


      ticketBreakdown[ticket].registrations++;

      ticketBreakdown[ticket].revenue += amount;

    }'''


api, revenue_count = re.subn(
    revenue_pattern,
    lambda match: revenue_replacement,
    api,
    count=1,
    flags=re.DOTALL
)

if revenue_count:
    print("✓ Event/merchandise revenue calculation added")
else:
    print("ERROR: Could not locate revenue block")
    raise SystemExit(1)


# ------------------------------------------------------------
# Add response fields
# ------------------------------------------------------------

response_pattern = (
    r'        totalAmount:\s*totalRevenue,\s*'
    r'inventory:\s*inventoryResult\.data\s*\?\?\s*\[\],'
)

response_replacement = '''        totalAmount:
          totalRevenue,

        eventRevenue:
          eventRevenue,

        merchandiseRevenue:
          merchandiseRevenue,

        eventRegistrations:
          eventRegistrations,

        merchandiseRegistrations:
          merchandiseRegistrations,

        eventBreakdown:
          Object.values(
            eventBreakdown
          ),

        ticketBreakdown:
          Object.values(
            ticketBreakdown
          ),

        inventory:
          inventoryResult.data ??
          [],'''

api, response_count = re.subn(
    response_pattern,
    response_replacement,
    api,
    count=1
)

if response_count:
    print("✓ Dashboard response expanded")
elif "eventBreakdown" in api and "ticketBreakdown" in api:
    print("✓ Dashboard response already expanded")
else:
    print("ERROR: Could not locate dashboard response")
    raise SystemExit(1)


API.write_text(api)


# ============================================================
# FRONTEND
# ============================================================

page = PAGE.read_text()


# ------------------------------------------------------------
# DashboardData
# ------------------------------------------------------------

dashboard_type_pattern = (
    r'type DashboardData = \{.*?'
    r'\n\};'
)

dashboard_type_replacement = '''type DashboardData = {

  success?: boolean;

  error?: string;

  registrations: number;

  totalAmount: number;

  eventRevenue?: number;

  merchandiseRevenue?: number;

  eventRegistrations?: number;

  merchandiseRegistrations?: number;

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


if "eventBreakdown?:" not in page:

    page, type_count = re.subn(
        dashboard_type_pattern,
        dashboard_type_replacement,
        page,
        count=1,
        flags=re.DOTALL
    )

    if type_count:
        print("✓ DashboardData type updated")
    else:
        print("ERROR: Could not locate DashboardData")
        raise SystemExit(1)

else:

    print("✓ DashboardData already contains event fields")


# ------------------------------------------------------------
# Add state
# ------------------------------------------------------------

state_marker = '''  const [
    dashboardTotalAmount,
    setDashboardTotalAmount,
  ] = useState(0);'''


state_replacement = '''  const [
    dashboardTotalAmount,
    setDashboardTotalAmount,
  ] = useState(0);

  const [
    eventRevenue,
    setEventRevenue,
  ] = useState(0);

  const [
    merchandiseRevenue,
    setMerchandiseRevenue,
  ] = useState(0);

  const [
    eventRegistrations,
    setEventRegistrations,
  ] = useState(0);

  const [
    merchandiseRegistrations,
    setMerchandiseRegistrations,
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


if "setEventRevenue" not in page:

    if state_marker not in page:
        print("ERROR: Could not locate dashboard state")
        raise SystemExit(1)

    page = page.replace(
        state_marker,
        state_replacement,
        1
    )

    print("✓ Event dashboard state added")

else:

    print("✓ Event dashboard state already exists")


# ------------------------------------------------------------
# API response mapping
# ------------------------------------------------------------

mapping_marker = '''        setDashboardTotalAmount(
          Number(
            data.totalAmount ?? 0
          )
        );'''


mapping_replacement = '''        setDashboardTotalAmount(
          Number(
            data.totalAmount ?? 0
          )
        );

        setEventRevenue(
          Number(
            data.eventRevenue ?? 0
          )
        );

        setMerchandiseRevenue(
          Number(
            data.merchandiseRevenue ?? 0
          )
        );

        setEventRegistrations(
          Number(
            data.eventRegistrations ?? 0
          )
        );

        setMerchandiseRegistrations(
          Number(
            data.merchandiseRegistrations ?? 0
          )
        );

        setEventBreakdown(
          data.eventBreakdown ?? []
        );

        setTicketBreakdown(
          data.ticketBreakdown ?? []
        );'''


if "setEventBreakdown(" not in page:

    if mapping_marker not in page:
        print("ERROR: Could not locate API mapping")
        raise SystemExit(1)

    page = page.replace(
        mapping_marker,
        mapping_replacement,
        1
    )

    print("✓ Event API mapping added")

else:

    print("✓ Event API mapping already exists")


# ============================================================
# REPLACE KEY FIGURES
# ============================================================

start = page.find(
    "        {/* Key figures */}"
)

if start == -1:

    print("ERROR: Could not locate Key figures")
    raise SystemExit(1)


end = page.find(
    "        <div className=\"grid grid-main mb-8\">",
    start
)

if end == -1:

    print("ERROR: Could not locate main dashboard grid")
    raise SystemExit(1)


new_key_figures = '''        {/* Key figures */}

        <section className="stat-grid">

          <div className="stat stat-feature">

            <span className="stat-label">
              Total Revenue
            </span>

            <strong className="stat-value">
              {loading
                ? "—"
                : formatAmount(totalAmount)}
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
                : formatAmount(eventRevenue)}
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
                : formatAmount(merchandiseRevenue)}
            </strong>

            <span className="stat-meta">
              {loading
                ? "—"
                : merchandiseRegistrations}
              {" "}merchandise orders
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


        <div className="grid grid-main mb-8">

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

                    <div className="skeleton skeleton-line" />

                    <div className="skeleton skeleton-line" />

                  </div>

                ))

              ) : eventBreakdown.length === 0 ? (

                <div className="empty">

                  <p className="empty-title">
                    No event data yet
                  </p>

                  <p className="empty-body">
                    Run Sync V-TAPP to load event data.
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
                        {formatAmount(event.revenue)}
                      </span>

                    </div>

                    <div className="meter-foot">

                      <span>
                        Event {event.event_id}
                      </span>

                      <span>
                        {event.registrations} registrations
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
                  Tickets sold and revenue
                </p>

              </div>

            </div>


            <div className="panel-body stack">

              {loading ? (

                [1, 2, 3, 4].map((row) => (

                  <div key={row}>

                    <div className="skeleton skeleton-line" />

                    <div className="skeleton skeleton-line" />

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
                          {ticket.registrations} registrations
                        </span>

                        <span>
                          {formatAmount(ticket.revenue)}
                        </span>

                      </div>

                    </div>

                  ))

              )}

            </div>

          </section>

        </div>


        {/* Merchandise */}

'''


page = (
    page[:start]
    + new_key_figures
    + page[end:]
)


# Rename existing sections
page = page.replace(
    '<h2 className="panel-title">Stock levels</h2>',
    '<h2 className="panel-title">Merchandise Stock</h2>',
    1
)

page = page.replace(
    '<h2 className="panel-title">Distribution</h2>',
    '<h2 className="panel-title">Merchandise Distribution</h2>',
    1
)


PAGE.write_text(page)


print("✓ Main dashboard frontend updated")
print()
print("=" * 70)
print(" UPDATE COMPLETE")
print("=" * 70)
print()
print("Now run:")
print()
print("  npm run build")
print()
