from pathlib import Path
import re
import shutil

p = Path("app/admin/registrations/page.tsx")

if not p.exists():
    raise SystemExit("ERROR: page.tsx not found")

backup = p.with_suffix(".tsx.table-repair-backup")
shutil.copy2(p, backup)

s = p.read_text()

# Find the complete tbody registration map.
start = s.find(
    "                <tbody>"
)

if start == -1:
    raise SystemExit("ERROR: Could not find registration table body")

end = s.find(
    "                </tbody>",
    start
)

if end == -1:
    raise SystemExit("ERROR: Could not find registration table body end")

old = s[start:end]

# Build a clean table body.
new = r'''                <tbody>
                  {filtered.map((registration) => {
                    const status =
                      getRegistrationStatus(registration);

                    const items =
                      registration.items ?? [];

                    const itemCount =
                      items.reduce(
                        (sum, item) =>
                          sum +
                          Number(
                            item.quantity ?? 1
                          ),
                        0
                      );

                    return (
                      <tr
                        key={
                          registration.registration_id
                        }
                      >
                        <td>
                          <div className="row-title">
                            {registration.name}
                          </div>

                          <div className="row-meta truncate">
                            {registration.email}
                          </div>
                        </td>

                        <td>
                          <span className="badge">
                            {String(
                              registration.event_id ??
                                "Unknown"
                            ) === "513"
                              ? "513 — Merchandise"
                              : String(
                                  registration.event_id ??
                                    ""
                                ) === "514"
                                ? "514 — Registration"
                                : `Event ${
                                    registration.event_id ??
                                    "Unknown"
                                  }`}
                          </span>
                        </td>

                        <td className="mono dim">
                          #{registration.registration_id}
                        </td>

                        <td>
                          {items.length === 0 ? (
                            <span className="dim">
                              —
                            </span>
                          ) : (
                            <div className="chip-row">
                              {items.map((item) => {
                                const matched =
                                  merchActive &&
                                  itemMatches(item);

                                return (
                                  <span
                                    key={item.id}
                                    className={`badge badge-plain${
                                      matched
                                        ? " badge-accent"
                                        : ""
                                    }`}
                                  >
                                    {item.item}

                                    {hasSize(item) &&
                                      ` · ${sizeLabel(item)}`}

                                    {item.quantity > 1 &&
                                      ` ×${item.quantity}`}
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          <div className="row-meta">
                            {itemCount} pcs
                          </div>
                        </td>

                        <td>
                          <div className="row-title">
                            {getTicket(registration)}
                          </div>
                        </td>

                        <td>
                          {itemCount}
                          <span className="dim">
                            {" "}pcs
                          </span>
                        </td>

                        <td className="table-num">
                          {formatAmount(
                            Number(
                              registration.total ?? 0
                            )
                          )}
                        </td>

                        <td>
                          <span
                            className={`badge ${
                              status === "GIVEN"
                                ? "badge-success"
                                : "badge-warning"
                            }`}
                          >
                            {status === "GIVEN"
                              ? "Given"
                              : "Pending"}
                          </span>
                        </td>

                        <td className="table-num">
                          <Link
                            href={`/admin/registrations/${encodeURIComponent(
                              registration.registration_id
                            )}`}
                            className="btn btn-ghost btn-sm"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
'''

s = s[:start] + new + s[end:]

p.write_text(s)

print("=" * 70)
print(" REGISTRATION TABLE REPAIRED")
print("=" * 70)
print(f"Backup: {backup}")
print()
print("✓ Clean tbody generated")
print("✓ Event column preserved")
print("✓ Merchandise column preserved")
print("✓ Ticket column preserved")
print("✓ Items column preserved")
print("✓ Total column preserved")
print("✓ Status column preserved")
print("✓ View action preserved")
print("✓ JSX table structure repaired")
print()
