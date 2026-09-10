"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { useStepUp } from "@/lib/use-step-up";
import { AlertIcon, CheckIcon, LockIcon } from "@/components/icons";
import type { StaffTwoFactor } from "@/app/api/admin/security/route";

export default function SecurityPage() {
  const [staff, setStaff] = useState<StaffTwoFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
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
              Required for inventory changes and for granting or
              editing admin and coordinator access
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
                          ? new Date(
                              person.enrolledAt
                            ).toLocaleDateString("en-IN", {
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
