# V-TAPP Dashboard — audit

Everything below was measured against the live system on **3 September
2026**, not asserted from reading the code. Where something is
untested, it says so; an audit that only lists what passes is not worth
keeping.

---

## 1. Authorization

27 API handlers, every one guarded.

| Route | Verb | Guard |
|---|---|---|
| `admin/coordinators` | GET POST PATCH DELETE | admin |
| `admin/users` | GET POST PATCH | admin |
| `auth/role` | GET POST | signed-in (`getSession`) |
| `auth/staff-sync` | POST | signed-in |
| `buyer` | GET | signed-in, scoped to own email |
| `checkin` | GET POST | volunteer, admin, faculty |
| `checkin` | **DELETE** | **admin only** |
| `checkin/manifest` | GET | volunteer, admin, faculty |
| `dashboard` | GET | admin |
| `distribution/[token]` | GET | volunteer, admin, faculty |
| `distribution` | POST | volunteer, admin |
| `distribution` | PATCH (reverse) | admin |
| `events`, `events/[id]` | GET | admin, faculty |
| `events/[id]` | PATCH | admin |
| `inventory` | GET PUT | admin |
| `registrations`, `registrations/[id]` | GET | admin |
| `sync` | POST | admin |

Page access, enforced in `proxy.ts` before anything renders:

| Path | Roles |
|---|---|
| `/admin/**` | admin |
| `/events/**` | admin, faculty |
| `/volunteer/**` | volunteer, admin, faculty |
| `/buyer/**` | buyer, admin |
| `/login`, `/offline`, `/auth/**` | public |
| everything else | any signed-in account |

### Decisions worth knowing

**Undo is admin-only, on both paths.** Reversing an admission
(`DELETE /api/checkin`) and reversing a merchandise handover
(`PATCH /api/distribution`) are barred to volunteers. One-entry-per-QR
only means something if the person holding the scanner cannot quietly
wave a pass through twice; letting them undo their own scan returns
exactly the power the constraint removes.

**Coordinators are scoped in SQL, not in the UI.** `canReadEvent()`
gates the event API and `/api/checkin`, and the offline manifest is
filtered the same way — a coordinator's device never receives another
club's attendees. An event whose ticket matched no known event has no
owner, so only unrestricted staff can admit it.

**Money is removed from payloads, not hidden.** `/api/events` deletes
`revenue`, `paidRegistrations` and `freeRegistrations` for non-admins
before responding. Anything sent to a browser is readable in devtools.

**A QR is a bearer credential.** Viewing a pass is properly gated —
`/claim/<token>` requires a session, then the owner's email or an
admin/volunteer role, otherwise "QR access denied". But the *gate*
never loads that page: anyone holding a photograph of a pass can
present it. Mitigations in place: one entry per QR (a copy locks out
the original or is caught when they arrive), the attendee's name shown
before admitting, and `scanned_by` recording which account admitted
them. **Not solved:** identity is not verified at the gate.

---

## 2. Data integrity

All nine migrations applied.

```
multi-role · event-pricing · buyer-dashboard · merchandise-sizes
event-checkin · external-registrations · coordinator-details
event-details · resolve-once
```

| Check | Result |
|---|---|
| Registrations | 1,214 |
| Unresolved to an event | **0** |
| Missing a QR token | **0** |
| Events | 92 |
| Events with no price | 3 |
| Coordinators | 191 |
| Coordinators without a phone | 69 |
| Staff invites | 136 |
| Profiles (ever signed in) | 12 |
| Check-ins recorded | 1 |

### Constraints doing real work

- `qr_scans (registration_id) unique` — one entry per pass. Verified:
  a second insert is rejected, undo removes it, the pass then works
  again.
- `email_log (registration_id, kind) unique where status='sent'` —
  removed with the mail system, listed here only because the table may
  still exist in the database.
- `event_coordinators (email, event_id) unique` — caught duplicate
  rows in both spreadsheets.
- `registrations_resolve_event` trigger — recomputes only when
  `event_id` or `product_meta` changes, so a sync that upserts every
  row does not re-resolve unchanged ones.

### Known data gaps, all from the source

- **3 events have no price.** `merchandise` plus two rows predating the
  seed. They show as "Unclassified" on the events tabs.
- **69 of 191 coordinators have no phone.** Faculty numbers were only
  38 of 89 in the master sheet. The screen allows typing them in.
- **16 registrations have unknown origin** — a personal address and a
  blank university, so they cannot honestly be called external.

---

## 3. Performance

Live, against production, after `resolve-once.sql`:

| Query | Before | Now |
|---|---|---|
| `event_summaries()` | 3,576 ms | **1,215 ms** |
| `registration_event_map()` | 3,314 ms | **730 ms** |
| `dashboard_summary()` | 506 ms | 460 ms |
| `merchandise_by_size()` | — | 370 ms |
| `coordinator_directory()` | — | 505 ms |
| `coordinator_gaps()` | — | 365 ms |

