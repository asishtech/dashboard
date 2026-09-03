"use client";

import { useCallback, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { AlertIcon, CheckIcon, InboxIcon } from "@/components/icons";

type Queue = {
  ready: boolean;
  reason?: string;
  configured: boolean;
  sender: string | null;
  batchSize: number;
  dailyCap: number;
  remainingToday: number;
  pendingConfirmations: number;
  sentConfirmations: number;
  sentCollections: number;
  failedLast24h: number;
  sentLast24h: number;
  lastSentAt: string | null;
};

type Preview = {
  registration_id: string;
  email: string;
  subject: string;
};

/*
 * Sending is a press, never a schedule.
 *
 * Several hundred emails to real students cannot be recalled, so this
 * screen exists to make the decision explicit: see the queue, preview
 * exactly who is next, then send one batch.
 */
export default function NotificationsPage() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to read the mail queue");
      }

      setQueue(data);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to read the queue"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function run(dryRun: boolean) {
    if (busy) return;

    setBusy(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Send failed");
      }

      if (dryRun) {
        setPreview(data.recipients ?? []);
        setMessage(
          data.wouldSend === 0
            ? "Nothing is waiting to be sent."
            : `${data.wouldSend} message${
                data.wouldSend === 1 ? "" : "s"
              } would go out. Nothing has been sent.`
        );

        return;
      }

      setPreview(null);
      setMessage(
        `Sent ${data.sent} of ${data.attempted}.${
          data.failed > 0 ? ` ${data.failed} failed.` : ""
        }`
      );

      if (data.errors?.length) {
        setError(
          data.errors
            .map((e: { email: string; error: string }) =>
              `${e.email}: ${e.error}`
            )
            .join(" · ")
        );
      }

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  const blocked =
    !loading && queue !== null && (!queue.ready || !queue.configured);

  return (
    <main className="app">
      <NavBar />

      <div className="container container-narrow">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / Mail</span>

            <h1 className="page-title">Notifications</h1>

            <p className="page-subtitle">
              {queue?.sender
                ? `Sending as ${queue.sender}`
                : "Registration passes and collection receipts"}
            </p>
          </div>
        </header>


        {error && (
          <div className="banner banner-danger" role="alert">
            <AlertIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="banner banner-success" role="status">
            <CheckIcon size={18} />
            <span>{message}</span>
          </div>
        )}


        {blocked && (
          <section className="panel">
            <div className="empty">
              <div className="empty-icon">
                <AlertIcon size={22} />
              </div>

              <p className="empty-title">Not ready to send</p>

              <p className="empty-body">
                {queue?.reason ??
                  "Set SMTP_USER and SMTP_PASSWORD in the environment, then reload. See docs/email-setup.md."}
              </p>
            </div>
          </section>
        )}


        {!loading && queue?.ready && (
          <>
            <section className="stat-grid">
              <div className="stat stat-feature">
                <span className="stat-label">Waiting</span>

                <strong className="stat-value">
                  {queue.pendingConfirmations}
                </strong>

                <span className="stat-meta">
                  Passes not yet emailed
                </span>
              </div>

              <div className="stat">
                <span className="stat-label">Sent</span>

                <strong className="stat-value stat-success">
                  {queue.sentConfirmations}
                </strong>

                <span className="stat-meta">
                  {queue.sentCollections} collection receipt
                  {queue.sentCollections === 1 ? "" : "s"}
                </span>
              </div>

              <div className="stat">
                <span className="stat-label">Left today</span>

                <strong className="stat-value">
                  {queue.remainingToday}
                </strong>

                {/* Gmail's cap is per rolling 24 hours, and crossing it
                    locks the account out for a day. */}
                <span className="stat-meta">
                  {queue.sentLast24h} of {queue.dailyCap} used
                </span>
              </div>

              {queue.failedLast24h > 0 && (
                <div className="stat">
                  <span className="stat-label">Failed</span>

                  <strong className="stat-value stat-warning">
                    {queue.failedLast24h}
                  </strong>

                  <span className="stat-meta">
                    In the last 24 hours
                  </span>
                </div>
              )}
            </section>


            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Send a batch</h2>

                  <p className="panel-subtitle">
                    Up to {queue.batchSize} at a time. Preview first —
                    email cannot be recalled.
                  </p>
                </div>
              </div>

              <div className="panel-body">
                <div className="header-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy || queue.pendingConfirmations === 0}
                    onClick={() => run(true)}
                  >
                    {busy && <span className="btn-spinner" />}
                    Preview next batch
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={
                      busy ||
                      queue.pendingConfirmations === 0 ||
                      queue.remainingToday === 0
                    }
                    onClick={() => {
                      if (
                        window.confirm(
                          `Send up to ${queue.batchSize} emails now? This cannot be undone.`
                        )
                      ) {
                        void run(false);
                      }
                    }}
                  >
                    {busy && <span className="btn-spinner" />}
                    Send {Math.min(
                      queue.batchSize,
                      queue.pendingConfirmations
                    )}{" "}
                    now
                  </button>
                </div>

                {queue.pendingConfirmations === 0 && (
                  <p className="help mt-4">
                    Everyone with an email address has their pass.
                  </p>
                )}

                {queue.remainingToday === 0 &&
                  queue.pendingConfirmations > 0 && (
                    <p className="help mt-4">
                      The daily limit is used up. Sending resumes as the
                      24-hour window rolls forward.
                    </p>
                  )}
              </div>
            </section>


            {preview && (
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Next batch</h2>

                    <p className="panel-subtitle">
                      Nothing here has been sent.
                    </p>
                  </div>

                  <span className="badge badge-plain">
                    {preview.length}
                  </span>
                </div>

                {preview.length === 0 ? (
                  <div className="empty">
                    <div className="empty-icon">
                      <InboxIcon size={22} />
                    </div>

                    <p className="empty-title">Queue is empty</p>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <caption className="sr-only">
                        Recipients in the next batch
                      </caption>

                      <thead>
                        <tr>
                          <th scope="col">Registration</th>
                          <th scope="col">Recipient</th>
                          <th scope="col">Subject</th>
                        </tr>
                      </thead>

                      <tbody>
                        {preview.map((row) => (
                          <tr key={row.registration_id}>
                            <td className="mono">
                              #{row.registration_id}
                            </td>

                            <td>{row.email}</td>

                            <td className="dim">{row.subject}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}

      </div>
    </main>
  );
}
