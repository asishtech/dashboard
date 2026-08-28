"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import {
  AlertIcon,
  CheckIcon,
  UsersIcon,
} from "@/components/icons";

type StaffUser = {
  id: number;
  email: string;
  role: "admin" | "volunteer";
  active: boolean;
  created_at: string;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] =
    useState<"volunteer" | "admin">("volunteer");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
            role,
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
      setRole("volunteer");

      setMessage(
        `${normalizedEmail} added as ${role}.`
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

  async function toggleUser(
    user: StaffUser
  ) {
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        "/api/admin/users",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            id: user.id,
            active: !user.active,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to update account"
        );
      }

      await loadUsers();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to update account"
      );
    }
  }

  return (
    <main className="app">
      <div className="container container-narrow">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / Access</span>

            <h1 className="page-title">Staff Accounts</h1>

            <p className="page-subtitle">
              Who can reach the admin and volunteer tools
            </p>
          </div>

          <div className="header-actions">
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
                <h2 className="panel-title">Invite a user</h2>

                <p className="panel-subtitle">
                  The profile is created when they first sign in.
                </p>
              </div>
            </div>

            <form className="panel-body" onSubmit={addUser}>
              <div className="field">
                <label className="label" htmlFor="staff-email">
                  Google email{" "}
                  <span className="required" aria-hidden="true">
                    *
                  </span>
                </label>

                <input
                  id="staff-email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  className="input"
                  placeholder="name@example.com"
                  autoComplete="email"
                  required
                  disabled={saving}
                />

                <p className="help">
                  Must match the Google account they sign in with.
                </p>
              </div>

              <div className="field">
                <label className="label" htmlFor="staff-role">
                  Role{" "}
                  <span className="required" aria-hidden="true">
                    *
                  </span>
                </label>

                <select
                  id="staff-role"
                  className="select"
                  value={role}
                  onChange={(event) =>
                    setRole(
                      event.target.value as "volunteer" | "admin"
                    )
                  }
                  disabled={saving}
                >
                  <option value="volunteer">Volunteer</option>
                  <option value="admin">Admin</option>
                </select>

                <p className="help">
                  Volunteers can scan and distribute. Admins can do
                  everything, including managing this list.
                </p>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={saving}
              >
                {saving && <span className="btn-spinner" />}
                {saving ? "Adding" : "Add user"}
              </button>
            </form>
          </section>


          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Authorized users</h2>

                <p className="panel-subtitle">
                  {loading
                    ? " "
                    : `${users.length} account${
                        users.length === 1 ? "" : "s"
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
            ) : users.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">
                  <UsersIcon size={22} />
                </div>

                <p className="empty-title">No staff yet</p>

                <p className="empty-body">
                  Add a Google email on the left to grant access.
                </p>
              </div>
            ) : (
              <div className="panel-body-flush">
                {users.map((user) => (
                  <div className="row-card" key={user.id}>
                    <div className="truncate">
                      <div className="row-title truncate">
                        {user.email}
                      </div>

                      <div className="row-meta">
                        <span
                          className={`badge ${
                            user.role === "admin"
                              ? "badge-accent"
                              : "badge-plain"
                          }`}
                        >
                          {user.role}
                        </span>{" "}
                        {!user.active && (
                          <span className="badge badge-danger">
                            Disabled
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleUser(user)}
                      className={`btn btn-sm ${
                        user.active ? "btn-danger" : "btn-ghost"
                      }`}
                    >
                      {user.active ? "Disable" : "Enable"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="panel-footer">
              Disabling revokes the invite. Someone who has already
              signed in keeps their role until their profile is
              deactivated too.
            </div>
          </section>
        </div>

      </div>
    </main>
  );
}
