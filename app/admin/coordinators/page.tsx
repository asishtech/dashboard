"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import {
  AlertIcon,
  CheckIcon,
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

export default function CoordinatorsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);

  const [email, setEmail] = useState("");
  const [eventId, setEventId] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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

      setEventId((current) =>
        current || (data.events?.[0]?.event_id ?? "")
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

  async function addCoordinator(event: React.FormEvent) {
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
          ? `${normalized} already had access to ${data.event}.`
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

  async function revoke(assignment: Assignment) {
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/coordinators?id=${assignment.id}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to revoke access");
      }

      setMessage(
        `Removed ${assignment.email} from ${assignment.event_name}.`
      );

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to revoke access"
      );
    }
  }

  return (
    <main className="app">
      <div className="container container-narrow">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / Access</span>

            <h1 className="page-title">Club Coordinators</h1>

            <p className="page-subtitle">
              Grant an email read access to a single event
            </p>
          </div>

          <div className="header-actions">
            <Link href="/events" className="btn btn-ghost btn-sm">
              Events
            </Link>

            <Link href="/admin" className="btn btn-ghost btn-sm">
              Dashboard
            </Link>

            <LogoutButton />
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

        <div className="grid grid-main">

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Grant access</h2>

                <p className="panel-subtitle">
                  They sign in with Google using this address.
                </p>
              </div>
            </div>

            <form className="panel-body" onSubmit={addCoordinator}>
              <div className="field">
                <label className="label" htmlFor="coordinator-email">
                  Coordinator email{" "}
                  <span className="required" aria-hidden="true">
                    *
                  </span>
                </label>

                <input
                  id="coordinator-email"
                  type="email"
                  className="input"
                  placeholder="coordinator@vitap.ac.in"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={saving}
                  required
                />

                <p className="help">
                  Must match the Google account they sign in with.
                </p>
              </div>

              <div className="field">
                <label className="label" htmlFor="coordinator-event">
                  Event{" "}
                  <span className="required" aria-hidden="true">
                    *
                  </span>
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
                    events.map((option) => (
                      <option
                        key={option.event_id}
                        value={option.event_id}
                      >
                        {option.name} (#{option.event_id})
                      </option>
                    ))
                  )}
                </select>

                <p className="help">
                  Add the same address again to give them a second
                  event.
                </p>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={saving || events.length === 0}
              >
                {saving && <span className="btn-spinner" />}
                {saving ? "Granting" : "Grant access"}
              </button>

              <p className="help mt-4">
                Coordinators see participant name, email and
                registration number for their event only. Mobile
                numbers, payment records and other events are never
                sent to them.
              </p>
            </form>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Who has access</h2>

                <p className="panel-subtitle">
                  {loading
                    ? " "
                    : `${assignments.length} assignment${
                        assignments.length === 1 ? "" : "s"
                      }`}
                </p>
              </div>
            </div>

            {loading ? (
              <div className="panel-body stack">
                {[1, 2, 3].map((row) => (
                  <div key={row}>
                    <div className="skeleton skeleton-line" />
                    <div
                      className="skeleton skeleton-line"
                      style={{ width: "45%" }}
                    />
                  </div>
                ))}
              </div>
            ) : assignments.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">
                  <UsersIcon size={22} />
                </div>

                <p className="empty-title">No coordinators yet</p>

                <p className="empty-body">
                  Add an email on the left to give a club coordinator
                  access to their event.
                </p>
              </div>
            ) : (
              <div className="panel-body-flush">
                {assignments.map((assignment) => (
                  <div className="row-card" key={assignment.id}>
                    <div className="truncate">
                      <div className="row-title truncate">
                        {assignment.email}
                      </div>

                      <div className="row-meta">
                        <span className="badge badge-accent">
                          {assignment.event_name}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => revoke(assignment)}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="panel-footer">
              Revoking removes this event only. If it was their last
              one they keep the coordinator role but see nothing.
            </div>
          </section>
        </div>

      </div>
    </main>
  );
}
