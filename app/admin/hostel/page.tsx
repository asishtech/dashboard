"use client";

import { useEffect, useMemo, useState } from "react";
import NavBar from "@/components/NavBar";
import { formatDateTimeIst } from "@/lib/format-time";
import { DownloadIcon, SearchIcon } from "@/components/icons";
import type { HostelGuest } from "@/app/api/admin/hostel/route";

type Summary = {
  total: number;
  checkedIn: number;
  inside: number;
  exited: number;
};

const ORIGIN_LABEL: Record<HostelGuest["origin"], string> = {
  internal: "Internal",
  external: "External",
  unknown: "Unknown",
};

function status(guest: HostelGuest) {
  if (guest.exited_at) return { label: "Left", className: "" };
  if (guest.entered_at)
    return { label: "Inside", className: "badge-success" };
  return { label: "Not arrived", className: "badge-warning" };
}

export default function HostelPage() {
  const [guests, setGuests] = useState<HostelGuest[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/admin/hostel", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Unable to read hostel registrations"
          );
        }

        if (!cancelled) {
          setGuests(data.guests ?? []);
          setSummary(data.summary ?? null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to read this"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return guests;

    return guests.filter((guest) =>
      [guest.name, guest.email, guest.phone, guest.block, guest.room]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    );
  }, [guests, search]);

  const formatTime = (value: string) =>
    formatDateTimeIst(value, {
      dateStyle: "medium",
      timeStyle: "short",
    });

  return (
    <main className="app">
      <NavBar />

      <div className="container">
        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / Hostel</span>

            <h1 className="page-title">Food &amp; accommodation</h1>

            <p className="page-subtitle">
              Everyone who booked a hostel stay, with the day and room
              they chose
            </p>
          </div>

          <div className="header-actions">
            <a
              className="btn btn-ghost btn-sm"
              href="/api/admin/hostel?pdf=1"
              download
            >
              <DownloadIcon size={13} />
              QR passes (PDF)
            </a>

            <a
              className="btn btn-ghost btn-sm"
              href="/api/admin/hostel?xlsx=1"
              download
            >
              <DownloadIcon size={13} />
              Download as Excel
            </a>
          </div>
        </header>

        {error && (
          <div className="banner banner-danger mb-6">{error}</div>
        )}

        {loading ? (
          <section className="panel">
            <div className="panel-body stack">
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-card" />
            </div>
          </section>
        ) : (
          <>
            {summary && (
              <section className="stat-grid mb-6">
                <div className="stat stat-feature">
                  <span className="stat-label">Registrations</span>
                  <strong className="stat-value">
                    {summary.total}
                  </strong>
                </div>

                <div className="stat">
                  <span className="stat-label">Checked in</span>
                  <strong className="stat-value">
                    {summary.checkedIn}
                  </strong>
                  <span className="stat-meta">
                    of {summary.total}
                  </span>
                </div>

                <div className="stat">
                  <span className="stat-label">Inside now</span>
                  <strong className="stat-value">
                    {summary.inside}
                  </strong>
                </div>

                <div className="stat">
                  <span className="stat-label">Left</span>
                  <strong className="stat-value">
                    {summary.exited}
                  </strong>
                </div>
              </section>
            )}

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Guests</h2>

                  <p className="panel-subtitle">
                    {guests.length} registration
                    {guests.length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="search" style={{ flex: "0 1 240px" }}>
                  <span className="search-icon">
                    <SearchIcon size={14} />
                  </span>

                  <input
                    className="input"
                    placeholder="Name, email, phone, block or room"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="empty">
                  <p className="empty-title">Nothing here</p>

                  <p className="empty-body">
                    {search
                      ? "No guest matches that."
                      : "No hostel registrations yet."}
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <caption className="sr-only">
                      Hostel registrations
                    </caption>

                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Phone</th>
                        <th scope="col">Email</th>
                        <th scope="col">Origin</th>
                        <th scope="col">Day</th>
                        <th scope="col">Accommodation</th>
                        <th scope="col">Block</th>
                        <th scope="col">Room</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filtered.map((guest) => {
                        const st = status(guest);

                        return (
                          <tr key={guest.id}>
                            <td>
                              <div className="row-title">
                                {guest.name}
                              </div>
                            </td>

                            <td className="mono">
                              {guest.phone ?? "—"}
                            </td>

                            <td>{guest.email ?? "—"}</td>

                            <td>
                              <span
                                className={`badge ${
                                  guest.origin === "internal"
                                    ? "badge-plain"
                                    : guest.origin === "external"
                                      ? "badge-accent"
                                      : "badge-warning"
                                }`}
                              >
                                {ORIGIN_LABEL[guest.origin]}
                              </span>
                            </td>

                            <td>
                              {guest.day ?? (
                                <span className="help">
                                  Not specified
                                </span>
                              )}
                            </td>

                            <td>
                              {guest.accommodation ?? (
                                <span className="help">
                                  Not specified
                                </span>
                              )}
                            </td>

                            <td>{guest.block ?? "—"}</td>

                            <td>{guest.room ?? "—"}</td>

                            <td>
                              <span
                                className={`badge ${st.className}`}
                                title={
                                  guest.entered_at
                                    ? `Checked in ${formatTime(guest.entered_at)}${
                                        guest.exited_at
                                          ? ` · Left ${formatTime(guest.exited_at)}`
                                          : ""
                                      }`
                                    : undefined
                                }
                              >
                                {st.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="panel-footer">
                Showing {filtered.length} of {guests.length}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
