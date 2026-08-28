from pathlib import Path
import shutil

p = Path("app/admin/registrations/page.tsx")

if not p.exists():
    raise SystemExit("ERROR: page.tsx not found")

backup = p.with_suffix(".tsx.pre-final-merge")
shutil.copy2(p, backup)

s = p.read_text()

if "<<<<<<< HEAD" not in s:
    raise SystemExit("ERROR: No merge conflict found")

# ------------------------------------------------------------
# 1. Resolve the helper-function conflict
# ------------------------------------------------------------

start = s.find("<<<<<<< HEAD")
end = s.find(">>>>>>> 6f5b120 (ab)", start)

if start == -1 or end == -1:
    raise SystemExit("ERROR: Could not locate helper conflict")

end += len(">>>>>>> 6f5b120 (ab)")

helper = r'''  /*
   * Does a single line match the merchandise + size filters?
   */
  const itemMatches = useCallback(
    (item: RegistrationItem) => {
      if (
        merchFilter !== "ALL" &&
        item.item !== merchFilter
      ) {
        return false;
      }

      if (sizeFilter === "ALL") {
        return true;
      }

      if (sizeFilter === NO_SIZE) {
        return !hasSize(item);
      }

      return (item.size ?? "").trim() === sizeFilter;
    },
    [merchFilter, sizeFilter]
  );

  /* Distinct merchandise types across registrations. */
  const merchTypes = useMemo(() => {
    const set = new Set<string>();

    for (const registration of registrations) {
      for (const item of registration.items ?? []) {
        if (item.item) {
          set.add(item.item);
        }
      }
    }

    return Array.from(set).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [registrations]);

  /*
   * Sizes are scoped to the selected merchandise type.
   */
  const { sizeOptions, hasNoSize } = useMemo(() => {
    const set = new Set<string>();
    let noSize = false;

    for (const registration of registrations) {
      for (const item of registration.items ?? []) {
        if (
          merchFilter !== "ALL" &&
          item.item !== merchFilter
        ) {
          continue;
        }

        const size = (item.size ?? "").trim();

        if (size) {
          set.add(size);
        } else {
          noSize = true;
        }
      }
    }

    return {
      sizeOptions: Array.from(set).sort((a, b) =>
        a.localeCompare(b, undefined, {
          numeric: true,
        })
      ),
      hasNoSize: noSize,
    };
  }, [registrations, merchFilter]);

  const merchActive =
    merchFilter !== "ALL" ||
    sizeFilter !== "ALL";

  const getTicket = useCallback(
    (registration: Registration) => {
      if (registration.ticket) {
        return registration.ticket;
      }

      const meta =
        registration.product_meta ?? "";

      const match =
        meta.match(/Ticket:\s*(.+)/i);

      return match
        ? match[1].trim()
        : "Unknown";
    },
    []
  );'''

s = s[:start] + helper + s[end:]

# ------------------------------------------------------------
# 2. Resolve table-header conflict
# ------------------------------------------------------------

header_start = s.find("<<<<<<< HEAD")
header_end = s.find(">>>>>>> 6f5b120 (ab)", header_start)

if header_start == -1 or header_end == -1:
    raise SystemExit("ERROR: Could not locate table header conflict")

header_end += len(">>>>>>> 6f5b120 (ab)")

headers = '''                    <th scope="col">Merchandise</th>
                    <th scope="col">Ticket</th>
                    <th scope="col">Items</th>'''

s = s[:header_start] + headers + s[header_end:]

# ------------------------------------------------------------
# 3. Resolve merchandise cell conflict
# ------------------------------------------------------------

cell_start = s.find("<<<<<<< HEAD")
cell_end = s.find(">>>>>>> 6f5b120 (ab)", cell_start)

if cell_start == -1 or cell_end == -1:
    raise SystemExit("ERROR: Could not locate merchandise cell conflict")

cell_end += len(">>>>>>> 6f5b120 (ab)")

cells = '''                          {items.length === 0 ? (
                            <span className="dim">—</span>
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
                          <span className="dim"> pcs</span>
                        </td>'''

s = s[:cell_start] + cells + s[cell_end:]

# ------------------------------------------------------------
# 4. Safety check
# ------------------------------------------------------------

for marker in (
    "<<<<<<< HEAD",
    "=======",
    ">>>>>>> 6f5b120",
):
    if marker in s:
        raise SystemExit(
            f"ERROR: Conflict marker still exists: {marker}"
        )

p.write_text(s)

print("=" * 70)
print(" REGISTRATION MERGE RESOLVED")
print("=" * 70)
print(f"Backup: {backup}")
print()
print("✓ Merchandise + size filters preserved")
print("✓ Ticket extraction preserved")
print("✓ Event column preserved")
print("✓ Merchandise column preserved")
print("✓ Ticket column preserved")
print("✓ Items column preserved")
print("✓ Conflict markers removed")
print("✓ page.tsx saved")
print()
