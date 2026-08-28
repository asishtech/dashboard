from pathlib import Path
import shutil
import re

PAGE = Path("app/admin/page.tsx")

if not PAGE.exists():
    raise SystemExit("ERROR: app/admin/page.tsx not found")

print("=" * 70)
print(" V-TAPP ADMIN FRONTEND UPDATER")
print("=" * 70)
print()

# ------------------------------------------------------------
# BACKUP
# ------------------------------------------------------------

backup = Path("app/admin/page.tsx.frontend-backup")

shutil.copy2(PAGE, backup)

print(f"Backup: {backup}")
print()

s = PAGE.read_text()


# ============================================================
# 1. DASHBOARD DATA TYPE
# ============================================================

if "eventQrScanned?: number;" not in s:

    marker = "  totalAmount: number;"

    addition = """  totalAmount: number;

  eventQrScanned?: number;

  merchandiseQrScanned?: number;

  eventRegistrationCount?: number;

  merchandiseRegistrationCount?: number;"""

    if marker not in s:
        raise SystemExit(
            "ERROR: Could not locate totalAmount in DashboardData"
        )

    s = s.replace(marker, addition, 1)

    print("✓ QR dashboard fields added")

else:
    print("✓ QR dashboard fields already exist")


# ============================================================
# 2. STATE
# ============================================================

if "setEventQrScanned" not in s:

    marker = """  ] = useState(0);

  const [
    distribution,
    setDistribution,"""

    replacement = """  ] = useState(0);

  const [
    eventQrScanned,
    setEventQrScanned,
  ] = useState(0);

  const [
    merchandiseQrScanned,
    setMerchandiseQrScanned,
  ] = useState(0);

  const [
    eventRegistrationCount,
    setEventRegistrationCount,
  ] = useState(0);

  const [
    merchandiseRegistrationCount,
    setMerchandiseRegistrationCount,
  ] = useState(0);

  const [
    distribution,
    setDistribution,"""

    if marker not in s:
        raise SystemExit(
            "ERROR: Could not locate dashboard state"
        )

    s = s.replace(marker, replacement, 1)

    print("✓ QR state added")

else:
    print("✓ QR state already exists")


# ============================================================
# 3. API RESPONSE MAPPING
# ============================================================

if "setEventQrScanned(" not in s:

    marker = """        setDashboardTotalAmount(
          Number(
            data.totalAmount ?? 0
          )
        );"""

    replacement = """        setDashboardTotalAmount(
          Number(
            data.totalAmount ?? 0
          )
        );

        setEventQrScanned(
          Number(
            data.eventQrScanned ?? 0
          )
        );

        setMerchandiseQrScanned(
          Number(
            data.merchandiseQrScanned ?? 0
          )
        );

        setEventRegistrationCount(
          Number(
            data.eventRegistrationCount ?? 0
          )
        );

        setMerchandiseRegistrationCount(
          Number(
            data.merchandiseRegistrationCount ?? 0
          )
        );"""

    if marker not in s:
        raise SystemExit(
            "ERROR: Could not locate dashboard response mapping"
        )

    s = s.replace(marker, replacement, 1)

    print("✓ QR API response mapping added")

else:
    print("✓ QR API mapping already exists")


# ============================================================
# 4. FIND KEY FIGURES
# ============================================================

start = s.find("        {/* Key figures */}")

if start == -1:
    raise SystemExit(
        "ERROR: Could not locate Key figures section"
    )

end = s.find(
    "        <div className=\"grid grid-main mb-8\">",
    start
)

if end == -1:
    raise SystemExit(
        "ERROR: Could not locate dashboard grid"
    )


# ============================================================
# 5. REPLACE KEY FIGURES
# ============================================================

