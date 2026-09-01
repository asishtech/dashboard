# V-TAPP Dashboard

Registration, inventory and merchandise distribution dashboard for
V-TAPP. Built with Next.js 16 (App Router) and Supabase.

## Roles

| Role | Entry point | Can do |
| --- | --- | --- |
| `admin` | `/admin` | Dashboard, registrations, inventory, staff management, reverse a distribution, trigger a V-TAPP sync |
| `volunteer` | `/volunteer` | Dashboard, scan a buyer QR and hand merchandise over |
| `coordinator` | `/events` | Their assigned events only: registrations, check-in progress, and a participant list |
| `buyer` | `/buyer` | See their own registrations and QR codes |

Admins and volunteers are provisioned by email through
`staff_invites`; the matching `profiles` row is created by
`/api/auth/staff-sync` the first time they sign in with Google.

Club coordinators are added at `/admin/coordinators`, which writes
both a `staff_invites` row (granting the role) and an
`event_coordinators` row (scoping them to one event). Both halves are
required: the invite alone would sign them in unscoped.

A coordinator sees participant **name, email and registration number**
for their own events. Mobile numbers, payment records and other clubs'
events are stripped from the response server-side rather than hidden
by the UI.

## Getting started

```bash
npm install
```

Create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

# Upstream ticketing API, used by /api/sync
VTAPP_API_URL=<url>
VTAPP_API_KEY=<key>

# Optional. Origin baked into printed QR codes.
# Falls back to the request's own origin.
NEXT_PUBLIC_APP_URL=https://<your-domain>
```

Then:

```bash
npm run dev
```

## Layout

```
app/api/          Route handlers. Every one authorizes itself.
app/admin/        Admin pages (client components).
app/volunteer/    Volunteer dashboard and QR scanner.
app/buyer/        Buyer's own registrations.
app/claim/[token] QR landing page. Server component.
lib/auth.ts       Request-scoped Supabase client + role guards.
lib/supabase.ts   Service-role client. Bypasses RLS.
lib/vtapp-sync.ts Pulls the upstream feed into Supabase.
app/events/       Events index and per-event detail (admin + coordinator).
proxy.ts          Session refresh and role-based page routing.
```

## Authorization

Two layers, and they are not interchangeable:

- **`proxy.ts`** refreshes the session and redirects *pages* by
  role. It is an optimistic check for routing only.
- **Route handlers** call `requireRole(...)` from `lib/auth.ts`.
  This is the real access control. `lib/supabase.ts` exports a
  service-role client that bypasses row level security, so any
  handler using it must authorize first.

`/api/buyer` deliberately uses the request-scoped RLS client
instead, so a buyer can only ever reach their own rows.

## The V-TAPP sync

`POST /api/sync` (admin only) pulls the upstream feed, expands each
ticket into physical merchandise via the combo catalog in
`lib/vtapp-sync.ts`, and upserts it in batches.

Registration items are only rewritten when the parsed merchandise
actually changed. This matters: `distributions` rows reference
`registration_items`, so blindly replacing items would discard the
record of what has already been handed out.

## Realtime

The dashboards subscribe to the distribution tables and refresh the
moment Postgres reports a change, so a handover on the volunteer
screen shows up on the admin dashboard without waiting for a poll.
The header shows **Live** when the subscription is connected and
**Polling** when it is not.

This is best-effort and optional. Realtime only fires once the tables
are in the `supabase_realtime` publication, so run
`supabase/enable-realtime.sql` once against the project to turn it on.
Until then the dashboards fall back to polling and behave exactly as
before — the indicator just reads **Polling**. See `lib/use-realtime.ts`.

## Database setup

Run these once against Supabase, in order:

```bash
psql "$SUPABASE_DB_URL" -f supabase/dashboard-summary.sql
psql "$SUPABASE_DB_URL" -f supabase/events-and-coordinators.sql
psql "$SUPABASE_DB_URL" -f supabase/enable-realtime.sql
```

- **dashboard-summary.sql** aggregates the dashboard in Postgres. The
  route falls back to reducing rows in Node if it is absent, so the
  app works either way -- just slower.
- **events-and-coordinators.sql** creates `events` and
  `event_coordinators`, widens the role CHECK to allow `coordinator`,
  and backfills event names from `product_meta`.
- **enable-realtime.sql** puts the tables in the realtime publication.
  Without it the dashboards fall back to a 30s poll and the header
  reads "Polling" instead of "Live".

All three are safe to re-run.

### Where event names come from

The upstream V-TAPP feed sends `event_id` but no name. The name is the
`product_meta` prefix:

```
V-TAPP merchandise - Date: 11 Sep 2026-12 Sep 2026 - Ticket: Cap
^^^^^^^^^^^^^^^^^^
```

`lib/vtapp-sync.ts` records each event the first time it sees it.
Renaming an event in the database sets `name_locked`, after which the
sync leaves the name alone.

## Scripts

```bash
npm run dev      # dev server
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint
```
