"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { useLiveRefresh } from "@/lib/use-realtime";
import {
  ArrowRightIcon,
  BoxIcon,
  ListIcon,
} from "@/components/icons";

type Inventory = {
  id: number;
  item: string;
  initial_stock: number;
  sold: number;
  remaining: number;
  remaining_percentage: number;
};

type DashboardData = {

  success?: boolean;

  error?: string;

  registrations: number;

  totalAmount: number;

  eventQrScanned?: number;

  merchandiseQrScanned?: number;

  eventRegistrationCount?: number;

  merchandiseRegistrationCount?: number;

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

  coordinators?: {
    people: number;
    eventsCovered: number;
    eventsTotal: number;
    eventsUncovered: number;
  };

  staff?: {
    total: number;
    active: number;
    inactive: number;
    byRole: Record<string, number>;
  };

  responseTimeMs?: number;

};

type SyncResult = {
  fetched?: number;
  created?: number;
  updated?: number;
  durationMs?: number;
  timings?: Record<string, number>;
};

/*
 * Report where the sync actually spent its time.
 *
 * Almost all of it is usually the upstream V-TAPP API, which is a
 * different problem from our own writes being slow, and the two are
 * indistinguishable from a spinner.
 */
function describeSync(result: SyncResult) {
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  const parts = [
    `Synced ${result.fetched ?? 0} records`,
  ];

  if (result.durationMs) {
    parts.push(`in ${seconds(result.durationMs)}`);
  }

  const upstream = result.timings?.upstreamApi;

  if (upstream && result.durationMs) {
    const share = Math.round((upstream / result.durationMs) * 100);

    parts.push(
      `— ${seconds(upstream)} of that was the V-TAPP API (${share}%)`
    );
  }

  return parts.join(" ");
}

/*
 * Distribution state is spread across these tables, so a change to
 * any of them can move a number on this page.
 */
const LIVE_TABLES = [
  "registrations",
  "registration_items",
  "distributions",
  "inventory",
];