new_section = """        {/* Key figures */}

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
                : formatAmount(
                    eventRevenue
                  )}
            </strong>

            <span className="stat-meta">
              {loading
                ? "—"
                : eventRegistrationCount}
              {" "}registrations
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
                : merchandiseRegistrationCount}
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


        {/* QR & Distribution */}

        <section className="panel mb-8">

          <div className="panel-header">

            <div>

              <span className="page-eyebrow">
                V-TAPP / Operations
              </span>

              <h2 className="panel-title">
                QR & Distribution
              </h2>

              <p className="panel-subtitle">
                Live QR scanning and merchandise collection
              </p>

            </div>

          </div>


          <div className="stat-grid">


            {/* MERCHANDISE */}

            <div className="stat">

              <span className="stat-label">
                Merchandise QR Scanned
              </span>

              <strong className="stat-value">
                {loading
                  ? "—"
                  : merchandiseQrScanned}
              </strong>

              <span className="stat-meta">
                Event ID 513
              </span>

            </div>


            <div className="stat">

              <span className="stat-label">
                Merchandise Given
              </span>

              <strong className="stat-value stat-success">
                {loading
                  ? "—"
                  : distribution.given}
              </strong>

              <span className="stat-meta">
                Items handed over
              </span>

            </div>


            <div className="stat">

              <span className="stat-label">
                Merchandise Pending
              </span>

              <strong className="stat-value stat-warning">
                {loading
                  ? "—"
                  : Math.max(
                      distribution.pending,
                      0
                    )}
              </strong>

              <span className="stat-meta">
                Items remaining to collect
              </span>

            </div>


            {/* EVENT */}

            <div className="stat">

              <span className="stat-label">
                Event QR Scanned
              </span>

              <strong className="stat-value">
                {loading
                  ? "—"
                  : eventQrScanned}
              </strong>

              <span className="stat-meta">
                Event ID 514
              </span>

            </div>


            <div className="stat">

              <span className="stat-label">
                Event Registrations
              </span>

              <strong className="stat-value">
                {loading
                  ? "—"
                  : eventRegistrationCount}
              </strong>

              <span className="stat-meta">
                Event ID 514
              </span>

            </div>


            <div className="stat">

              <span className="stat-label">
                Event QR Pending
              </span>

              <strong className="stat-value stat-warning">
                {loading
                  ? "—"
                  : Math.max(
                      eventRegistrationCount -
                      eventQrScanned,
                      0
                    )}
              </strong>

              <span className="stat-meta">
                Not yet scanned
              </span>

            </div>

          </div>

        </section>


        {/* Event Analytics */}

        <section className="panel mb-8">

          <div className="panel-header">

            <div>

              <span className="page-eyebrow">
                V-TAPP / Events
              </span>

              <h2 className="panel-title">
                Event Operations
              </h2>

              <p className="panel-subtitle">
                Event ID 514 versus Merchandise ID 513
              </p>

            </div>

          </div>


          <div className="table-wrap">

            <table className="table">

              <thead>

                <tr>

                  <th>Category</th>

                  <th>Event ID</th>

                  <th>Registrations</th>

                  <th>QR Scanned</th>

                  <th>Pending</th>

                </tr>

              </thead>

              <tbody>

                <tr>

                  <td>

                    <div className="row-title">
                      V-TAPP Events
                    </div>

                    <div className="row-meta">
                      Event registration
                    </div>

                  </td>

                  <td className="mono">
                    514
                  </td>

                  <td>
                    {loading
                      ? "—"
                      : eventRegistrationCount}
                  </td>

                  <td>

                    <span className="badge badge-success">

                      {loading
                        ? "—"
                        : eventQrScanned}

                    </span>

                  </td>

                  <td>

                    <span className="badge badge-warning">

                      {loading
                        ? "—"
                        : Math.max(
                            eventRegistrationCount -
                            eventQrScanned,
                            0
                          )}

                    </span>

                  </td>

                </tr>


                <tr>

                  <td>

                    <div className="row-title">
                      Merchandise
                    </div>

                    <div className="row-meta">
                      Merchandise collection
                    </div>

                  </td>

                  <td className="mono">
                    513
                  </td>

                  <td>
                    {loading
                      ? "—"
                      : merchandiseRegistrationCount}
                  </td>

                  <td>

                    <span className="badge badge-success">

                      {loading
                        ? "—"
                        : merchandiseQrScanned}

                    </span>

                  </td>

                  <td>

                    <span className="badge badge-warning">

                      {loading
                        ? "—"
                        : Math.max(
                            merchandiseRegistrationCount -
                            merchandiseQrScanned,
                            0
                          )}

                    </span>

                  </td>

                </tr>

              </tbody>

            </table>

          </div>

        </section>


        {/* Merchandise */}

"""


s = (
    s[:start]
    + new_section
    + s[end:]
)


# ============================================================
# SAVE
# ============================================================

PAGE.write_text(s)

print("✓ Main dashboard frontend updated")
print("✓ Total/Event/Merchandise revenue cards added")
print("✓ QR & Distribution section added")
print("✓ Event 514 QR metrics added")
print("✓ Merchandise 513 QR metrics added")
print("✓ Event operations table added")
print()
print("=" * 70)
print(" UPDATE COMPLETE")
print("=" * 70)
print()
print("Run:")
print("  npm run build")
print()
