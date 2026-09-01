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
  UsersIcon,
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
    ticketBreakdown,
    setTicketBreakdown,
  ] = useState<
    {
      ticket: string;
      registrations: number;
      revenue: number;
    }[]
  >([]);

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

        setTicketBreakdown(
          data.ticketBreakdown ?? []
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


  /*
   * Dashboard calculations.
   */
  const totalAmount =
    dashboardTotalAmount;

  const totalRemaining =
    inventory.reduce(
      (sum, item) =>
        sum +
        Number(
          item.remaining ?? 0
        ),
      0
    );

  const totalStock =
    inventory.reduce(
      (sum, item) =>
        sum +
        Number(
          item.initial_stock ?? 0
        ),
      0
    );

  const totalSold =
    inventory.reduce(
      (sum, item) =>
        sum +
        Number(
          item.sold ?? 0
        ),
      0
    );


  /*
   * Distribution statistics.
   *
   * Values come directly from
   * the lightweight dashboard API.
   */
  const givenCount =
    distribution.given;

  const pendingCount =
    distribution.pending;



  const distributionTotal =
    Math.max(
      givenCount + pendingCount,
      1
    );

  const givenPercent =
    (givenCount / distributionTotal) * 100;

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

  const scanned = eventQrScanned + merchandiseQrScanned;

  /*
   * Events and merchandise are two different businesses sharing one
   * feed, so the dashboard compares them side by side rather than
   * burying both in a single running total.
   */
  const streams = [
    {
      key: "events",
      label: "Events",
      registrations: eventRegistrationCount,
      revenue: eventRevenue,
      scanned: eventQrScanned,
      href: "/events",
    },
    {
      key: "merchandise",
      label: "Merchandise",
      registrations: merchandiseRegistrationCount,
      revenue: merchandiseRevenue,
      scanned: merchandiseQrScanned,
      href: "/admin/inventory",
    },
  ];

  const topTickets = ticketBreakdown.slice(0, 8);

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


        {/* Headline figures */}
        <section className="stat-grid">
          <div className="stat stat-feature">
            <span className="stat-label">Total revenue</span>

            <strong className="stat-value">
              {loading ? "—" : formatAmount(totalAmount)}
            </strong>

            <span className="stat-meta">Events and merchandise</span>
          </div>

          <div className="stat">
            <span className="stat-label">Registrations</span>

            <strong className="stat-value">
              {loading ? "—" : registrations}
            </strong>

            <span className="stat-meta">Across both streams</span>
          </div>

          <div className="stat">
            <span className="stat-label">Checked in</span>

            <strong className="stat-value stat-success">
              {loading ? "—" : scanned}
            </strong>

            <span className="stat-meta">QR codes scanned</span>
          </div>

          <div className="stat">
            <span className="stat-label">Merch remaining</span>

            <strong className="stat-value">
              {loading ? "—" : totalRemaining}
            </strong>

            <span className="stat-meta">
              {loading
                ? " "
                : `${totalSold} sold of ${totalStock}`}
            </span>
          </div>
        </section>


        <div className="grid grid-main mb-8">

          {/* Events vs merchandise */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Where it comes from</h2>

                <p className="panel-subtitle">
                  Events and merchandise compared
                </p>
              </div>
            </div>

            <div className="panel-body stack">
              {streams.map((stream) => {
                const share =
                  totalAmount > 0
                    ? Math.round(
                        (stream.revenue / totalAmount) * 100
                      )
                    : 0;

                return (
                  <div className="meter" key={stream.key}>
                    <div className="meter-head">
                      <Link
                        href={stream.href}
                        className="meter-label link"
                      >
                        {stream.label}
                      </Link>

                      <span className="meter-value">
                        {loading
                          ? "—"
                          : formatAmount(stream.revenue)}
                      </span>
                    </div>

                    <div
                      className="meter-track"
                      role="progressbar"
                      aria-valuenow={share}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${stream.label} share of revenue`}
                    >
                      <div
                        className="meter-fill"
                        style={{ width: `${share}%` }}
                      />
                    </div>

                    <div className="meter-foot">
                      <span>
                        {stream.registrations} registrations
                      </span>

                      <span>{stream.scanned} checked in</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>


          {/* Merchandise distribution */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Handover</h2>

                <p className="panel-subtitle">
                  Merchandise given to buyers
                </p>
              </div>
            </div>

            <div className="panel-body">
              <div className="meter">
                <div className="meter-head">
                  <span className="meter-label">Handed over</span>

                  <span className="meter-value">
                    {loading ? "—" : `${Math.round(givenPercent)}%`}
                  </span>
                </div>

                <div
                  className="meter-track"
                  role="progressbar"
                  aria-valuenow={Math.round(givenPercent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Merchandise handed over"
                >
                  <div
                    className="meter-fill meter-fill-success"
                    style={{ width: `${givenPercent}%` }}
                  />
                </div>
              </div>

              <div className="split">
                <div className="split-item">
                  <span className="stat-label">Given</span>

                  <strong className="split-value stat-success">
                    {loading ? "—" : givenCount}
                  </strong>
                </div>

                <div className="split-item">
                  <span className="stat-label">Pending</span>

                  <strong className="split-value stat-warning">
                    {loading ? "—" : pendingCount}
                  </strong>
                </div>
              </div>

              <p className="help mt-4">
                {loading
                  ? " "
                  : `${distributionTotal} items across all merchandise orders.`}
              </p>
            </div>
          </section>
        </div>


        <div className="grid grid-main mb-8">

          {/* Stock */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Stock levels</h2>

                <p className="panel-subtitle">
                  Remaining against configured capacity
                </p>
              </div>

              <Link
                href="/admin/inventory"
                className="btn btn-ghost btn-sm"
              >
                Manage
              </Link>
            </div>

            <div className="panel-body stack">
              {loading ? (
                [1, 2, 3, 4, 5].map((row) => (
                  <div key={row}>
                    <div className="skeleton skeleton-line" />
                    <div className="skeleton meter-track" />
                  </div>
                ))
              ) : inventory.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">
                    <BoxIcon size={22} />
                  </div>

                  <p className="empty-title">No inventory yet</p>

                  <p className="empty-body">
                    Add stock in Inventory to see levels here.
                  </p>
                </div>
              ) : (
                inventory.map((item) => {
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
                    <div className="meter" key={item.id}>
                      <div className="meter-head">
                        <span className="meter-label">
                          {item.item}
                        </span>

                        <span className="meter-value">
                          {remaining} / {stock}
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

                      <div className="meter-foot">
                        <span>{item.sold} sold</span>
                        <span>{Math.round(percent)}% left</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>


          {/* Best selling tickets */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Top tickets</h2>

                <p className="panel-subtitle">
                  By revenue, across both streams
                </p>
              </div>

              <Link href="/events" className="btn btn-ghost btn-sm">
                All events
              </Link>
            </div>

            {loading ? (
              <div className="panel-body stack">
                {[1, 2, 3, 4].map((row) => (
                  <div className="skeleton skeleton-line" key={row} />
                ))}
              </div>
            ) : topTickets.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">
                  <ListIcon size={22} />
                </div>

                <p className="empty-title">Nothing sold yet</p>

                <p className="empty-body">
                  Run a V-TAPP sync to pull registrations in.
                </p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">
                    Tickets by revenue
                  </caption>

                  <thead>
                    <tr>
                      <th scope="col">Ticket</th>
                      <th scope="col" className="table-num">
                        Sold
                      </th>
                      <th scope="col" className="table-num">
                        Revenue
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {topTickets.map((ticket) => (
                      <tr key={ticket.ticket}>
                        <td>
                          <div className="row-title truncate">
                            {ticket.ticket}
                          </div>
                        </td>

                        <td className="table-num">
                          {ticket.registrations}
                        </td>

                        <td className="table-num">
                          {formatAmount(Number(ticket.revenue ?? 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && ticketBreakdown.length > topTickets.length && (
              <div className="panel-footer">
                Showing top {topTickets.length} of{" "}
                {ticketBreakdown.length} tickets
              </div>
            )}
          </section>
        </div>


        {/* Navigation */}
        <section className="grid grid-4">
          <Link href="/events" className="card-link card-link-feature">
            <ListIcon size={20} />

            <div className="card-link-title mt-4">Events</div>

            <p className="card-link-body">
              Every event, searchable, with its participant list.
            </p>

            <span className="card-link-cta">
              Open
              <ArrowRightIcon size={13} />
            </span>
          </Link>

          <Link href="/admin/registrations" className="card-link">
            <UsersIcon size={20} />

            <div className="card-link-title mt-4">
              Registrations
            </div>

            <p className="card-link-body">
              Every buyer and their distribution state.
            </p>

            <span className="card-link-cta">
              Open
              <ArrowRightIcon size={13} />
            </span>
          </Link>

          <Link href="/admin/inventory" className="card-link">
            <BoxIcon size={20} />

            <div className="card-link-title mt-4">Inventory</div>

            <p className="card-link-body">
              Adjust configured stock for each item.
            </p>

            <span className="card-link-cta">
              Open
              <ArrowRightIcon size={13} />
            </span>
          </Link>

          <Link href="/admin/coordinators" className="card-link">
            <UsersIcon size={20} />

            <div className="card-link-title mt-4">Coordinators</div>

            <p className="card-link-body">
              Give a club coordinator access to their event.
            </p>

            <span className="card-link-cta">
              Open
              <ArrowRightIcon size={13} />
            </span>
          </Link>
        </section>

      </div>
    </main>
  );
}
