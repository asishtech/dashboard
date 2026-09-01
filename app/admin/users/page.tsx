"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import {
  AlertIcon,
  CheckIcon,
  SearchIcon,
  UsersIcon,
} from "@/components/icons";

type StaffRole = "admin" | "faculty" | "volunteer" | "buyer";

type Filter = StaffRole | "ALL" | "DISABLED";

type StaffUser = {
  id: number;
  email: string;
  /* Primary role, derived from `roles` by the database. */
  role: StaffRole;
  /* Every role this person may act as. */
  roles: StaffRole[] | null;
  active: boolean;
  created_at: string;
};

/* Tolerates rows a migration has not reached yet. */
function rolesOf(u: StaffUser): StaffRole[] {
  return u.roles && u.roles.length > 0 ? u.roles : [u.role];
}

/*
 * What each role gets, shown next to the picker so the choice is not
 * guesswork.
 */
const ROLES: { value: StaffRole; label: string; help: string }[] = [
  {
    value: "admin",
    label: "Admin",
    help: "Everything, including staff and roles.",
  },
  {
    value: "faculty",
    label: "Faculty",
    help: "Only the events they are assigned to.",
  },
  {
    value: "volunteer",
    label: "Volunteer",
    help: "Scan QR codes and hand merchandise over.",
  },
  {
    value: "buyer",
    label: "Buyer",
    help: "Only their own registrations.",
  },
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [email, setEmail] = useState("");
  const [newRoles, setNewRoles] = useState<StaffRole[]>([
    "faculty",
  ]);

  /* Row currently being saved, so only that row shows a spinner. */
  const [savingId, setSavingId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");

  async function loadUsers() {
    try {
      setLoading(true);

      const response = await fetch(
        "/api/admin/users",
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to load staff accounts"
        );
      }

      setUsers(data.users ?? []);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to load staff accounts"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadUsers();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  async function addUser(
    event: React.FormEvent
  ) {
    event.preventDefault();

    setError("");
    setMessage("");

    const normalizedEmail =
      email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Email address is required.");
      return;
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        normalizedEmail
      )
    ) {
      setError(
        "Enter a valid email address."
      );
      return;
    }

    if (newRoles.length === 0) {
      setError("Pick at least one role.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        "/api/admin/users",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            email: normalizedEmail,
            roles: newRoles,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to add staff account"
        );
      }

      setEmail("");

      setMessage(
        `${normalizedEmail} added as ${newRoles.join(" + ")}.`
      );

      await loadUsers();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to add staff account"
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateUser(
    user: StaffUser,
    patch: { active?: boolean; roles?: StaffRole[] }
  ) {
    setError("");
    setMessage("");
    setSavingId(user.id);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, ...patch }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to update account");
      }

      setMessage(
        patch.roles
          ? `${user.email} is now ${patch.roles.join(" + ")}.`
          : patch.active
            ? `${user.email} can sign in.`
            : `${user.email} can no longer sign in.`
      );

      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update account"
      );
    } finally {
      setSavingId(null);
    }
  }

  /*
   * Almost everyone here is faculty -- the coordinator seed created
   * 129 invites in one go. Without a filter and a search box this is
   * one long list nobody can find anything in.
   */
  const counts = useMemo(() => {
    const by: Record<string, number> = {
      admin: 0,
      faculty: 0,
      volunteer: 0,
      buyer: 0,
    };

    let disabled = 0;

    for (const u of users) {
      for (const r of rolesOf(u)) {
        by[r] = (by[r] ?? 0) + 1;
      }
      if (!u.active) disabled++;
    }

    return { by, disabled };
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return users.filter((u) => {
      if (filter === "DISABLED" && u.active) return false;
      if (
        filter !== "ALL" &&
        filter !== "DISABLED" &&
        !rolesOf(u).includes(filter)
      ) {
        return false;
      }

      if (!q) return true;

      return u.email.toLowerCase().includes(q);
    });
  }, [users, search, filter]);

  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: "ALL", label: "All", n: users.length },
    { key: "admin", label: "Admins", n: counts.by.admin },
    { key: "volunteer", label: "Volunteers", n: counts.by.volunteer },
    { key: "faculty", label: "Faculty", n: counts.by.faculty },
    { key: "DISABLED", label: "Disabled", n: counts.disabled },
  ];

  return (
    <main className="app">
      <NavBar />

      <div className="container">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / Access</span>

            <h1 className="page-title">Staff Accounts</h1>

            <p className="page-subtitle">
              Who can sign in, and what they can reach
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
            <span className="stat-label">Can sign in</span>
            <strong className="stat-value">
              {loading ? "—" : users.length - counts.disabled}
            </strong>
            <span className="stat-meta">
              {loading
                ? " "
                : counts.disabled > 0
                  ? `${counts.disabled} disabled`
                  : "Nobody disabled"}
            </span>
          </div>

          <div className="stat">
            <span className="stat-label">Admins</span>
            <strong className="stat-value">
              {loading ? "—" : counts.by.admin}
            </strong>
            <span className="stat-meta">Full access</span>
          </div>

          <div className="stat">
            <span className="stat-label">Volunteers</span>
            <strong className="stat-value">
              {loading ? "—" : counts.by.volunteer}
            </strong>
            <span className="stat-meta">Scan and distribute</span>
          </div>

          <div className="stat">
            <span className="stat-label">Faculty</span>
            <strong className="stat-value">
              {loading ? "—" : counts.by.faculty}
            </strong>
            <span className="stat-meta">Their own events</span>
          </div>
        </section>

        {/* Invite */}
        <section className="panel mb-8">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Invite someone</h2>

              <p className="panel-subtitle">
                The role attaches when they first sign in with Google.
                Faculty also need an event, which is set on the{" "}
                <Link href="/admin/coordinators" className="link">
                  coordinators
                </Link>{" "}
                screen.
              </p>
            </div>
          </div>

          <form className="panel-body grant-form" onSubmit={addUser}>
            <div className="field mb-0">
              <label className="label" htmlFor="staff-email">
                Google email
              </label>

              <input
                id="staff-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                className="input"
                placeholder="name@vitap.ac.in"
                autoComplete="email"
                required
                disabled={saving}
              />
            </div>

            <div className="field mb-0">
              <span className="label">Roles</span>

              <div className="role-picker">
                {ROLES.map((option) => {
                  const on = newRoles.includes(option.value);

                  return (
                    <label
                      key={option.value}
                      className={`role-chip${on ? " is-on" : ""}`}
                      title={option.help}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={saving}
                        onChange={() =>
                          setNewRoles((current) =>
                            current.includes(option.value)
                              ? current.filter(
                                  (r) => r !== option.value
                                )
                              : [...current, option.value]
                          )
                        }
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving && <span className="btn-spinner" />}
              {saving ? "Adding" : "Invite"}
            </button>
          </form>

          <div className="panel-footer">
            {newRoles.length === 0
              ? "Pick at least one role."
              : newRoles
                  .map(
                    (r) => ROLES.find((o) => o.value === r)?.help
                  )
                  .filter(Boolean)
                  .join(" ")}
          </div>
        </section>

        {/* List */}
        <section className="panel">
          <div className="panel-header">
            <div className="search" style={{ flex: "1 1 260px" }}>
              <span className="search-icon">
                <SearchIcon size={16} />
              </span>

              <label className="sr-only" htmlFor="staff-search">
                Search staff by email
              </label>

              <input
                id="staff-search"
                type="search"
                className="input"
                placeholder="Search by email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div
              className="segmented"
              role="group"
              aria-label="Filter by role"
            >
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className="segmented-item"
                  aria-pressed={filter === t.key}
                  onClick={() => setFilter(t.key)}
                >
                  {t.label}
                  {t.n > 0 ? ` ${t.n}` : ""}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="panel-body stack">
              {[1, 2, 3, 4].map((row) => (
                <div key={row}>
                  <div className="skeleton skeleton-line" />
                  <div
                    className="skeleton skeleton-line"
                    style={{ width: "45%" }}
                  />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">
                <UsersIcon size={22} />
              </div>

              <p className="empty-title">
                {users.length === 0
                  ? "No staff yet"
                  : "Nothing matches this view"}
              </p>

              <p className="empty-body">
                {users.length === 0
                  ? "Invite a Google email above to grant access."
                  : "Try a different email or clear the filter."}
              </p>
            </div>
          ) : (
            <div className="panel-body-flush">
              {filtered.map((user) => (
                <div className="row-card" key={user.id}>
                  <label className="access-toggle">
                    <input
                      type="checkbox"
                      checked={user.active}
                      disabled={savingId === user.id}
                      onChange={(event) =>
                        updateUser(user, {
                          active: event.target.checked,
                        })
                      }
                    />

                    <span className="sr-only">
                      Allow {user.email} to sign in
                    </span>
                  </label>

                  <div className="truncate" style={{ flex: 1 }}>
                    <div className="row-title truncate">
                      {user.email}
                    </div>

                    <div className="row-meta">
                      {user.active
                        ? `Acts as ${rolesOf(user).join(", ")}`
                        : "No access"}
                    </div>
                  </div>

                  <fieldset className="role-picker" disabled={
                    savingId === user.id || !user.active
                  }>
                    <legend className="sr-only">
                      Roles for {user.email}
                    </legend>

                    {ROLES.map((option) => {
                      const held = rolesOf(user);
                      const on = held.includes(option.value);

                      return (
                        <label
                          key={option.value}
                          className={`role-chip${on ? " is-on" : ""}`}
                          title={option.help}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              updateUser(user, {
                                roles: on
                                  ? held.filter(
                                      (r) => r !== option.value
                                    )
                                  : [...held, option.value],
                              })
                            }
                          />
                          {option.label}
                        </label>
                      );
                    })}
                  </fieldset>
                </div>
              ))}
            </div>
          )}

          <div className="panel-footer">
            Showing {filtered.length} of {users.length}. Unticking
            revokes access immediately, including for people already
            signed in. You cannot change your own role or disable
            yourself.
          </div>
        </section>

      </div>
    </main>
  );
}
