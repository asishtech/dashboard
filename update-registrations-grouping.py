from pathlib import Path
import shutil
import re

PAGE = Path("app/admin/registrations/page.tsx")

if not PAGE.exists():
    raise SystemExit("ERROR: app/admin/registrations/page.tsx not found")

backup = PAGE.with_suffix(".page.tsx.before-grouping")
shutil.copy2(PAGE, backup)

print("=" * 70)
print(" V-TAPP REGISTRATIONS — BUYER GROUPING")
print("=" * 70)
print()
print(f"Backup: {backup}")
print()

s = PAGE.read_text()

# ------------------------------------------------------------
# 1. Ensure Registration has event information
# ------------------------------------------------------------

if "event_id:" not in s:
    s = s.replace(
        'type Registration = {',
        '''type Registration = {
  event_id?: number | string | null;
  product_meta?: string | null;
''',
        1
    )
    print("✓ Registration event fields added")
else:
    print("✓ Registration event fields already exist")


# ------------------------------------------------------------
# 2. Add grouped buyer type + grouping function
# ------------------------------------------------------------

marker = '  const filtered ='

if "type BuyerGroup =" not in s:
    if marker not in s:
        raise SystemExit(
            "ERROR: Could not locate filtered registrations section"
        )

    grouping_code = r'''  type BuyerGroup = {
    email: string;
    name: string;
    registrations: Registration[];
    total: number;
    events: number;
    merchandise: number;
  };

  const groupedBuyers = useMemo(() => {
    const groups = new Map<string, BuyerGroup>();

    for (const registration of filtered) {
      const email = String(
        registration.email ?? ""
      ).trim().toLowerCase();

      const key =
        email || `registration:${registration.registration_id}`;

      const existing = groups.get(key);

      const eventId = String(
        registration.event_id ?? ""
      );

      const isMerchandise = eventId === "513";

      if (existing) {
        existing.registrations.push(registration);
        existing.total += Number(
          registration.total ?? 0
        );

        if (isMerchandise) {
          existing.merchandise++;
        } else {
          existing.events++;
        }
      } else {
        groups.set(key, {
          email: String(
            registration.email ?? ""
          ),
          name: String(
            registration.name ?? "Unknown"
          ),
          registrations: [registration],
          total: Number(
            registration.total ?? 0
          ),
          events: isMerchandise ? 0 : 1,
          merchandise: isMerchandise ? 1 : 0,
        });
      }
    }

    return Array.from(groups.values()).sort(
      (a, b) => b.total - a.total
    );
  }, [filtered]);

'''

    s = s.replace(marker, grouping_code + marker, 1)

    print("✓ Buyer grouping logic added")
else:
    print("✓ Buyer grouping logic already exists")


# ------------------------------------------------------------
# 3. Replace table body
# ------------------------------------------------------------

tbody_pattern = re.compile(
    r'(?s)<tbody>.*?</tbody>'
)

match = tbody_pattern.search(s)

if not match:
    raise SystemExit(
        "ERROR: Could not locate registrations table body"
    )

new_tbody = r'''<tbody>
  {groupedBuyers.map((buyer) => (
    <tr key={buyer.email}>
      <td>
        <div className="row-title">
          {buyer.name}
        </div>
        <div className="row-meta truncate">
          {buyer.email}
        </div>
      </td>

      <td>
        <div className="stack-tight">
          <span className="badge">
            {buyer.events} event
            {buyer.events === 1 ? "" : "s"}
          </span>

          {buyer.merchandise > 0 && (
            <span className="badge">
              {buyer.merchandise} merchandise
              {buyer.merchandise === 1 ? "" : " items"}
            </span>
          )}
        </div>
      </td>

      <td>
        <strong>
          {buyer.registrations.length}
        </strong>
        <span className="dim">
          {" "}purchase
          {buyer.registrations.length === 1 ? "" : "s"}
        </span>
      </td>

      <td>
        <div className="stack-tight">
          {buyer.registrations.slice(0, 3).map(
            (registration) => {
              const eventId = String(
                registration.event_id ?? ""
              );

              return (
                <div
                  key={
                    registration.registration_id
                  }
                  className="row-meta"
                >
                  {eventId === "513"
                    ? "Merchandise"
                    : eventId === "514"
                      ? "V-TAPP Event"
                      : `Event ${eventId || "Unknown"}`}
                </div>
              );
            }
          )}

          {buyer.registrations.length > 3 && (
            <div className="row-meta">
              +{buyer.registrations.length - 3} more
            </div>
          )}
        </div>
      </td>

      <td className="table-num">
        {formatAmount(buyer.total)}
      </td>

      <td className="table-num">
        <Link
          href={`/admin/registrations/${encodeURIComponent(
            buyer.registrations[0]
              .registration_id
          )}`}
          className="btn btn-ghost btn-sm"
        >
          View
        </Link>
      </td>
    </tr>
  ))}
</tbody>'''

s = (
    s[:match.start()]
    + new_tbody
    + s[match.end():]
)

print("✓ Registration table grouped by email")


# ------------------------------------------------------------
# 4. Change table headers
# ------------------------------------------------------------

old_headers = re.compile(
    r'(?s)<thead>.*?</thead>'
)

header_match = old_headers.search(s)

if not header_match:
    raise SystemExit(
        "ERROR: Could not locate table header"
    )

new_headers = r'''<thead>
  <tr>
    <th scope="col">Buyer</th>
    <th scope="col">Type</th>
    <th scope="col">Purchases</th>
    <th scope="col">Activity</th>
    <th scope="col" className="table-num">
      Total
    </th>
    <th scope="col">
      <span className="sr-only">
        Actions
      </span>
    </th>
  </tr>
</thead>'''

s = (
    s[:header_match.start()]
    + new_headers
    + s[header_match.end():]
)

print("✓ Table headers updated")


# ------------------------------------------------------------
# 5. Update footer count
# ------------------------------------------------------------

s = re.sub(
    r'Showing \{filtered\.length\} of \{registrations\.length\}',
    'Showing {groupedBuyers.length} buyers from {registrations.length}',
    s
)

print("✓ Footer changed to buyer count")


# ------------------------------------------------------------
# 6. Update empty-state condition
# ------------------------------------------------------------

s = s.replace(
    'filtered.length === 0 ?',
    'groupedBuyers.length === 0 ?',
    1
)

print("✓ Empty state updated")


# ------------------------------------------------------------
# 7. Save
# ------------------------------------------------------------

PAGE.write_text(s)

print()
print("✓ page.tsx saved successfully")
print()
print("=" * 70)
print(" BUYER GROUPING COMPLETE")
print("=" * 70)
print()
print("Grouping key:")
print("  email.trim().toLowerCase()")
print()
print("Event ID 514 → V-TAPP Events")
print("Event ID 513 → Merchandise")
print()
print("Individual registration records remain untouched.")
print()
print("Next:")
print("  npm run build")
print()
