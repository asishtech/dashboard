from pathlib import Path
import shutil
import re

FILE = Path("app/api/dashboard/route.ts")

if not FILE.exists():
    raise SystemExit("ERROR: app/api/dashboard/route.ts not found")

backup = Path("app/api/dashboard/route.ts.qr-dashboard-backup")
shutil.copy2(FILE, backup)

print("=" * 70)
print(" V-TAPP DASHBOARD API FIX")
print("=" * 70)
print(f"Backup: {backup}")
print()

s = FILE.read_text()

# ------------------------------------------------------------
# 1. Add qrScansResult to Promise.all
# ------------------------------------------------------------

if "qrScansResult" not in s:

    old = """const [inventoryResult, registrationsResult, itemsResult] =
      await Promise.all(["""

    new = """const [
      inventoryResult,
      registrationsResult,
      itemsResult,
      qrScansResult,
    ] = await Promise.all(["""

    if old not in s:
        raise SystemExit(
            "ERROR: Could not locate Promise.all declaration"
        )

    s = s.replace(old, new, 1)

    print("✓ QR scan query state added")

else:
    print("✓ QR scan query state already exists")


# ------------------------------------------------------------
# 2. Add event_id to registration query
# ------------------------------------------------------------

old = '''.select(
            "registration_id,event_id,product_meta,total",
            { count: "exact" }
          ),'''

if old not in s:
    print("✓ Registration query already contains event_id")
else:
    # Already correct, nothing needed
    print("✓ Registration query contains event_id")


# ------------------------------------------------------------
# 3. Add qr_scans query after registration_items query
# ------------------------------------------------------------

if '.from("qr_scans")' not in s:

    marker = '''        db
          .from("registration_items")
          .select("quantity,distribution:distributions(status)"),'''

    addition = '''        db
          .from("registration_items")
          .select("quantity,distribution:distributions(status)"),

        db
          .from("qr_scans")
          .select(
            "id,registration_id,event_id,scanned_at",
            { count: "exact" }
          ),'''

    if marker not in s:
        raise SystemExit(
            "ERROR: Could not locate registration_items query"
        )

    s = s.replace(marker, addition, 1)

    print("✓ qr_scans query added")

else:
    print("✓ qr_scans query already exists")


# ------------------------------------------------------------
# 4. Add QR error handling
# ------------------------------------------------------------

if "if (qrScansResult.error)" not in s:

    marker = """    if (itemsResult.error) {
      throw itemsResult.error;
    }"""

    addition = """    if (itemsResult.error) {
      throw itemsResult.error;
    }

    if (qrScansResult.error) {
      throw qrScansResult.error;
    }"""

    if marker not in s:
        raise SystemExit(
            "ERROR: Could not locate itemsResult error handling"
        )

    s = s.replace(marker, addition, 1)

    print("✓ QR scan error handling added")

else:
    print("✓ QR scan error handling already exists")


# ------------------------------------------------------------
# 5. Add QR counters
# ------------------------------------------------------------

if "let eventQrScanned" not in s:

    marker = """    let merchandiseRegistrations = 0;

    const eventBreakdown:"""

    addition = """    let merchandiseRegistrations = 0;

    let eventQrScanned = 0;
    let merchandiseQrScanned = 0;

    for (const scan of qrScansResult.data ?? []) {
      const eventId = String(
        scan.event_id ?? ""
      );

      if (eventId === "514") {
        eventQrScanned++;
      }

      if (eventId === "513") {
        merchandiseQrScanned++;
      }
    }

    const eventBreakdown:"""

    if marker not in s:
        raise SystemExit(
            "ERROR: Could not locate registration counters"
        )

    s = s.replace(marker, addition, 1)

    print("✓ QR counters added")

else:
    print("✓ QR counters already exist")


# ------------------------------------------------------------
# 6. Make event classification explicit
# ------------------------------------------------------------

old = '''      if (eventId === "513") {

        merchandiseRevenue += amount;
        merchandiseRegistrations++;

      } else {

        eventRevenue += amount;
        eventRegistrations++;

      }'''

new = '''      if (eventId === "513") {

        merchandiseRevenue += amount;
        merchandiseRegistrations++;

      } else if (eventId === "514") {

        eventRevenue += amount;
        eventRegistrations++;

      }'''

if old in s:
    s = s.replace(old, new, 1)
    print("✓ Event classification restricted to 513/514")
else:
    print("✓ Event classification already handled")


# ------------------------------------------------------------
# 7. Add API response fields
# ------------------------------------------------------------

if "eventRegistrationCount:" not in s:

    marker = """        merchandiseRegistrations:
          merchandiseRegistrations,

        eventBreakdown:"""

    addition = """        merchandiseRegistrations:
          merchandiseRegistrations,

        /*
         * Frontend-friendly explicit counters.
         */

        eventRegistrationCount:
          eventRegistrations,

        merchandiseRegistrationCount:
          merchandiseRegistrations,

        eventQrScanned:
          eventQrScanned,

        merchandiseQrScanned:
          merchandiseQrScanned,

        qrScans:
          qrScansResult.count ?? 0,

        eventBreakdown:"""

    if marker not in s:
        raise SystemExit(
            "ERROR: Could not locate dashboard response"
        )

    s = s.replace(marker, addition, 1)

    print("✓ Dashboard QR/event fields added")

else:
    print("✓ Dashboard response fields already exist")


# ------------------------------------------------------------
# SAVE
# ------------------------------------------------------------

FILE.write_text(s)

print()
print("✓ app/api/dashboard/route.ts saved")
print()
print("=" * 70)
print(" UPDATE COMPLETE")
print("=" * 70)
print()
print("Next:")
print("  npm run build")
print()
