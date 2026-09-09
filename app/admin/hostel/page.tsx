"use client";

import { useEffect, useMemo, useState } from "react";
import NavBar from "@/components/NavBar";
import { SearchIcon } from "@/components/icons";
import type { HostelGuest } from "@/app/api/admin/hostel/route";

export default function HostelPage() {
  const [guests, setGuests] = useState<HostelGuest[]>([]);
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

        if (!cancelled) setGuests(data.guests ?? []);
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
      [guest.name, guest.email, guest.phone]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    );
  }, [guests, search]);

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
                  placeholder="Name, email or phone number"
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
                      <th scope="col">Day</th>
                      <th scope="col">Accommodation</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.map((guest) => (
                      <tr key={guest.id}>
                        <td>
                          <div className="row-title">{guest.name}</div>
                        </td>

                        <td className="mono">{guest.phone ?? "—"}</td>

                        <td>{guest.email ?? "—"}</td>

                        <td>
                          {guest.day ?? (
                            <span className="help">Not specified</span>
                          )}
                        </td>

                        <td>
                          {guest.accommodation ?? (
                            <span className="help">Not specified</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="panel-footer">
              Showing {filtered.length} of {guests.length}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
