from pathlib import Path
import shutil
import re

p = Path("app/admin/page.tsx")

if not p.exists():
    raise SystemExit("ERROR: app/admin/page.tsx not found")

backup = Path("app/admin/page.tsx.layout-final-backup")
shutil.copy2(p, backup)

print("=" * 70)
print(" V-TAPP DASHBOARD GAP FIX")
print("=" * 70)
print(f"Backup: {backup}")
print()

s = p.read_text()

# ============================================================
# Locate the first dashboard grid
# ============================================================

first_start = s.find(
    '<div className="grid grid-main mb-8">'
)

if first_start == -1:
    raise SystemExit(
        "ERROR: First dashboard grid not found"
    )

merch_comment = s.find(
    '        {/* Merchandise */}',
    first_start
)

if merch_comment == -1:
    raise SystemExit(
        "ERROR: Merchandise section not found"
    )

first_grid = s[first_start:merch_comment]

# ============================================================
# Locate Event Overview and Ticket Breakdown
# ============================================================

event_start = first_grid.find(
    '          <section className="panel">'
)

if event_start == -1:
    raise SystemExit(
        "ERROR: Event Overview section not found"
    )

ticket_start = first_grid.find(
    '          <section className="panel">',
    event_start + 1
)

if ticket_start == -1:
    raise SystemExit(
        "ERROR: Ticket Breakdown section not found"
    )

event_section = first_grid[event_start:ticket_start].rstrip()

ticket_section = first_grid[ticket_start:]

# Remove the outer grid's closing div.
outer_close = ticket_section.rfind(
    "        </div>"
)

if outer_close == -1:
    raise SystemExit(
        "ERROR: Could not find first grid closing tag"
    )

ticket_section = ticket_section[:outer_close].rstrip()

print("✓ Event Overview located")
print("✓ Ticket Breakdown located")

# ============================================================
# Locate Merchandise grid
# ============================================================

merch_start = merch_comment

navigation_comment = s.find(
    '        {/* Navigation */}',
    merch_start
)

if navigation_comment == -1:
    raise SystemExit(
        "ERROR: Navigation section not found"
    )

merch_section = s[merch_start:navigation_comment]

# ============================================================
# Locate Stock and Distribution inside merchandise section
# ============================================================

stock_heading = '<h2 className="panel-title">Merchandise Stock</h2>'

stock_heading_pos = merch_section.find(stock_heading)

if stock_heading_pos == -1:
    raise SystemExit(
        "ERROR: Merchandise Stock heading not found"
    )

# Walk backwards to the section opening.
stock_start = merch_section.rfind(
    '          <section className="panel">',
    0,
    stock_heading_pos
)

if stock_start == -1:
    raise SystemExit(
        "ERROR: Merchandise Stock section opening not found"
    )

distribution_comment = merch_section.find(
    '          {/* Distribution */}',
    stock_start
)

if distribution_comment == -1:
    raise SystemExit(
        "ERROR: Distribution comment not found"
    )

distribution_start = merch_section.find(
    '          <section className="panel">',
    distribution_comment
)

if distribution_start == -1:
    raise SystemExit(
        "ERROR: Merchandise Distribution section not found"
    )

stock_section = merch_section[stock_start:distribution_start].rstrip()

distribution_section = merch_section[distribution_start:]

# Remove Merchandise grid closing div.
merch_outer_close = distribution_section.rfind(
    "        </div>"
)

if merch_outer_close == -1:
    raise SystemExit(
        "ERROR: Could not find Merchandise grid closing tag"
    )

distribution_section = distribution_section[
    :merch_outer_close
].rstrip()

print("✓ Merchandise Stock located")
print("✓ Merchandise Distribution located")

# ============================================================
# Build corrected layout
# ============================================================

new_layout = f'''        <div className="dashboard-event-layout mb-8">

          <div className="dashboard-event-left">

{event_section}

{stock_section}

{distribution_section}

          </div>

          <div className="dashboard-event-right">

{ticket_section}

          </div>

        </div>

'''

# Replace BOTH old grids.
s = (
    s[:first_start]
    + new_layout
    + s[navigation_comment:]
)

p.write_text(s)

print()
print("✓ Event Overview moved to left column")
print("✓ Merchandise Stock moved below Event Overview")
print("✓ Merchandise Distribution moved below Stock")
print("✓ Ticket Breakdown moved to independent right column")
print("✓ Original dashboard sections preserved")
print()
print("=" * 70)
print(" JSX UPDATE COMPLETE")
print("=" * 70)
print()
print("Now add the layout CSS.")
print()
