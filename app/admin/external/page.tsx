"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import NavBar from "@/components/NavBar";
import {
  AlertIcon,
  DownloadIcon,
  SearchIcon,
} from "@/components/icons";

type College = {
  name: string;
  key: string;
  registrations: number;
  people: number;
  events: number;
  revenue: number;
  /* How many ways this one college was typed. */
  spellings: number;
};

type Totals = {
  externalRegistrations: number;
  externalPeople: number;
  colleges: number;
  revenue: number;
  noCollegeRecorded: number;
  internal: number;
};

export default function ExternalPage() {
  const [colleges, setColleges] = useState<College[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [ready, setReady] = useState(true);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/external", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to read this");
      }

      if (data.ready === false) {
        setReady(false);
        setReason(data.reason ?? "");
        return;
      }

      setColleges(data.colleges ?? []);
      setTotals(data.totals ?? null);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to read this"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return colleges;

    return colleges.filter((college) =>
      college.name.toLowerCase().includes(query)
    );
  }, [colleges, search]);

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <main className="app">
      <NavBar />

      <div className="container">
        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / External</span>

            <h1 className="page-title">Visiting colleges</h1>

            <p className="page-subtitle">
              Everyone registered from outside VIT-AP, grouped by the
              institution they named
            </p>
          </div>

          <div className="header-actions">
            <a
              className="btn btn-ghost btn-sm"
              href="/api/external?xlsx=1"
              download
            >
              <DownloadIcon size={13} />
              Download as Excel
            </a>
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

        {loading && (
          <section className="panel">
            <div className="panel-body stack">
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-card" />
            </div>
          </section>
        )}

        {totals && (
          <>
            <section className="stat-grid mb-6">
              <div className="stat stat-feature">
                <span className="stat-label">Colleges</span>

                <strong className="stat-value">
                  {totals.colleges}
                </strong>

                <span className="stat-meta">
                  Other than VIT-AP
                </span>
              </div>

              <div className="stat">
                <span className="stat-label">Registrations</span>

                <strong className="stat-value">
                  {totals.externalRegistrations}
                </strong>

                <span className="stat-meta">
                  {totals.externalPeople} people
                </span>
              </div>

              <div className="stat">
                <span className="stat-label">Revenue</span>

                <strong className="stat-value">
                  {formatAmount(totals.revenue)}
                </strong>

                <span className="stat-meta">From visitors</span>
              </div>

              <div className="stat">
                <span className="stat-label">No college given</span>

                <strong
                  className={`stat-value ${
                    totals.noCollegeRecorded > 0 ? "stat-warning" : ""
                  }`}
                >
                  {totals.noCollegeRecorded}
                </strong>

                {/*
                  Said outright rather than folded into "internal".
                  These registrations named no institution at all, so
                  whether they are visitors is genuinely unknown --
                  and a figure that hides its own uncertainty is worse
                  than one that admits it.
                */}
                <span className="stat-meta">
                  Counted as neither
                </span>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">By college</h2>

                  <p className="panel-subtitle">
                    Spellings are folded together, so &quot;VIT AP&quot;,
                    &quot;VIT-AP&quot; and &quot;Vitap&quot; count once
                  </p>
                </div>

                <div className="search" style={{ flex: "0 1 240px" }}>
                  <span className="search-icon">
                    <SearchIcon size={14} />
                  </span>

                  <input
                    className="input"
                    placeholder="Find a college"
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                  />
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="empty">
                  <p className="empty-title">Nothing here</p>

                  <p className="empty-body">
                    {search
                      ? "No college matches that."
                      : "No registrations from outside VIT-AP yet."}
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <caption className="sr-only">
                      External registrations by college
                    </caption>

                    <thead>
                      <tr>
                        <th scope="col">College</th>
                        <th scope="col" className="table-num">
                          Registrations
                        </th>
                        <th scope="col" className="table-num">
                          People
                        </th>
                        <th scope="col" className="table-num">
                          Events
                        </th>
                        <th scope="col" className="table-num">
                          Revenue
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {filtered.map((college) => (
                        <tr key={college.key}>
                          <td>
                            <div className="row-title">
                              {college.name}
                            </div>

                            {college.spellings > 1 && (
                              <div className="row-meta">
                                typed {college.spellings} different
                                ways
                              </div>
                            )}
                          </td>

                          <td className="table-num">
                            {college.registrations}
                          </td>

                          <td className="table-num">
                            {college.people}
                          </td>

                          <td className="table-num">
                            {college.events}
                          </td>

                          <td className="table-num">
                            {formatAmount(Number(college.revenue))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="panel-footer">
                Showing {filtered.length} of {colleges.length}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