export default function AdminPage() {
  const [inventory, setInventory] =
    useState<Inventory[]>([]);

  const [registrations, setRegistrations] =
    useState(0);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [syncing, setSyncing] =
    useState(false);

  const [syncMessage, setSyncMessage] =
    useState("");

  const [adminName, setAdminName] =
    useState("");

  const [
    dashboardTotalAmount,
    setDashboardTotalAmount,
  ] = useState(0);

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
    eventRevenue,
    setEventRevenue,
  ] = useState(0);

  const [
    merchandiseRevenue,
    setMerchandiseRevenue,
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

  const [coordinators, setCoordinators] = useState({
    people: 0,
    eventsCovered: 0,
    eventsTotal: 0,
    eventsUncovered: 0,
  });

  const [staff, setStaff] = useState<{
    total: number;
    active: number;
    inactive: number;
    byRole: Record<string, number>;
  }>({ total: 0, active: 0, inactive: 0, byRole: {} });

  const [
    distribution,
    setDistribution,
  ] = useState({
    given: 0,
    pending: 0,
    total: 0,
  });

  const [lastUpdated, setLastUpdated] =
    useState<Date | null>(null);

  const loadDashboard = useCallback(
    async (showLoading = false) => {
      if (showLoading) {
        setLoading(true);
      }

      try {
        const controller =
          new AbortController();

        const timeout = setTimeout(
          () => controller.abort(),
          15000
        );

        let response: Response;

        try {
          response = await fetch(
            "/api/dashboard",
            {
              method: "GET",
              cache: "no-store",
              credentials: "same-origin",
              headers: {
                Accept:
                  "application/json",
              },
              signal:
                controller.signal,
            }
          );
        } finally {
          clearTimeout(timeout);
        }

        const data: DashboardData =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error ||
              `Dashboard API failed (${response.status})`
          );
        }

        if (data?.success === false) {
          throw new Error(
            data?.error ||
              "Dashboard API returned an error"
          );
        }

        setInventory(
          data.inventory ?? []
        );

        setEventBreakdown(
          data.eventBreakdown ?? []
        );

        /*
         * Absent until supabase migrations and the newer API are both
         * deployed; the zero defaults read as "none yet" rather than
         * blanking the section.
         */
        setCoordinators(
          data.coordinators ?? {
            people: 0,
            eventsCovered: 0,
            eventsTotal: 0,
            eventsUncovered: 0,
          }
        );

        setStaff(
          data.staff ?? {
            total: 0,
            active: 0,
            inactive: 0,
            byRole: {},
          }
        );

        setDashboardTotalAmount(
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


        setDistribution({
          given: Number(
            data.distribution?.given ?? 0
          ),
          pending: Number(
            data.distribution?.pending ?? 0
          ),
          total: Number(
            data.distribution?.total ?? 0
          ),
        });

        setRegistrations(
          Number(
            data.registrations ?? 0
          )
        );

        setLastUpdated(
          new Date()
        );

      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          console.warn(
            "Dashboard request timed out."
          );
        } else {
          console.error(
            "Admin dashboard error:",
            error
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );


  useEffect(() => {
    async function initialise() {
      /*
       * The dashboard request no longer waits on the auth
       * round-trip. The proxy has already established that a
       * signed-in admin is here; the identity lookup only
       * supplies the greeting, so the two run side by side.
       */
      const dashboard = loadDashboard(true);

      try {
        const supabase =
          createSupabaseBrowser();

        const {
          data: { user },
        } =
          await supabase.auth.getUser();

        if (!user) {
          window.location.href =
            "/login";
          return;
        }

        setAdminName(
          user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email ||
            "Administrator"
        );
      } catch (error) {
        console.error(
          "Admin initialization error:",
          error
        );
      }

      await dashboard;
    }

    initialise();
  }, [loadDashboard]);


  /*
   * Live updates.
   *
   * Postgres pushes the change as soon as a volunteer hands
   * something over, so the dashboard no longer waits on a poll (or
   * on someone pressing Sync) to notice. The poll stays on as a
   * safety net and takes over entirely if realtime is unavailable.
   *
   * This only reads Supabase. It does NOT call the V-TAPP API.
   */
  const live = useLiveRefresh(
    LIVE_TABLES,
    useCallback(
      () => loadDashboard(false),
      [loadDashboard]
    )
  );


  /*
   * Manual V-TAPP synchronization.
   */
  async function forceRefresh() {
    if (
      syncing ||
      refreshing
    ) {
      return;
    }

    setSyncing(true);
    setSyncMessage(
      "Synchronizing V-TAPP data..."
    );

    try {
      const response =
        await fetch(
          "/api/sync",
          {
            method: "POST",
            cache: "no-store",
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ||
            "Synchronization failed"
        );
      }

      /*
       * Read the freshly synchronized
       * data without reloading the page.
       */
      setRefreshing(true);

      await loadDashboard(false);

      setSyncMessage(
        describeSync(result)
      );

    } catch (error) {
      console.error(
        "Force refresh failed:",
        error
      );

      setSyncMessage(
        error instanceof Error
          ? error.message
          : "Synchronization failed"
      );

    } finally {
      setSyncing(false);
      setRefreshing(false);
    }
  }


  const formatAmount = (
    amount: number
  ) =>
    new Intl.NumberFormat(
      "en-IN",
      {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }
    ).format(amount);


  const formatTime = (
    date: Date | null
  ) => {
    if (!date) {
      return "Not available";
    }

    return date.toLocaleTimeString(
      "en-IN",
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }
    );
  };


  const busy = syncing || refreshing;

  const stockRemaining = inventory.reduce(
    (sum, item) => sum + Number(item.remaining ?? 0),
    0
  );

  return (
    <main className="app">
      <NavBar />

      <div className="container">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / Control</span>

            <h1 className="page-title">Admin Dashboard</h1>

            <p className="page-subtitle">
              {adminName
                ? `Signed in as ${adminName}`
                : "Loading your account..."}
            </p>
          </div>

          <div className="header-actions">
            {lastUpdated && (
              <span
                className={`pulse${
                  live === "live" ? "" : " pulse-idle"
                }`}
                title={
                  live === "live"
                    ? "Changes arrive as they happen"
                    : "Realtime unavailable, refreshing every 30s"
                }
              >
                {live === "live" ? "Live" : "Polling"} ·{" "}
                {formatTime(lastUpdated)}
              </span>
            )}

            <button
              type="button"
              onClick={forceRefresh}
              disabled={busy}
              className="btn btn-primary btn-sm"
            >
              {busy && <span className="btn-spinner" />}
              {syncing
                ? "Synchronizing"
                : refreshing
                  ? "Refreshing"
                  : "Sync V-TAPP"}
            </button>


          </div>
        </header>


        {syncMessage && (
          <div className="banner" role="status" aria-live="polite">
            <span>{syncMessage}</span>
          </div>
        )}


        {/* Fest-wide, before the four domains are split out. */}
        <section className="stat-grid">
          <div className="stat stat-feature">
            <span className="stat-label">Total revenue</span>

            <strong className="stat-value">
              {loading ? "—" : formatAmount(dashboardTotalAmount)}
            </strong>

            <span className="stat-meta">Events and merchandise</span>
          </div>

          <div className="stat">
            <span className="stat-label">Registrations</span>

            <strong className="stat-value">
              {loading ? "—" : registrations}
            </strong>

            <span className="stat-meta">
              {loading
                ? " "
                : `${eventRegistrationCount} event · ${merchandiseRegistrationCount} merch`}
            </span>
          </div>

          <div className="stat">
            <span className="stat-label">Checked in</span>

            <strong className="stat-value stat-success">
              {loading ? "—" : eventQrScanned + merchandiseQrScanned}
            </strong>

            <span className="stat-meta">QR codes scanned</span>
          </div>
        </section>


        {/* 1. Events ------------------------------------------- */}
        <section className="section-header mt-8">
          <h2 className="page-title" style={{ fontSize: "var(--text-xl)" }}>
            Events
          </h2>

          <Link href="/events" className="btn btn-ghost btn-sm">
            All events
            <ArrowRightIcon size={13} />
          </Link>
        </section>

        <section className="stat-grid">
          <div className="stat stat-feature">
            <span className="stat-label">Event registrations</span>

            <strong className="stat-value">
              {loading ? "—" : eventRegistrationCount}
            </strong>

            <span className="stat-meta">
              {loading
                ? " "
                : `${eventBreakdown.length} event${
                    eventBreakdown.length === 1 ? "" : "s"
                  } with bookings`}
            </span>
          </div>

          <div className="stat">
            <span className="stat-label">Checked in</span>

            <strong className="stat-value stat-success">
              {loading ? "—" : eventQrScanned}
            </strong>

            <span className="stat-meta">
              {loading || eventRegistrationCount === 0
                ? "No bookings yet"
                : `${Math.round(
                    (eventQrScanned / eventRegistrationCount) * 100
                  )}% of bookings`}
            </span>
          </div>

          <div className="stat">
            <span className="stat-label">Event revenue</span>

            <strong className="stat-value">
              {loading ? "—" : formatAmount(eventRevenue)}
            </strong>

            <span className="stat-meta">Tickets only</span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Busiest events</h3>

              <p className="panel-subtitle">By registrations</p>
            </div>
          </div>

          {loading ? (
            <div className="panel-body stack">
              {[1, 2, 3, 4].map((row) => (
                <div className="skeleton skeleton-line" key={row} />
              ))}
            </div>
          ) : eventBreakdown.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">
                <ListIcon size={22} />
              </div>

              <p className="empty-title">No event bookings yet</p>

              <p className="empty-body">
                Run a V-TAPP sync to pull registrations in.
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">
                  Events by registration count
                </caption>

                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col" className="table-num">
                      Registrations
                    </th>
                    <th scope="col" className="table-num">
                      Revenue
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {[...eventBreakdown]
                    .sort((a, b) => b.registrations - a.registrations)
                    .slice(0, 8)
                    .map((event) => (
                      <tr key={event.event_id}>
                        <td>
                          <div className="row-title truncate">
                            {event.name}
                          </div>
                        </td>

                        <td className="table-num">
                          {event.registrations}
                        </td>

                        <td className="table-num">
                          {formatAmount(Number(event.revenue ?? 0))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>


        {/* 2. Merchandise --------------------------------------- */}
        <section className="section-header mt-8">
          <h2 className="page-title" style={{ fontSize: "var(--text-xl)" }}>
            Merchandise
          </h2>

          <div className="header-actions">
            <Link
              href="/admin/inventory"
              className="btn btn-ghost btn-sm"
            >
              Stock
              <ArrowRightIcon size={13} />
            </Link>

            <Link
              href="/admin/registrations"
              className="btn btn-ghost btn-sm"
            >
              Orders
              <ArrowRightIcon size={13} />
            </Link>
          </div>
        </section>

        <section className="stat-grid">
          <div className="stat stat-feature">
            <span className="stat-label">Merchandise orders</span>

            <strong className="stat-value">
              {loading ? "—" : merchandiseRegistrationCount}
            </strong>

            <span className="stat-meta">
              {loading ? " " : `${distribution.total} items in total`}
            </span>
          </div>

          <div className="stat">
            <span className="stat-label">Handed over</span>

            <strong className="stat-value stat-success">
              {loading ? "—" : distribution.given}
            </strong>

            <span className="stat-meta">
              {loading
                ? " "
                : `${distribution.pending} still to collect`}
            </span>
          </div>

          <div className="stat">
            <span className="stat-label">Merch revenue</span>

            <strong className="stat-value">
              {loading ? "—" : formatAmount(merchandiseRevenue)}
            </strong>

            <span className="stat-meta">Garments and combos</span>
          </div>

          <div className="stat">
            <span className="stat-label">Stock left</span>

            <strong
              className={`stat-value ${
                stockRemaining === 0 ? "stat-warning" : ""
              }`}
            >
              {loading ? "—" : stockRemaining}
            </strong>

            <span className="stat-meta">Across all items</span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Stock levels</h3>

              <p className="panel-subtitle">
                Remaining against configured capacity
              </p>
            </div>
          </div>

          {loading ? (
            <div className="panel-body stack">
              {[1, 2, 3].map((row) => (
                <div key={row}>
                  <div className="skeleton skeleton-line" />
                  <div className="skeleton meter-track" />
                </div>
              ))}
            </div>
          ) : inventory.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">
                <BoxIcon size={22} />
              </div>

              <p className="empty-title">No inventory configured</p>
            </div>
          ) : (
            <div className="panel-body stack">
              {inventory.map((item) => {
                const stock = Number(item.initial_stock ?? 0);
                const remaining = Number(item.remaining ?? 0);

                const percent =
                  stock > 0
                    ? Math.max(
                        0,
                        Math.min(100, (remaining / stock) * 100)
                      )
                    : 0;

                const level =
                  percent <= 15
                    ? "meter-fill-danger"
                    : percent <= 40
                      ? "meter-fill-warning"
                      : "meter-fill-success";

                return (
                  <div key={item.id}>
                    <div className="meter-head">
                      <span className="row-title">{item.item}</span>

                      <span className="muted text-sm">
                        {remaining} of {stock}
                      </span>
                    </div>

                    <div
                      className="meter-track"
                      role="progressbar"
                      aria-valuenow={Math.round(percent)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${item.item} stock remaining`}
                    >
                      <div
                        className={`meter-fill ${level}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>


        {/* 3. Coordinators -------------------------------------- */}
        <section className="section-header mt-8">
          <h2 className="page-title" style={{ fontSize: "var(--text-xl)" }}>
            Coordinators
          </h2>

          <Link
            href="/admin/coordinators"
            className="btn btn-ghost btn-sm"
          >
            Manage
            <ArrowRightIcon size={13} />
          </Link>
        </section>

        <section className="stat-grid">
          <div className="stat stat-feature">
            <span className="stat-label">People</span>

            <strong className="stat-value">
              {loading ? "—" : coordinators.people}
            </strong>

            <span className="stat-meta">
              With at least one event
            </span>
          </div>

          <div className="stat">
            <span className="stat-label">Events covered</span>

            <strong className="stat-value stat-success">
              {loading ? "—" : coordinators.eventsCovered}
            </strong>

            <span className="stat-meta">
              {loading
                ? " "
                : `of ${coordinators.eventsTotal} events`}
            </span>
          </div>

          {/* The number worth acting on: an event nobody can see. */}
          <div className="stat">
            <span className="stat-label">Uncovered</span>

            <strong
              className={`stat-value ${
                coordinators.eventsUncovered > 0
                  ? "stat-warning"
                  : "stat-success"
              }`}
            >
              {loading ? "—" : coordinators.eventsUncovered}
            </strong>

            <span className="stat-meta">
              {loading
                ? " "
                : coordinators.eventsUncovered === 0
                  ? "Every event has someone"
                  : "No coordinator assigned"}
            </span>
          </div>
        </section>


        {/* 4. Staff --------------------------------------------- */}
        <section className="section-header mt-8">
          <h2 className="page-title" style={{ fontSize: "var(--text-xl)" }}>
            Staff
          </h2>

          <Link href="/admin/users" className="btn btn-ghost btn-sm">
            Manage access
            <ArrowRightIcon size={13} />
          </Link>
        </section>

        <section className="stat-grid">
          <div className="stat stat-feature">
            <span className="stat-label">Accounts</span>

            <strong className="stat-value">
              {loading ? "—" : staff.total}
            </strong>

            <span className="stat-meta">
              {loading
                ? " "
                : staff.inactive > 0
                  ? `${staff.active} active · ${staff.inactive} disabled`
                  : "All active"}
            </span>
          </div>

          {(["admin", "faculty", "volunteer", "buyer"] as const).map(
            (role) => (
              <div className="stat" key={role}>
                <span className="stat-label">
                  {role === "faculty"
                    ? "Faculty"
                    : role.charAt(0).toUpperCase() + role.slice(1)}
                </span>

                <strong className="stat-value">
                  {loading ? "—" : (staff.byRole[role] ?? 0)}
                </strong>

                <span className="stat-meta">
                  {role === "admin"
                    ? "Full access"
                    : role === "faculty"
                      ? "Own events only"
                      : role === "volunteer"
                        ? "Scanner only"
                        : "Own passes only"}
                </span>
              </div>
            )
          )}
        </section>

        {/* An account may hold several roles, so the role tiles can
            sum to more than the head count. Said once, here. */}
        {!loading && staff.total > 0 && (
          <p className="help mt-4">
            An account can hold more than one role, so the role counts
            may add up to more than {staff.total}.
          </p>
        )}

      </div>
    </main>
  );
}
