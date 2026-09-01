"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import NavBar from "@/components/NavBar";
import {
  AlertIcon,
  CheckIcon,
  InboxIcon,
  SearchIcon,
  UsersIcon,
} from "@/components/icons";

type Assignment = {
  id: number;
  email: string;
  event_id: string;
  event_name: string;
  created_at: string;
};

type EventOption = {
  event_id: string;
  name: string;
};

type Person = {
  email: string;
  assignments: Assignment[];
};

export default function CoordinatorsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);

  const [email, setEmail] = useState("");
  const [eventId, setEventId] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [view, setView] = useState<"PEOPLE" | "GAPS">("PEOPLE");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/coordinators", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to load coordinators"
        );
      }

      setAssignments(data.coordinators ?? []);
      setEvents(data.events ?? []);
      setEventId(
        (current) => current || (data.events?.[0]?.event_id ?? "")
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load coordinators"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  /*
   * One row per person, not per assignment. Several people coordinate
   * four or five events each, and a flat list of every assignment ran
   * to 177 rows with no way to find anyone in it.
   */
  const people = useMemo(() => {
    const byEmail = new Map<string, Person>();

    for (const a of assignments) {
      const person = byEmail.get(a.email) ?? {
        email: a.email,
        assignments: [],
      };

      person.assignments.push(a);
      byEmail.set(a.email, person);
    }

    return [...byEmail.values()].sort((a, b) =>
      a.email.localeCompare(b.email)
    );
  }, [assignments]);

  /*
   * Events nobody is responsible for. This is the thing worth
   * noticing on this screen, and the old flat list could not show it
   * at all.
   */
  const uncovered = useMemo(() => {
    const covered = new Set(
      assignments.map((a) => String(a.event_id))
    );

    return events.filter(
      (e) => !covered.has(String(e.event_id))
    );
  }, [assignments, events]);

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return people;

    return people.filter(
      (p) =>
        p.email.toLowerCase().includes(q) ||
        p.assignments.some((a) =>
          a.event_name.toLowerCase().includes(q)
        )
    );
  }, [people, search]);

  const filteredUncovered = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return uncovered;

    return uncovered.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        String(e.event_id).toLowerCase().includes(q)
    );
  }, [uncovered, search]);

  async function grant(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    const normalized = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError("Enter a valid email address.");
      return;
    }

    if (!eventId) {
      setError("Choose an event.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch("/api/admin/coordinators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized, eventId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to add coordinator"
        );
      }

      setEmail("");
      setMessage(
        data.alreadyAssigned
          ? `${normalized} already had ${data.event}.`
          : `${normalized} can now see ${data.event}.`
      );

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to add coordinator"
      );
    } finally {
      setSaving(false);
    }
  }

  async function revoke(a: Assignment) {
    setError("");
    setMessage("");
    setBusyId(a.id);

    try {
      const response = await fetch(
        `/api/admin/coordinators?id=${a.id}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to revoke access");
      }

      setMessage(`Removed ${a.email} from ${a.event_name}.`);
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to revoke access"
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="app">
      <NavBar />

      <div className="container">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / Access</span>

            <h1 className="page-title">Club Coordinators</h1>

            <p className="page-subtitle">
              Who can see which event
            </p>
          </div>

          <div className="header-actions">

          </div>
        </header>

        {error && (
          <div className="banner banner-danger" role="alert">
            <AlertIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div
            className="banner banner-success"
            role="status"
            aria-live="polite"
          >
            <CheckIcon size={18} />
            <span>{message}</span>
          </div>
        )}

        <section className="stat-grid">
          <div className="stat stat-feature">
            <span className="stat-label">Coordinators</span>
            <strong className="stat-value">
              {loading ? "—" : people.length}
            </strong>
            <span className="stat-meta">
              {loading ? " " : `${assignments.length} assignments`}
            </span>
          </div>

          <div className="stat">
            <span className="stat-label">Events covered</span>
            <strong className="stat-value stat-success">
              {loading ? "—" : events.length - uncovered.length}
            </strong>
            <span className="stat-meta">of {events.length}</span>
          </div>

          <div className="stat">
            <span className="stat-label">No coordinator</span>
            <strong
              className={`stat-value ${
                uncovered.length > 0 ? "stat-warning" : ""
              }`}
            >
              {loading ? "—" : uncovered.length}
            </strong>
            <span className="stat-meta">Nobody assigned yet</span>
          </div>
        </section>

        {/* Grant access */}
        <section className="panel mb-8">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Grant access</h2>
              <p className="panel-subtitle">
                They see participant name, email and registration
                number for this event only.
              </p>
            </div>
          </div>

          <form className="panel-body grant-form" onSubmit={grant}>
            <div className="field mb-0">
              <label className="label" htmlFor="coordinator-email">
                Coordinator email
              </label>

              <input
                id="coordinator-email"
                type="email"
                className="input"
                placeholder="name@vitap.ac.in"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
                required
              />
            </div>

            <div className="field mb-0">
              <label className="label" htmlFor="coordinator-event">
                Event
              </label>

              <select
                id="coordinator-event"
                className="select"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                disabled={saving || events.length === 0}
              >
                {events.length === 0 ? (
                  <option value="">No events yet</option>
                ) : (
                  events.map((o) => (
                    <option key={o.event_id} value={o.event_id}>
                      {o.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || events.length === 0}
            >
              {saving && <span className="btn-spinner" />}
              {saving ? "Granting" : "Grant"}
            </button>
          </form>
        </section>

        {/* People / gaps */}
        <section className="panel">
          <div className="panel-header">
            <div className="search" style={{ flex: "1 1 280px" }}>
              <span className="search-icon">
                <SearchIcon size={16} />
              </span>

              <label className="sr-only" htmlFor="coordinator-search">
                Search coordinators and events
              </label>

              <input
                id="coordinator-search"
                type="search"
                className="input"
                placeholder="Search by email or event"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div
              className="segmented"
              role="group"
              aria-label="Choose a view"
            >
              <button
                type="button"
                className="segmented-item"
                aria-pressed={view === "PEOPLE"}
                onClick={() => setView("PEOPLE")}
              >
                People
              </button>

              <button
                type="button"
                className="segmented-item"
                aria-pressed={view === "GAPS"}
                onClick={() => setView("GAPS")}
              >
                No coordinator
                {uncovered.length > 0 ? ` (${uncovered.length})` : ""}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="panel-body stack">
              {[1, 2, 3, 4].map((r) => (
                <div key={r}>
                  <div className="skeleton skeleton-line" />
                  <div
                    className="skeleton skeleton-line"
                    style={{ width: "40%" }}
                  />
                </div>
              ))}
            </div>
          ) : view === "GAPS" ? (
            filteredUncovered.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">
                  <CheckIcon size={22} />
                </div>

                <p className="empty-title">
                  {uncovered.length === 0
                    ? "Every event has a coordinator"
                    : "Nothing matches that search"}
                </p>

                <p className="empty-body">
                  {uncovered.length === 0
                    ? "All 90 events have somebody assigned."
                    : "Try a different event name."}
                </p>
              </div>
            ) : (
              <div className="panel-body-flush">
                {filteredUncovered.map((e) => (
                  <div className="row-card" key={e.event_id}>
                    <div className="truncate" style={{ flex: 1 }}>
                      <div className="row-title truncate">
                        {e.name}
                      </div>
                      <div className="row-meta">
                        Nobody can see this event
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setEventId(e.event_id);
                        setView("PEOPLE");
                        document
                          .getElementById("coordinator-email")
                          ?.focus();
                      }}
                    >
                      Assign
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : filteredPeople.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">
                {people.length === 0 ? (
                  <UsersIcon size={22} />
                ) : (
                  <InboxIcon size={22} />
                )}
              </div>

              <p className="empty-title">
                {people.length === 0
                  ? "No coordinators yet"
                  : "Nothing matches that search"}
              </p>

              <p className="empty-body">
                {people.length === 0
                  ? "Grant access above to give a coordinator their event."
                  : "Try a different email or event name."}
              </p>
            </div>
          ) : (
            <div className="panel-body-flush">
              {filteredPeople.map((person) => (
                <div className="person-row" key={person.email}>
                  <div className="truncate">
                    <div className="row-title truncate">
                      {person.email}
                    </div>

                    <div className="row-meta">
                      {person.assignments.length} event
                      {person.assignments.length === 1 ? "" : "s"}
                    </div>
                  </div>

                  <div className="chips">
                    {person.assignments.map((a) => (
                      <span className="chip" key={a.id}>
                        <span className="truncate">
                          {a.event_name}
                        </span>

                        <button
                          type="button"
                          className="chip-remove"
                          disabled={busyId === a.id}
                          onClick={() => revoke(a)}
                          aria-label={`Remove ${a.email} from ${a.event_name}`}
                          title="Revoke"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && view === "PEOPLE" && people.length > 0 && (
            <div className="panel-footer">
              Showing {filteredPeople.length} of {people.length}{" "}
              coordinators. Removing every event leaves the person
              signed in but seeing nothing.
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
