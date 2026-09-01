"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import { useLiveRefresh } from "@/lib/use-realtime";
import {
  AlertIcon,
  ArrowRightIcon,
  InboxIcon,
  SearchIcon,
} from "@/components/icons";

type EventSummary = {
  event_id: string;
  name: string;
  /* The day the event runs, e.g. "D1", "D1 + D2". */
  event_date: string | null;
  venue: string | null;
  registrations: number;
  participants: number;
  scanned: number;
  /* Admins only; the API omits it for coordinators. */
  revenue?: number;
};

const LIVE_TABLES = ["registrations", "qr_scans", "events"];

export default function EventsPage() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [scoped, setScoped] = useState(false);
  const [canSeeRevenue, setCanSeeRevenue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadEvents = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);

    try {
      const response = await fetch("/api/events", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load events");
      }

      setEvents(data.events ?? []);
      setScoped(Boolean(data.scoped));
      setCanSeeRevenue(Boolean(data.canSeeRevenue));
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load events"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => loadEvents(), 0);
    return () => window.clearTimeout(timer);
  }, [loadEvents]);

  const live = useLiveRefresh(
    LIVE_TABLES,
    useCallback(() => loadEvents(true), [loadEvents])
  );

  /*
   * Filtering is local so typing stays responsive. The API accepts
   * the same `q` and applies it server-side too, which is what keeps
   * a coordinator from ever receiving another club's rows.
   */
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return events;

    return events.filter(
      (event) =>
        event.name.toLowerCase().includes(query) ||
        String(event.event_id).toLowerCase().includes(query)
    );
  }, [events, search]);

  const totals = useMemo(
    () =>
      events.reduce(
        (acc, event) => {
          acc.registrations += Number(event.registrations ?? 0);
          acc.scanned += Number(event.scanned ?? 0);
          acc.revenue += Number(event.revenue ?? 0);
          return acc;
        },
        { registrations: 0, scanned: 0, revenue: 0 }
      ),
    [events]
  );

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <main className="app">
      <div className="container">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">
              V-TAPP / {scoped ? "Your events" : "Events"}
            </span>

            <h1 className="page-title">
              {scoped ? "Your Events" : "All Events"}
            </h1>

            <p className="page-subtitle">
              {scoped
                ? "The events you coordinate"
                : "Every event, with registrations and check-in progress"}
            </p>
          </div>

          <div className="header-actions">
            <span
              className={`pulse${
                live === "live" ? "" : " pulse-idle"
              }`}
            >
              {live === "live" ? "Live" : "Polling"}
            </span>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => loadEvents(true)}
              disabled={refreshing}
            >
              {refreshing && <span className="btn-spinner" />}
              {refreshing ? "Refreshing" : "Refresh"}
            </button>

            {!scoped && (
              <Link href="/admin" className="btn btn-ghost btn-sm">
                Dashboard
              </Link>
            )}

            <LogoutButton />
          </div>
        </header>

        {error && (
          <div className="banner banner-danger" role="alert">
            <AlertIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        {!loading && events.length > 0 && (
          <section className="stat-grid">
            <div className="stat stat-feature">
              <span className="stat-label">Events</span>
              <strong className="stat-value">{events.length}</strong>
              <span className="stat-meta">
                {scoped ? "Assigned to you" : "Across V-TAPP"}
              </span>
            </div>

            <div className="stat">
              <span className="stat-label">Registrations</span>
              <strong className="stat-value">
                {totals.registrations}
              </strong>
              <span className="stat-meta">All listed events</span>
            </div>

            <div className="stat">
              <span className="stat-label">Checked in</span>
              <strong className="stat-value stat-success">
                {totals.scanned}
              </strong>
              <span className="stat-meta">QR codes scanned</span>
            </div>

            {canSeeRevenue && (
              <div className="stat">
                <span className="stat-label">Revenue</span>
                <strong className="stat-value">
                  {formatAmount(totals.revenue)}
                </strong>
                <span className="stat-meta">All listed events</span>
              </div>
            )}
          </section>
        )}

        <section className="panel">
          <div className="panel-header">
            <div className="search" style={{ flex: "1 1 280px" }}>
              <span className="search-icon">
                <SearchIcon size={16} />
              </span>

              <label className="sr-only" htmlFor="event-search">
                Search events
              </label>

              <input
                id="event-search"
                type="search"
                className="input"
                placeholder="Search events by name or ID"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            {!loading && (
              <span className="muted text-sm">
                {filtered.length} of {events.length}
              </span>
            )}
          </div>

          {loading ? (
            <div className="panel-body stack">
              {[1, 2, 3].map((row) => (
                <div key={row}>
                  <div className="skeleton skeleton-line" />
                  <div
                    className="skeleton skeleton-line"
                    style={{ width: "40%" }}
                  />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">
                <InboxIcon size={22} />
              </div>

              <p className="empty-title">
                {events.length === 0
                  ? scoped
                    ? "No events assigned to you yet"
                    : "No events yet"
                  : "Nothing matches that search"}
              </p>

              <p className="empty-body">
                {events.length === 0
                  ? scoped
                    ? "An administrator needs to assign you an event before it appears here."
                    : "Events appear here after a V-TAPP sync brings registrations in."
                  : "Try a different name or event ID."}
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">
                  Events with registration and check-in totals
                </caption>

                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col" className="table-num">
                      Registrations
                    </th>
                    <th scope="col" className="table-num">
                      Participants
                    </th>
                    <th scope="col" className="table-num">
                      Checked in
                    </th>
                    {canSeeRevenue && (
                      <th scope="col" className="table-num">
                        Revenue
                      </th>
                    )}
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((event) => {
                    const registrations = Number(
                      event.registrations ?? 0
                    );

                    const scanned = Number(event.scanned ?? 0);

                    const percent =
                      registrations > 0
                        ? Math.round((scanned / registrations) * 100)
                        : 0;

                    return (
                      <tr key={event.event_id}>
                        <td>
                          <div className="row-title">
                            {event.name}
                          </div>

                          <div className="row-meta">
                            {[event.event_date, event.venue]
                              .filter(Boolean)
                              .join(" · ") || "No schedule recorded"}
                          </div>
                        </td>

                        <td className="table-num">{registrations}</td>

                        <td className="table-num">
                          {event.participants}
                        </td>

                        <td className="table-num">
                          {scanned}
                          <span className="dim"> ({percent}%)</span>
                        </td>

                        {canSeeRevenue && (
                          <td className="table-num">
                            {formatAmount(Number(event.revenue ?? 0))}
                          </td>
                        )}

                        <td className="table-num">
                          <Link
                            href={`/events/${encodeURIComponent(
                              event.event_id
                            )}`}
                            className="btn btn-ghost btn-sm"
                          >
                            Open
                            <ArrowRightIcon size={13} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
