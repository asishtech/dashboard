"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
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

  /* Present only on a failed response. */
  error?: string;

  registrations: number;

  totalAmount: number;

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

  return (
    <main className="app">
      <div className="container">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">
              V-TAPP / Control
            </span>

            <h1 className="page-title">Admin Dashboard</h1>

            <p className="page-subtitle">
              {adminName ? `Signed in as ${adminName}` : " "}
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

            <Link
              href="/admin/registrations"
              className="btn btn-ghost btn-sm"
            >
              Registrations
            </Link>

            <Link
              href="/admin/inventory"
              className="btn btn-ghost btn-sm"
            >
              Inventory
            </Link>

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

            <LogoutButton />
          </div>
        </header>


        {syncMessage && (
          <div className="banner" role="status" aria-live="polite">
            <span>{syncMessage}</span>
          </div>
        )}


        {/* Key figures */}
        <section className="stat-grid">
          <div className="stat stat-feature">
            <span className="stat-label">Merchandise revenue</span>

            <strong className="stat-value">
              {loading ? "—" : formatAmount(totalAmount)}
            </strong>

            <span className="stat-meta">Total recorded sales</span>
          </div>

          <div className="stat">
            <span className="stat-label">Buyers</span>

            <strong className="stat-value">
              {loading ? "—" : registrations}
            </strong>

            <span className="stat-meta">
              Completed registrations
            </span>
          </div>

          <div className="stat">
            <span className="stat-label">Items sold</span>

            <strong className="stat-value">
              {loading ? "—" : totalSold}
            </strong>

            <span className="stat-meta">
              of {loading ? "—" : totalStock} configured
            </span>
          </div>

          <div className="stat">
            <span className="stat-label">Items remaining</span>

            <strong className="stat-value">
              {loading ? "—" : totalRemaining}
            </strong>

            <span className="stat-meta">Current inventory</span>
          </div>
        </section>


        <div className="grid grid-main mb-8">

          {/* Stock levels */}
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


          {/* Distribution */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Distribution</h2>

                <p className="panel-subtitle">
                  Merchandise handed over
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
                  aria-label="Items distributed"
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
                  ? " "
                  : `${distributionTotal} items across all registrations.`}
              </p>
            </div>
          </section>
        </div>


        {/* Navigation */}
        <section className="grid grid-3">
          <Link href="/admin/registrations" className="card-link">
            <ListIcon size={20} />

            <div className="card-link-title mt-4">
              Registrations
            </div>

            <p className="card-link-body">
              Every buyer, their merchandise and distribution state.
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

          <Link href="/admin/users" className="card-link">
            <UsersIcon size={20} />

            <div className="card-link-title mt-4">
              Staff accounts
            </div>

            <p className="card-link-body">
              Invite admins and volunteers by email.
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
