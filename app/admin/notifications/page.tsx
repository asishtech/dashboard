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
  autoSend?: { enabled: boolean; enabledAt: string | null };
};

type Match = {
  id: number;
  registration_id: string;
  name: string | null;
  email: string;
  event_name: string | null;
  is_merch: boolean;
  last_sent_at: string | null;
  times_sent: number;
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

  /* Resend box. */
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  /* Armed per person, so ticking one row cannot send to another. */
  const [armed, setArmed] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);

  /* Test send. */
  const [testTo, setTestTo] = useState("");

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

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

    return data;
  }

  async function search() {
    if (searching) return;

    setSearching(true);
    setError("");
    setMessage("");
    setArmed(null);

    try {
      const data = await post({ action: "lookup", query });
      setMatches(data.matches ?? []);
    } catch (err) {
      setMatches(null);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function resend(match: Match) {
    if (busy) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await post({
        action: "resend",
        registrationDbId: match.id,
        confirm: true,
      });

      setMessage(`Sent another copy to ${match.email}.`);
      setArmed(null);

      await search();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resend failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (busy) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const data = await post({ action: "test", to: testTo });

      setMessage(
        `Test sent to ${data.to}. If it does not arrive within a minute, check the spam folder before changing anything.`
      );

      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Test send failed"
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleAutoSend(enabled: boolean) {
    if (busy) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await post({ action: "autoSend", enabled });

      setMessage(
        enabled
          ? "Automatic sending is on. Anyone who registers from now on is mailed after the next sync; the existing backlog is not."
          : "Automatic sending is off."
      );

      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save"
      );
    } finally {
      setBusy(false);
    }
  }

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


            {/* Test ------------------------------------------------- */}
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Send a test</h2>

                  <p className="panel-subtitle">
                    One message to any address. Touches nothing —
                    no registration is marked as sent to.
                  </p>
                </div>
              </div>

              <div className="panel-body">
                <div className="resend-search">
                  <label className="sr-only" htmlFor="test-to">
                    Address to send the test to
                  </label>

                  <input
                    id="test-to"
                    className="input"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={testTo}
                    disabled={busy}
                    onChange={(event) =>
                      setTestTo(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") sendTest();
                    }}
                  />

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={sendTest}
                    disabled={
                      busy ||
                      !queue.configured ||
                      !testTo.includes("@")
                    }
                  >
                    {busy && <span className="btn-spinner" />}
                    Send test
                  </button>
                </div>

                <p className="help mt-3">
                  {queue.configured
                    ? "Do this first. It proves the App Password works without spending any of the queue."
                    : "Set SMTP_USER and SMTP_PASSWORD, then redeploy."}
                </p>
              </div>
            </section>


            {/* Automatic sending ------------------------------------ */}
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">
                    Automatic sending
                  </h2>

                  <p className="panel-subtitle">
                    Off until you turn it on, so nothing goes out
                    while you are testing.
                  </p>
                </div>
              </div>

              <div className="panel-body">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={queue.autoSend?.enabled ?? false}
                    disabled={busy || !queue.configured}
                    onChange={(event) =>
                      toggleAutoSend(event.target.checked)
                    }
                  />

                  <span>
                    Mail people who register from now on
                  </span>
                </label>

                <p className="help mt-3">
                  {queue.autoSend?.enabled ? (
                    <>
                      On since{" "}
                      {queue.autoSend.enabledAt
                        ? new Date(
                            queue.autoSend.enabledAt
                          ).toLocaleString("en-IN")
                        : "just now"}
                      . Only registrations created after that moment
                      are sent automatically, up to 15 per sync. The{" "}
                      {queue.pendingConfirmations} already waiting are
                      not touched — those stay on the button above.
                    </>
                  ) : (
                    <>
                      While this is off, the only way an email leaves
                      is the Send button above. Turning it on does not
                      mail the {queue.pendingConfirmations} already
                      waiting; it only covers people who register
                      afterwards.
                    </>
                  )}
                </p>
              </div>
            </section>


            {/* Resend ----------------------------------------------- */}
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Send again</h2>

                  <p className="panel-subtitle">
                    For a pass that was deleted, or an address that has
                    since been corrected.
                  </p>
                </div>
              </div>

              <div className="panel-body">
                <div className="resend-search">
                  <label className="sr-only" htmlFor="resend-query">
                    Search by email, name or registration ID
                  </label>

                  <input
                    id="resend-query"
                    className="input"
                    placeholder="Email, name or registration ID"
                    value={query}
                    disabled={searching}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setMatches(null);
                      setArmed(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") search();
                    }}
                  />

                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={search}
                    disabled={searching || query.trim().length < 3}
                  >
                    {searching && <span className="btn-spinner" />}
                    {searching ? "Searching" : "Search"}
                  </button>
                </div>

                {matches?.length === 0 && (
                  <p className="help mt-4">
                    Nobody matches that. Only registrations with an
                    email address and a QR code can be sent to.
                  </p>
                )}

                {matches && matches.length > 0 && (
                  <div className="stack mt-4">
                    {matches.map((match) => (
                      <div className="resend-row" key={match.id}>
                        <div>
                          <div className="row-title">
                            {match.name || match.email}
                          </div>

                          <div className="row-meta">
                            {match.email}
                            {" · "}
                            {match.is_merch
                              ? "Merchandise"
                              : (match.event_name ?? "Event")}
                            {" · #"}
                            {match.registration_id}
                          </div>

                          <div className="row-meta">
                            {match.last_sent_at
                              ? `Last sent ${new Date(
                                  match.last_sent_at
                                ).toLocaleString("en-IN")} · ${
                                  match.times_sent
                                } time${
                                  match.times_sent === 1 ? "" : "s"
                                }`
                              : "Never sent"}
                          </div>
                        </div>

                        <div className="resend-actions">
                          {/*
                            Armed per row. A single page-level tick
                            would stay on after one resend and make
                            the next click, on a different person,
                            one press instead of two.
                          */}
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={armed === match.id}
                              disabled={busy}
                              onChange={(event) =>
                                setArmed(
                                  event.target.checked
                                    ? match.id
                                    : null
                                )
                              }
                            />

                            <span>
                              Send {match.last_sent_at
                                ? "another copy"
                                : "the pass"}
                            </span>
                          </label>

                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy || armed !== match.id}
                            onClick={() => resend(match)}
                          >
                            {busy && armed === match.id && (
                              <span className="btn-spinner" />
                            )}
                            Send now
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
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
