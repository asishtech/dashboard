"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import NavBar from "@/components/NavBar";
import { formatTimeIst } from "@/lib/format-time";
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

  participants?: {
    people: number;
    signedIn: number;
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

  hostel?: {
    registrations: number;
    checkedIn: number;
    inside: number;
  };

  external?: {
    people: number;
  };

  responseTimeMs?: number;

};

type SyncResult = {
  fetched?: number;
  created?: number;
  updated?: number;
  /* Rows the feed resent exactly as stored. */
  unchanged?: number;
  /* Rows a pass ran out of time to write. */
  remaining?: number;
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

  /*
   * Say when the sync wrote nothing, rather than reporting a
   * duration and letting it read as a slow no-op. Almost every run
   * during the fest is this: the feed resends every registration it
   * has and none of them have moved.
   */
  if (
    result.unchanged !== undefined &&
    result.unchanged === result.fetched
  ) {
    parts.push("— nothing had changed");
  }

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
  /* Hostel check-in and exit -- otherwise the new Hostel section
     would only ever move on the next poll or the next sync. */
  "qr_scans",
  /*
   * Fires once after the V-TAPP sync fully completes, so this page
   * refreshes with the complete dataset rather than mid-sync data.
   */
  "sync_log",
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

  const [participants, setParticipants] = useState({
    people: 0,
    signedIn: 0,
  });

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

  const [hostel, setHostel] = useState({
    registrations: 0,
    checkedIn: 0,
    inside: 0,
  });

  const [externalPeople, setExternalPeople] = useState(0);

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
        setParticipants(
          data.participants ?? { people: 0, signedIn: 0 }
        );

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

        setHostel(
          data.hostel ?? {
            registrations: 0,
            checkedIn: 0,
            inside: 0,
          }
        );

        setExternalPeople(Number(data.external?.people ?? 0));

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
      /*
       * As many passes as it takes.
       *
       * The events portal answers with all 2.5 MB however it is
       * asked, in 7 to 17 seconds, and the gateway allows thirty --
       * so a sync with real work in it cannot fit in one request.
       * Each pass writes what it can and reports how much is left,
       * and a resumed pass reuses the payload the first one stored
       * rather than fetching it again.
       *
       * Bounded, because a bug that always reported work remaining
       * would otherwise loop until the tab was closed.
       */
      let result: Record<string, unknown> = {};

      for (let pass = 0; pass < 12; pass++) {
        const response = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ resume: pass > 0 }),
        });

        const body = await response.text();

        if (!response.ok) {
          /*
           * 504 is the gateway giving up, not the work being lost:
           * every row the pass managed to write is written. Carry on
           * rather than starting again.
           */
          if (response.status === 504 && pass < 11) {
            setSyncMessage(
              `Still working (pass ${pass + 2})...`
            );
            continue;
          }

          throw new Error(
            body
              ? ((JSON.parse(body) as { error?: string }).error ??
                "Synchronization failed")
              : `The sync timed out (${response.status}).`
          );
        }

        result = JSON.parse(body) as Record<string, unknown>;

        if (!result.success) {
          throw new Error(
            (result.error as string) ||
              "Synchronization failed"
          );
        }

        if (Number(result.remaining ?? 0) === 0) break;

        setSyncMessage(
          `${result.remaining} registrations left to write...`
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
   * Sync on a timer while this page is open.
   *
   * Automatic sending happens at the end of a sync, and a sync only
   * happened when somebody pressed the button -- so "automatic" meant
   * "whenever an admin remembers", and a student who bought a ticket
   * at nine got their pass whenever the next person happened to press
   * it. During a fest this page is open on the desk all day, which is
   * a good enough scheduler for a two-day festival and needs nothing
   * standing behind it.
   *
   * Two minutes, and only while the tab is visible: the upstream
   * call is 2.5 MB every time, and a backgrounded tab syncing for
   * hours is somebody else's bandwidth. Two is about as often as is
   * worth it -- a pass takes roughly that long to fetch, compare and
   * mail, so a shorter gap would mostly find the previous run still
   * going.
   */
  const syncRef = useRef(forceRefresh);

  /* Written in an effect, not during render: the compiler treats a
     ref assigned while rendering as a bug, and it is right to. */
  useEffect(() => {
    syncRef.current = forceRefresh;
  });

  useEffect(() => {
    let last = 0;

    const run = () => {
      if (document.visibilityState !== "visible") return;

      /* Never twice inside the interval, however many things ask.
         Coming back to the tab and the timer firing are two of
         them, and they arrive together after a lunch break. */
      if (Date.now() - last < 2 * 60_000) return;

      last = Date.now();

      void syncRef.current();
    };

    /*
     * One shortly after the page opens, so somebody who has just
     * loaded the dashboard sees it working rather than waiting two
     * minutes to find out whether it does. Twenty seconds, not
     * immediately: the page has a dashboard to fetch first.
     */
    const first = window.setTimeout(run, 20_000);

    const timer = window.setInterval(run, 2 * 60_000);

    /* Coming back to the tab is worth a sync: the interval does not
       tick while hidden, so the data is as old as the absence. */
    document.addEventListener("visibilitychange", run);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, []);

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

    return formatTimeIst(date, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
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
            <span className="stat-label">People</span>

            <strong className="stat-value">
              {loading ? "—" : participants.people}
            </strong>

            {/* Distinct addresses across every registration. One
                person booking six events is one person. */}
            <span className="stat-meta">
              {loading
                ? " "
                : `${participants.signedIn} have signed in`}
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
            <span className="stat-label">Granted access</span>

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

          {(
            [
              "admin",
              "faculty",
              "volunteer",
              "registrations",
            ] as const
          ).map(
            (role) => (
              <div className="stat" key={role}>
                <span className="stat-label">
                  {role === "faculty"
                    ? "Coordinators"
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
                      : "Scanner only"}
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

        {/* 5. Hostel --------------------------------------------- */}
        <section className="section-header mt-8">
          <h2 className="page-title" style={{ fontSize: "var(--text-xl)" }}>
            Hostel
          </h2>

          <Link href="/admin/hostel" className="btn btn-ghost btn-sm">
            Guests
            <ArrowRightIcon size={13} />
          </Link>
        </section>

        <section className="stat-grid">
          <div className="stat stat-feature">
            <span className="stat-label">Registrations</span>

            <strong className="stat-value">
              {loading ? "—" : hostel.registrations}
            </strong>

            <span className="stat-meta">Food &amp; accommodation</span>
          </div>

          <div className="stat">
            <span className="stat-label">Checked in</span>

            <strong className="stat-value stat-success">
              {loading ? "—" : hostel.checkedIn}
            </strong>

            <span className="stat-meta">
              {loading || hostel.registrations === 0
                ? "No registrations yet"
                : `${Math.round(
                    (hostel.checkedIn / hostel.registrations) * 100
                  )}% of registrations`}
            </span>
          </div>

          <div className="stat">
            <span className="stat-label">Inside now</span>

            <strong className="stat-value">
              {loading ? "—" : hostel.inside}
            </strong>

            <span className="stat-meta">Entered, not yet exited</span>
          </div>
        </section>

        {/* 6. External participants ------------------------------ */}
        <section className="section-header mt-8">
          <h2 className="page-title" style={{ fontSize: "var(--text-xl)" }}>
            External participants
          </h2>

          <Link href="/admin/external" className="btn btn-ghost btn-sm">
            Colleges
            <ArrowRightIcon size={13} />
          </Link>
        </section>

        <section className="stat-grid">
          <div className="stat stat-feature">
            <span className="stat-label">People</span>

            <strong className="stat-value">
              {loading ? "—" : externalPeople}
            </strong>

            <span className="stat-meta">From outside VIT-AP</span>
          </div>
        </section>

      </div>
    </main>
  );
}
