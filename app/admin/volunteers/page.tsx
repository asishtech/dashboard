"use client";

import { useEffect, useMemo, useState } from "react";
import NavBar from "@/components/NavBar";
import {
  AlertIcon,
  CheckIcon,
  SearchIcon,
  UsersIcon,
} from "@/components/icons";

type EventOption = {
  event_id: string;
  name: string;
  day: string | null;
  isMerch: boolean;
};

type Scope = {
  email: string;
  eventIds: string[];
};

export default function VolunteersPage() {
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [ready, setReady] = useState(true);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [removingEmail, setRemovingEmail] = useState<string | null>(
    null
  );

  const eventById = useMemo(
    () => new Map(events.map((event) => [event.event_id, event])),
    [events]
  );

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/volunteers", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setReady(false);
          setReason(data.error ?? "");
          return;
        }

        throw new Error(data.error || "Unable to load volunteers");
      }

      setReady(true);
      setScopes(data.scopes ?? []);
      setEvents(data.events ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load this"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function toggleEvent(eventId: string) {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);

      return next;
    });
  }

  function edit(scope: Scope) {
    setEmail(scope.email);
    setSelected(new Set(scope.eventIds));
    setNotice("");
    setError("");
  }

  function resetForm() {
    setEmail("");
    setSelected(new Set());
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();

    const normalized = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError("Enter a valid email address.");
      return;
    }

    setError("");
    setNotice("");
    setSaving(true);

    try {
      const response = await fetch("/api/admin/volunteers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalized,
          eventIds: [...selected],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save that scope");
      }

      setNotice(
        data.unrestricted
          ? `${normalized} can now scan anything.`
          : `${normalized} scoped to ${selected.size} event${
              selected.size === 1 ? "" : "s"
            }.`
      );

      resetForm();
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save that scope"
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeAll(scope: Scope) {
    if (
      !window.confirm(
        `Remove ${scope.email}'s scope? They will be able to scan any event again.`
      )
    ) {
      return;
    }

    setRemovingEmail(scope.email);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/volunteers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: scope.email, eventIds: [] }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to remove that scope");
      }

      setNotice(`${scope.email} can now scan anything.`);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to remove that scope"
      );
    } finally {
      setRemovingEmail(null);
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return scopes;

    return scopes.filter((scope) =>
      scope.email.toLowerCase().includes(query)
    );
  }, [scopes, search]);

  return (
    <main className="app">
      <NavBar />

      <div className="container">
        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / Volunteers</span>

            <h1 className="page-title">Volunteer scopes</h1>

            <p className="page-subtitle">
              Which events a volunteer may scan. Nobody selected means
              they can scan anything, including hostel check-in and
              exit or the merchandise counter.
            </p>
          </div>
        </header>

        {error && (
          <div className="banner banner-danger mb-6" role="alert">
            <AlertIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="banner banner-success mb-6" role="status">
            <CheckIcon size={18} />
            <span>{notice}</span>
          </div>
        )}

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

        {ready && (
          <section className="panel mb-6">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">
                  {email ? `Editing ${email}` : "Add or edit a scope"}
                </h2>

                <p className="panel-subtitle">
                  Granting access here also invites the address as a
                  volunteer if it is not staff already.
                </p>
              </div>
            </div>

            <form onSubmit={(event) => void save(event)}>
              <div className="panel-body stack">
                <div>
                  <label
                    className="sr-only"
                    htmlFor="volunteer-email"
                  >
                    Volunteer email
                  </label>

                  <input
                    id="volunteer-email"
                    type="email"
                    className="input"
                    placeholder="someone@vitapstudent.ac.in"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={saving}
                  />
                </div>

                {loading ? (
                  <div className="skeleton skeleton-line" />
                ) : (
                  <div className="stack-tight stack">
                    {events.map((option) => (
                      <label
                        key={option.event_id}
                        className="check"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(option.event_id)}
                          onChange={() =>
                            toggleEvent(option.event_id)
                          }
                          disabled={saving}
                        />

                        <span>
                          {option.name}
                          {option.isMerch && (
                            <span
                              className="badge badge-plain"
                              style={{ marginLeft: 8 }}
                            >
                              Merch
                            </span>
                          )}
                          {option.day && (
                            <span className="row-meta">
                              {option.day}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="panel-footer" style={{ display: "flex", gap: 8 }}>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={saving || !email.trim()}
                >
                  {saving && <span className="btn-spinner" />}
                  {saving ? "Saving..." : "Save scope"}
                </button>

                {email && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={resetForm}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>
        )}

        {ready && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Scoped volunteers</h2>

                <p className="panel-subtitle">
                  {scopes.length} scoped
                  {scopes.length === 1 ? "" : "s"}. Everyone else may
                  scan anything.
                </p>
              </div>

              <div className="search" style={{ flex: "0 1 240px" }}>
                <span className="search-icon">
                  <SearchIcon size={14} />
                </span>

                <input
                  className="input"
                  placeholder="Search by email"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <div className="panel-body stack">
                <div className="skeleton skeleton-line" />
                <div className="skeleton skeleton-line" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">
                  <UsersIcon size={22} />
                </div>

                <p className="empty-title">
                  {scopes.length === 0
                    ? "Nobody is scoped"
                    : "No match"}
                </p>

                <p className="empty-body">
                  {scopes.length === 0
                    ? "Every volunteer can scan anything until you scope one above."
                    : "Try a different search."}
                </p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">
                    Volunteers and the events they may scan
                  </caption>

                  <thead>
                    <tr>
                      <th scope="col">Volunteer</th>
                      <th scope="col">Scoped to</th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.map((scope) => (
                      <tr key={scope.email}>
                        <td>
                          <div className="row-title">
                            {scope.email}
                          </div>
                        </td>

                        <td>
                          <div className="stack-tight stack">
                            {scope.eventIds.map((eventId) => {
                              const option = eventById.get(eventId);

                              return (
                                <span
                                  key={eventId}
                                  className="badge badge-plain"
                                >
                                  {option?.name ?? eventId}
                                </span>
                              );
                            })}
                          </div>
                        </td>

                        <td
                          className="table-num"
                          style={{ display: "flex", gap: 8 }}
                        >
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => edit(scope)}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={removingEmail === scope.email}
                            onClick={() => void removeAll(scope)}
                          >
                            {removingEmail === scope.email
                              ? "Removing..."
                              : "Unrestrict"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
