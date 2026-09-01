"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import { useLiveRefresh } from "@/lib/use-realtime";
import {
  AlertIcon,
  DownloadIcon,
  InboxIcon,
  SearchIcon,
} from "@/components/icons";

type Attendee = {
  registration_id: string;
  name: string | null;
  email: string | null;
  scanned: boolean;
};

type EventDetail = {
  event_id: string;
  name: string;
  event_date: string | null;
  registrations: number;
  participants: number;
  scanned: number;
  revenue?: number;
};

const LIVE_TABLES = ["registrations", "qr_scans"];

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ event_id: string }>;
}) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [canSeeRevenue, setCanSeeRevenue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "IN" | "OUT">("ALL");

  const load = useCallback(async () => {
    try {
      const { event_id } = await params;

      const response = await fetch(
        `/api/events/${encodeURIComponent(event_id)}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load event");
      }

      setEvent(data.event);
      setAttendees(data.attendees ?? []);
      setCanSeeRevenue(Boolean(data.canSeeRevenue));
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load event"
      );
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    const timer = window.setTimeout(() => load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useLiveRefresh(LIVE_TABLES, load);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return attendees.filter((attendee) => {
      if (filter === "IN" && !attendee.scanned) return false;
      if (filter === "OUT" && attendee.scanned) return false;

      if (!query) return true;

      return [
        attendee.name,
        attendee.email,
        attendee.registration_id,
      ].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(query)
      );
    });
  }, [attendees, search, filter]);

  function exportCsv() {
    const rows = [
      ["Registration ID", "Name", "Email", "Checked in"],
      ...filtered.map((a) => [
        a.registration_id,
        a.name ?? "",
        a.email ?? "",
        a.scanned ? "Yes" : "No",
      ]),
    ];

    /* Quote every field so commas in names cannot break a row. */
    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" })
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = `${event?.name ?? "event"}-attendees.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);

  if (loading) {
    return (
      <main className="app">
        <div className="container">
          <div className="skeleton skeleton-title" />
          <section className="panel">
            <div className="panel-body stack">
              <div className="skeleton skeleton-line" />
              <div
                className="skeleton skeleton-line"
                style={{ width: "60%" }}
              />
              <div className="skeleton skeleton-card" />
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (error || !event) {
    return (
      <main className="app center-screen">
        <div className="center-card center-card-wide">
          <div className="brand-mark">
            <AlertIcon size={24} />
          </div>

          <h1 className="page-title">Event unavailable</h1>

          <p className="page-subtitle">
            {error || "This event could not be loaded."}
          </p>

          <Link href="/events" className="btn btn-block mt-8">
            Back to events
          </Link>
        </div>
      </main>
    );
  }

  const percent =
    event.registrations > 0
      ? Math.round((event.scanned / event.registrations) * 100)
      : 0;

  return (
    <main className="app">
      <div className="container">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">
              V-TAPP / Event #{event.event_id}
            </span>

            <h1 className="page-title">{event.name}</h1>

            <p className="page-subtitle">
              {event.event_date || "No date recorded"}
            </p>
          </div>

          <div className="header-actions">
            <Link href="/events" className="btn btn-ghost btn-sm">
              All events
            </Link>

            <LogoutButton />
          </div>
        </header>

        <section className="stat-grid">
          <div className="stat stat-feature">
            <span className="stat-label">Registrations</span>
            <strong className="stat-value">
              {event.registrations}
            </strong>
            <span className="stat-meta">
              {event.participants} unique participants
            </span>
          </div>

          <div className="stat">
            <span className="stat-label">Checked in</span>
            <strong className="stat-value stat-success">
              {event.scanned}
            </strong>
            <span className="stat-meta">{percent}% of registrations</span>
          </div>

          <div className="stat">
            <span className="stat-label">Not yet arrived</span>
            <strong className="stat-value stat-warning">
              {Math.max(event.registrations - event.scanned, 0)}
            </strong>
            <span className="stat-meta">Awaiting check-in</span>
          </div>

          {canSeeRevenue && event.revenue !== undefined && (
            <div className="stat">
              <span className="stat-label">Revenue</span>
              <strong className="stat-value">
                {formatAmount(Number(event.revenue))}
              </strong>
              <span className="stat-meta">Recorded sales</span>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div className="search" style={{ flex: "1 1 260px" }}>
              <span className="search-icon">
                <SearchIcon size={16} />
              </span>

              <label className="sr-only" htmlFor="attendee-search">
                Search attendees
              </label>

              <input
                id="attendee-search"
                type="search"
                className="input"
                placeholder="Search name, email or registration ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div
              className="segmented"
              role="group"
              aria-label="Filter by check-in status"
            >
              {(
                [
                  ["ALL", "All"],
                  ["IN", "Checked in"],
                  ["OUT", "Pending"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="segmented-item"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={exportCsv}
              disabled={filtered.length === 0}
            >
              <DownloadIcon size={14} />
              Export
            </button>
          </div>

          {filtered.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">
                <InboxIcon size={22} />
              </div>

              <p className="empty-title">
                {attendees.length === 0
                  ? "No registrations yet"
                  : "Nothing matches this view"}
              </p>

              <p className="empty-body">
                {attendees.length === 0
                  ? "Registrations appear here after the next V-TAPP sync."
                  : "Try a different search term or clear the filter."}
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">
                  Attendees for {event.name}
                </caption>

                <thead>
                  <tr>
                    <th scope="col">Participant</th>
                    <th scope="col">Registration</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((attendee) => (
                    <tr key={attendee.registration_id}>
                      <td>
                        <div className="row-title">
                          {attendee.name || "Unnamed"}
                        </div>

                        <div className="row-meta truncate">
                          {attendee.email || "No email"}
                        </div>
                      </td>

                      <td className="mono dim">
                        #{attendee.registration_id}
                      </td>

                      <td>
                        <span
                          className={`badge ${
                            attendee.scanned
                              ? "badge-success"
                              : "badge-warning"
                          }`}
                        >
                          {attendee.scanned
                            ? "Checked in"
                            : "Pending"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="panel-footer">
            Showing {filtered.length} of {attendees.length} registrations
          </div>
        </section>

      </div>
    </main>
  );
}
