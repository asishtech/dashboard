"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { formatDateIst } from "@/lib/format-time";
import { useStepUp } from "@/lib/use-step-up";
import {
  AlertIcon,
  CheckIcon,
  LockIcon,
} from "@/components/icons";
import type { StaffTwoFactor } from "@/app/api/admin/security/route";

type SuperAdminRow = {
  email: string;
  added_at: string;
  added_by: string | null;
};

export default function SecurityPage() {
  const [staff, setStaff] = useState<StaffTwoFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [superAdmins, setSuperAdmins] = useState<SuperAdminRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [allowlistLoading, setAllowlistLoading] = useState(true);
  const [allowlistError, setAllowlistError] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [allowlistBusy, setAllowlistBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const { ensure: ensureStepUp, modal: stepUpModal } = useStepUp();

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/security", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to read two-factor status"
        );
      }

      setStaff(data.staff ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to read this"
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadAllowlist() {
    setAllowlistLoading(true);
    setAllowlistError("");

    try {
      const response = await fetch("/api/admin/super-admins", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to read the allowlist");
      }

      setSuperAdmins(data.superAdmins ?? []);
      setCanManage(Boolean(data.canManage));
    } catch (err) {
      setAllowlistError(
        err instanceof Error ? err.message : "Unable to read this"
      );
    } finally {
      setAllowlistLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      void loadAllowlist();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function setUpOwnTwoFactor() {
    setNotice("");

    const ok = await ensureStepUp();

    if (ok) {
      setNotice(
        "Two-factor is set up and verified for this session."
      );

      await load();
    }
  }

  async function addToAllowlist(event: React.FormEvent) {
    event.preventDefault();

    const email = newEmail.trim().toLowerCase();

    if (!email) return;

    if (!(await ensureStepUp())) return;

    setAllowlistBusy(true);
    setAllowlistError("");

    try {
      const response = await fetch("/api/admin/super-admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to add that email");
      }

      setNewEmail("");
      await loadAllowlist();
    } catch (err) {
      setAllowlistError(
        err instanceof Error ? err.message : "Unable to add that email"
      );
    } finally {
      setAllowlistBusy(false);
    }
  }

  async function removeFromAllowlist(email: string) {
    if (
      !window.confirm(
        `Remove ${email} from this list? They will keep the admin role, but will no longer be able to change inventory or grant admin/coordinator access.`
      )
    ) {
      return;
    }

    if (!(await ensureStepUp())) return;

    setRemoving(email);
    setAllowlistError("");

    try {
      const response = await fetch(
        `/api/admin/super-admins?email=${encodeURIComponent(email)}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to remove that email");
      }

      await loadAllowlist();
    } catch (err) {
      setAllowlistError(
        err instanceof Error
          ? err.message
          : "Unable to remove that email"
      );
    } finally {
      setRemoving(null);
    }
  }

  const enrolledCount = staff.filter((s) => s.enrolled).length;

  return (
    <main className="app">
      <NavBar />

      {stepUpModal}

      <div className="container">
        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / Security</span>

            <h1 className="page-title">Two-factor authentication</h1>

            <p className="page-subtitle">
              Two-factor is required for inventory changes and for
              granting or editing admin and coordinator access; those
              same actions are also restricted to the list below
            </p>
          </div>
        </header>

        {error && (
          <div className="banner banner-danger mb-6" role="alert">
            <AlertIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        <section className="panel mb-6">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Restricted actions</h2>

              <p className="panel-subtitle">
                Only these accounts may change inventory or grant and
                edit admin/coordinator access, whether or not they
                also hold the admin role
              </p>
            </div>
          </div>

          {allowlistError && (
            <div className="panel-body">
              <div className="banner banner-danger" role="alert">
                <AlertIcon size={18} />
                <span>{allowlistError}</span>
              </div>
            </div>
          )}

          {allowlistLoading ? (
            <div className="panel-body stack">
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line" />
            </div>
          ) : (
            <>
              <div className="panel-body stack-tight stack">
                {superAdmins.length === 0 ? (
                  <p className="help">Nobody is on this list yet.</p>
                ) : (
                  superAdmins.map((row) => (
                    <div key={row.email} className="scan-item">
                      <div>
                        <div className="scan-item-name">
                          {row.email}
                        </div>

                        <div className="scan-item-meta">
                          Added{" "}
                          {formatDateIst(row.added_at, {
                            dateStyle: "medium",
                          })}
                          {row.added_by ? ` by ${row.added_by}` : ""}
                        </div>
                      </div>

                      {canManage && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={removing === row.email}
                          onClick={() =>
                            void removeFromAllowlist(row.email)
                          }
                        >
                          {removing === row.email
                            ? "Removing..."
                            : "Remove"}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {canManage ? (
                <form
                  className="panel-footer"
                  onSubmit={(event) => void addToAllowlist(event)}
                  style={{ display: "flex", gap: 8 }}
                >
                  <label className="sr-only" htmlFor="new-super-admin">
                    Email to add
                  </label>

                  <input
                    id="new-super-admin"
                    type="email"
                    className="input"
                    placeholder="someone@vitapstudent.ac.in"
                    value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)}
                    disabled={allowlistBusy}
                  />

                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={allowlistBusy || !newEmail.trim()}
                  >
                    {allowlistBusy && <span className="btn-spinner" />}
                    {allowlistBusy ? "Adding..." : "Add"}
                  </button>
                </form>
              ) : (
                <p className="help mt-4">
                  Only accounts already on this list can add or remove
                  others.
                </p>
              )}
            </>
          )}
        </section>

        <section className="panel mb-6">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Your account</h2>

              <p className="panel-subtitle">
                Set up an authenticator app, or verify it still works
              </p>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={setUpOwnTwoFactor}
            >
              <LockIcon size={14} />
              Set up / verify
            </button>
          </div>

          {notice && (
            <div className="panel-body">
              <div className="banner banner-success" role="status">
                <CheckIcon size={18} />
                <span>{notice}</span>
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Admins</h2>

              <p className="panel-subtitle">
                {loading
                  ? "Loading..."
                  : `${enrolledCount} of ${staff.length} have two-factor set up`}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="panel-body stack">
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line" />
            </div>
          ) : staff.length === 0 ? (
            <div className="empty">
              <p className="empty-title">No admins found</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">
                  Admin accounts and their two-factor status
                </caption>

                <thead>
                  <tr>
                    <th scope="col">Admin</th>
                    <th scope="col">Two-factor</th>
                    <th scope="col">Set up</th>
                  </tr>
                </thead>

                <tbody>
                  {staff.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <div className="row-title">
                          {person.name || "Unnamed"}
                        </div>

                        <div className="row-meta">{person.email}</div>
                      </td>

                      <td>
                        <span
                          className={`badge ${
                            person.enrolled
                              ? "badge-success"
                              : "badge-warning"
                          }`}
                        >
                          {person.enrolled ? "Enabled" : "Not set up"}
                        </span>
                      </td>

                      <td>
                        {person.enrolledAt
                          ? formatDateIst(person.enrolledAt, {
                              dateStyle: "medium",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
