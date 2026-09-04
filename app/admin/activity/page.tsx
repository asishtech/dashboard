"use client";

import { useCallback, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { AlertIcon, PulseIcon } from "@/components/icons";

type Counts = {
  lastMinute?: number;
  last5: number;
  lastHour: number;
  total?: number;
};

type Pulse = {
  now: string;
  checkins: Counts;
  handovers: Counts;
  registrations: { lastHour: number; total: number };
  activeScanners: number;
  online: { total: number; byRole: Record<string, number> };
  busiest: { name: string; last5: number; hour: number }[];
  perMinute: { t: string; n: number }[];
};

type Health = {
  sync: {
    lastSuccessAt: string | null;
    lastError: string | null;
    minutesAgo: number | null;
  };
  mailFailed24h: number;
  unmappedTickets: number;
  registrationsWithoutEmail: number;
  registrationsWithoutToken: number;
};

/* How often the page asks. Matches the heartbeat, so "online" is
   never more than one interval stale. */
const POLL_MS = 15_000;

const ROLE_ORDER = [
  "admin",
  "faculty",
  "volunteer",
  "registrations",
  "buyer",
];

export default function ActivityPage() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [ready, setReady] = useState(true);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [live, setLive] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/activity", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to read activity");
      }

      if (data.ready === false) {
        setReady(false);
        setReason(data.reason ?? "");
        return;
      }

      setReady(true);
      setPulse(data.pulse);
      setHealth(data.health ?? null);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to read activity"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    if (!live) return;

    const timer = window.setInterval(() => {
      /* A page nobody is looking at should not be polling. */
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [load, live]);

  const peak = Math.max(
    1,
    ...(pulse?.perMinute ?? []).map((point) => point.n)
  );

  const stale =
    health?.sync.minutesAgo !== null &&
    health?.sync.minutesAgo !== undefined &&
    health.sync.minutesAgo > 30;

  return (
    <main className="app">
      <NavBar />

      <div className="container">
        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / Live</span>

            <h1 className="page-title">Activity</h1>

            <p className="page-subtitle">
              {pulse
                ? `Updated ${new Date(pulse.now).toLocaleTimeString("en-IN")}`
                : "What the site is doing right now"}
            </p>
          </div>

          <div className="header-actions">
            <label className="check">
              <input
                type="checkbox"
                checked={live}
                onChange={(event) => setLive(event.target.checked)}
              />
              <span>Auto-refresh</span>
            </label>
          </div>
        </header>

        {!ready && (
          <section className="panel">
            <div className="empty">
              <div className="empty-icon">
                <AlertIcon size={22} />
              </div>

              <p className="empty-title">Not available yet</p>

              <p className="empty-body">{reason}</p>
            </div>
          </section>
        )}

        {error && (
          <div className="banner banner-danger mb-6">{error}</div>
        )}

        {loading && !pulse && (
          <section className="panel">
            <div className="panel-body stack">
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-card" />
            </div>
          </section>
        )}

        {pulse && (
          <>
            <section className="stat-grid">
              <div className="stat stat-feature">
                <span className="stat-label">Check-ins / min</span>

                <strong className="stat-value">
                  {pulse.checkins.lastMinute ?? 0}
                </strong>

                <span className="stat-meta">
                  {pulse.checkins.last5} in 5 min ·{" "}
                  {pulse.checkins.lastHour} this hour
                </span>
              </div>

              <div className="stat">
                <span className="stat-label">On the site</span>

                <strong className="stat-value stat-success">
                  {pulse.online.total}
                </strong>

                <span className="stat-meta">
                  {ROLE_ORDER.filter(
                    (role) => pulse.online.byRole[role]
                  )
                    .map(
                      (role) =>
                        `${pulse.online.byRole[role]} ${role}`
                    )
                    .join(" · ") || "Nobody in the last 2 minutes"}
                </span>
              </div>

              <div className="stat">
                <span className="stat-label">Scanning</span>

                <strong className="stat-value">
                  {pulse.activeScanners}
                </strong>

                <span className="stat-meta">
                  Staff who scanned in the last 15 min
                </span>
              </div>

              <div className="stat">
                <span className="stat-label">Handovers / min</span>

                <strong className="stat-value">
                  {pulse.handovers.lastMinute ?? 0}
                </strong>

                <span className="stat-meta">
                  {pulse.handovers.lastHour} this hour
                </span>
              </div>
            </section>

            {/* Shape of the last half hour ------------------------- */}
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Check-ins per minute</h2>

                  <p className="panel-subtitle">
                    Last 30 minutes. Peak {peak} in a minute.
                  </p>
                </div>
              </div>

              <div className="panel-body">
                {/*
                  Bars rather than a chart library. Thirty numbers do
                  not justify shipping a plotting bundle to a phone on
                  fest wifi.
                */}
                <div
                  className="spark"
                  role="img"
                  aria-label={`Check-ins per minute for the last 30 minutes, peak ${peak}`}
                >
                  {pulse.perMinute.map((point) => (
                    <div
                      key={point.t}
                      className="spark-bar"
                      style={{
                        height: `${Math.max(
                          2,
                          (point.n / peak) * 100
                        )}%`,
                      }}
                      title={`${new Date(point.t).toLocaleTimeString(
                        "en-IN"
                      )} — ${point.n}`}
                    />
                  ))}
                </div>
              </div>
            </section>

            {/* Where the queues are ------------------------------- */}
            {pulse.busiest.length > 0 && (
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Busiest gates</h2>

                    <p className="panel-subtitle">
                      Events that admitted anyone in the last hour
                    </p>
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Event</th>
                        <th scope="col" className="table-num">
                          5 min
                        </th>
                        <th scope="col" className="table-num">
                          1 hour
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {pulse.busiest.map((row) => (
                        <tr key={row.name}>
                          <td>
                            <div className="row-title">{row.name}</div>
                          </td>
                          <td className="table-num">{row.last5}</td>
                          <td className="table-num">{row.hour}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Health --------------------------------------------- */}
            {health && (
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Health</h2>

                    <p className="panel-subtitle">
                      The things that break quietly
                    </p>
                  </div>
                </div>

                <div className="panel-body">
                  <div className="stat-grid">
                    <div className="stat">
                      <span className="stat-label">Last sync</span>

                      <strong
                        className={`stat-value stat-value-sm ${
                          stale ? "stat-warning" : "stat-success"
                        }`}
                      >
                        {health.sync.minutesAgo === null
                          ? "never"
                          : `${health.sync.minutesAgo} min ago`}
                      </strong>

                      <span className="stat-meta">
                        {health.sync.lastError
                          ? health.sync.lastError.slice(0, 60)
                          : "No error recorded"}
                      </span>
                    </div>

                    <div className="stat">
                      <span className="stat-label">Mail failed</span>

                      <strong
                        className={`stat-value stat-value-sm ${
                          health.mailFailed24h > 0
                            ? "stat-danger"
                            : ""
                        }`}
                      >
                        {health.mailFailed24h}
                      </strong>

                      <span className="stat-meta">
                        In the last 24 hours
                      </span>
                    </div>

                    <div className="stat">
                      <span className="stat-label">
                        Unmapped tickets
                      </span>

                      <strong
                        className={`stat-value stat-value-sm ${
                          health.unmappedTickets > 0
                            ? "stat-warning"
                            : ""
                        }`}
                      >
                        {health.unmappedTickets}
                      </strong>

                      <span className="stat-meta">
                        Sold, but not tied to a gate
                      </span>
                    </div>

                    <div className="stat">
                      <span className="stat-label">No QR code</span>

                      <strong
                        className={`stat-value stat-value-sm ${
                          health.registrationsWithoutToken > 0
                            ? "stat-warning"
                            : ""
                        }`}
                      >
                        {health.registrationsWithoutToken}
                      </strong>

                      <span className="stat-meta">
                        {health.registrationsWithoutEmail} also have no
                        email
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <p className="help mt-6">
              <PulseIcon size={13} /> Everything here is read from
              timestamps the app already writes, so watching this page
              costs two queries every {POLL_MS / 1000} seconds and
              writes nothing. Server-level figures — requests per
              second, CPU, Lambda concurrency — are not visible from
              inside the app; those live in CloudWatch.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