The two slow ones called `resolve_event()` per registration —
regex-normalising every event name against every row, roughly 95,000
regex operations per page view. It is now a stored column with an
index. On a local replica at the same scale the same change measured
840 ms → 50 ms; the live figures are higher because network and shared
CPU are a floor no query change gets under.

**Paging.** PostgREST caps a response at 1,000 rows and says nothing.
At 1,062 registrations the admin list had silently lost 60 people and
the dashboard head count was computed from a subset. `lib/paged.ts`
reads until a short page arrives, ordering by `id` last so ties cannot
let rows swap between pages.

---

## 4. Accessibility

22 text and control combinations measured against **rendered pixels**,
with every translucent layer composited — not against the token values.

| | Ratio |
|---|---|
| Lowest of all | accent badge **4.97** |
| Body text, worst surface | 15.2 |
| Muted text, worst surface | 10.1 |
| Dim text, worst surface | 6.9 |
| Primary button label | 8.4 / 6.07 across both gradient stops |
| White icon on logo ramp | 3.93 / 5.68 / 9.93 |

**Nothing below 4.5:1.** Two failures were found and fixed during the
palette port: white on the brand orange (3.26 and 2.36 — `--on-accent`
is near-black now) and the white logo icon on brand-bright (2.36 where
a graphic needs 3:1 — the ramp starts at brand-600).

Gradients are checked at every stop, never averaged: a ramp legible at
one end and not the other is worse than a flat colour.

### Responsive

Swept 320, 375, 414, 768, 1024 and 1440. **No horizontal page overflow
at any width.** Tables scroll inside their wrapper; the nav links
scroll inside their own track rather than wrapping the bar; filter
strips are contained. Touch targets are 44–46px.

---

## 5. Offline

The scanner works with no network.

| Piece | Behaviour |
|---|---|
| App shell | Cached; `/volunteer` and `/offline` precached |
| API responses | **Never cached** — a stale one would be wrong, not merely old |
| Pass lookup | Resolves against a list downloaded in advance |
| Admission | Queued locally, synced on reconnect / `online` / 20s poll |
| Duplicate protection | Queue is idempotent; a 409 on sync counts as success |

12 queue cases tested: double taps, an already-used pass, 200/409/403/
503, and a thrown fetch. A `4xx` is dropped rather than retried
forever; a `5xx` or dead connection stays queued.

**Requires one online visit first** to download the pass list. A device
that has never been online has nothing to resolve against.

**Privacy note:** the cached list holds names and event details for
every pass that account may admit — on the volunteer's own phone.
Emails and amounts are excluded. A lost phone exposes names.

The service worker does not register in development: dev asset URLs are
not content-hashed, and a cached one goes stale in a way no restart
shifts.

---

## 6. Code health

| | |
|---|---|
| Tracked files | 87 |
| TypeScript errors | **0** |
| ESLint errors | **0** |
| ESLint warnings | 13 |
| npm vulnerabilities (prod) | **0** |
| Production dependencies | 7 |

The 13 warnings are deliberate `window.location.href` navigations —
used where a hard reload is needed so the proxy re-runs with a new
profile or role — plus one unused variable predating this work.

**Secrets.** `.env.local`, both local SQL seeds (191 real names, emails
and phone numbers) and the HTTPS private key are all gitignored. No
credential-shaped string is committed.

**Removed:** 20,924 lines — 22 backup files, 9 one-off Python scripts,
and the entire mail system.

---

## 7. Not verified

Listed because their absence is the useful part of an audit.

1. **Check-in has never run at scale.** `qr_scans` holds one row. The
   flow has been exercised once by hand; it has never met a queue.
2. **Email does not exist.** Removed after the university refused both
   an App Password and an OAuth token. Nothing sends. Registration
   passes are only reachable by signing in.
3. **Only 12 of ~600 people have ever signed in.** The buyer flow is
   essentially untested by real students.
4. **One volunteer invite exists.** Anyone else scanning at a gate
   needs adding at `/admin/users` first — an uninvited account cannot
   scan at all.
5. **Offline sync has not been tested on a real flaky connection**,
   only against simulated responses.
6. **The dedupe migration changed historical check-in numbers.** Rows
   were previously written by *lookup*, so old counts recorded how
   often a code was looked at. Duplicates were collapsed to the
   earliest.
7. **No automated test suite.** Everything here was verified by
   one-off scripts and replicas built from the live schema. That is
   better than nothing and worse than tests.

---

## 8. Recommended before the fest

1. Add volunteer accounts — currently one.
2. Open the scanner once on wifi on every device that will work a gate,
   so the offline pass list downloads.
3. Install the app to the home screen on those devices; an installed
   PWA keeps its cache between sessions.
4. Fill in the 69 missing coordinator phone numbers, or accept the gap.
5. Decide whether an unidentified pass-holder at a gate matters enough
   to check ID against the name shown.
