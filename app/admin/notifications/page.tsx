"use client";

import { useCallback, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { AlertIcon } from "@/components/icons";

type Queue = {
  ready: boolean;
  reason?: string;
  configured: boolean;
  sender: string | null;
  batchSize: number;
  dailyCap: number;
  remainingToday: number;
  pendingConfirmations: number;
  /* Emails, not passes: one person is one message. Absent until
     supabase/person-passes.sql runs. */
  pendingPeople?: number;
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

/*
 * The search returns one row per registration; this is one row per
 * person, which is what a send actually is now. Grouped in the
 * browser rather than in SQL because the search already carries
 * everything needed and one fewer migration is one fewer thing to
 * run.
 */
type Person = {
  email: string;
  name: string | null;
  passes: number;
  lastSentAt: string | null;
  timesSent: number;
  what: string[];
};

function groupByPerson(matches: Match[]): Person[] {
  const people = new Map<string, Person>();

  for (const match of matches) {
    const key = match.email.trim().toLowerCase();

    const person = people.get(key) ?? {
      email: match.email.trim(),
      name: null,
      passes: 0,
      lastSentAt: null,
      timesSent: 0,
      what: [],
    };

    person.passes += 1;
    person.name = person.name ?? match.name;

    /* The most recent send across any of their passes. */
    if (
      match.last_sent_at &&
      (!person.lastSentAt || match.last_sent_at > person.lastSentAt)
    ) {
      person.lastSentAt = match.last_sent_at;
    }

    person.timesSent = Math.max(person.timesSent, match.times_sent);

    person.what.push(
      match.is_merch
        ? "Merchandise"
        : (match.event_name ?? "Event")
    );

    people.set(key, person);
  }

  return [...people.values()];
}

type Preview = {
  registration_id: string;
  email: string;
  subject: string;
};

/*
 * Read a response that might not be JSON.
 *
 * `await response.json()` on an HTML error page throws a parse error,
 * so a 404 from a stale service worker or a deploy in flight surfaced
 * as "Unexpected token '<'" -- which says nothing about what happened
 * and sent the reader looking in the wrong place entirely. Report the
 * status instead, and name the usual cause.
 */
async function readJson(response: Response) {
  const body = await response.text();

  let data: Record<string, unknown> = {};

  try {
    data = body ? JSON.parse(body) : {};
  } catch {
    if (response.status === 404) {
      throw new Error(
        "The mail endpoint returned 404. The server has it, so this is usually a stale service worker: hard-reload (Cmd/Ctrl+Shift+R), or unregister it under DevTools > Application > Service Workers."
      );
    }

    throw new Error(
      `The server returned ${response.status} and not JSON.`
    );
  }

  if (!response.ok) {
    throw new Error(
      (data.error as string) ||
        `Request failed (${response.status})`
    );
  }

  return data;
}

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
  const [armed, setArmed] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  /* Test send. */
  const [testTo, setTestTo] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", {
        cache: "no-store",
      });

      const data = await readJson(response);

      setQueue(data as unknown as Queue);
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

    return readJson(response);
  }

  async function search() {
    if (searching) return;

    setSearching(true);
    setError("");
    setMessage("");
    setArmed(null);

    try {
      const data = await post({ action: "lookup", query });
      setMatches((data.matches as Match[]) ?? []);
    } catch (err) {
      setMatches(null);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function resend(person: Person) {
    if (busy) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const data = await post({
        action: "resend",
        email: person.email,
        confirm: true,
      });

      setMessage(
        `Sent ${data.passes} pass${
          data.passes === 1 ? "" : "es"
        } to ${data.email} in one email.`
      );

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

  /* Nothing can be sent: either the migration or the credentials. */
  const blocked =
    !loading && queue !== null && (!queue.ready || !queue.configured);

  /* Emails, which is what the cap counts and the button sends. */
  const waiting =
    queue?.pendingPeople ?? queue?.pendingConfirmations ?? 0;

  const usedToday = queue
    ? queue.dailyCap - queue.remainingToday
    : 0;

  const usedPercent = queue?.dailyCap
    ? Math.min(100, (usedToday / queue.dailyCap) * 100)
    : 0;

  const capLevel =
    usedPercent >= 90
      ? "meter-fill-danger"
      : usedPercent >= 70
        ? "meter-fill-warning"
        : "meter-fill-success";

  /* How many of today's remaining allowance this press would use. */
  const nextBatch = Math.min(
    queue?.batchSize ?? 0,
    waiting,
    queue?.remainingToday ?? 0
  );

  return (
    <main className="app">
      <NavBar />

      <div className="container container-narrow">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / Mail</span>

            <h1 className="page-title">Passes</h1>

            <p className="page-subtitle">
              {queue?.sender
                ? `One email per person, sending as ${queue.sender}`
                : "One email per person, every pass in one PDF"}
            </p>
          </div>
        </header>

        {blocked && (
          <section className="panel mb-6">
            <div className="empty">
              <div className="empty-icon">
                <AlertIcon size={22} />
              </div>

              <p className="empty-title">Not ready to send</p>

              <p className="empty-body">
                {queue?.reason ??
                  "Set SMTP_USER and SMTP_PASSWORD in the environment, then redeploy. See docs/email-setup.md."}
              </p>
            </div>
          </section>
        )}

        {message && (
          <div className="banner banner-success mb-6" role="status">
            {message}
          </div>
        )}

        {error && (
          <div className="banner banner-danger mb-6" role="alert">
            {error}
          </div>
        )}

        {loading && (
          <section className="panel">
            <div className="panel-body stack">
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-card" />
            </div>
          </section>
        )}

        {!loading && queue?.ready && (
          <>
            {/*
              Today's allowance, first and largest.
              
              Everything else on this page is bounded by it: crossing
              Gmail's limit locks the account for 24 hours, so the
              number that decides whether you can act at all belongs
              above the actions rather than beside them.
            */}
            <section className="panel mb-6">
              <div className="panel-body">
                <div className="meter">
                  <div className="meter-head">
                    <span className="meter-label">
                      Today&apos;s allowance
                    </span>

                    <span className="meter-value">
                      {usedToday} of {queue.dailyCap}
                    </span>
                  </div>

                  <div
                    className="meter-track"
                    role="progressbar"
                    aria-valuenow={Math.round(usedPercent)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Daily sending allowance used"
                  >
                    <div
                      className={`meter-fill ${capLevel}`}
                      style={{ width: `${usedPercent}%` }}
                    />
                  </div>

                  <div className="meter-foot">
                    <span>{queue.remainingToday} left today</span>

                    <span>
                      {waiting === 0
                        ? "Queue empty"
                        : `${Math.ceil(
                            waiting / Math.max(queue.dailyCap, 1)
                          )} more day${
                            Math.ceil(
                              waiting / Math.max(queue.dailyCap, 1)
                            ) === 1
                              ? ""
                              : "s"
                          } at this cap`}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="stat-grid mb-6">
              <div className="stat stat-feature">
                <span className="stat-label">Waiting</span>

                <strong className="stat-value">{waiting}</strong>

                <span className="stat-meta">
                  emails ·{" "}
                  {queue.pendingConfirmations} passes
                </span>
              </div>

              <div className="stat">
                <span className="stat-label">Sent</span>

                <strong className="stat-value stat-success">
                  {queue.sentConfirmations}
                </strong>

                <span className="stat-meta">
                  {queue.lastSentAt
                    ? `Last ${new Date(
                        queue.lastSentAt
                      ).toLocaleString("en-IN")}`
                    : "None yet"}
                </span>
              </div>

              <div className="stat">
                <span className="stat-label">Failed</span>

                <strong
                  className={`stat-value ${
                    queue.failedLast24h > 0 ? "stat-danger" : ""
                  }`}
                >
                  {queue.failedLast24h}
                </strong>

                <span className="stat-meta">
                  Last 24h · they stay in the queue
                </span>
              </div>
            </section>

            {/* 1 ---------------------------------------------------- */}
            <section className="panel mb-6">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">
                    <span className="step">1</span> Send yourself a
                    test
                  </h2>

                  <p className="panel-subtitle">
                    Proves the password works. Reads no
                    registrations, marks nobody as sent to.
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
                      if (event.key === "Enter") void sendTest();
                    }}
                  />

                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => void sendTest()}
                    disabled={busy || !testTo.includes("@")}
                  >
                    {busy && <span className="btn-spinner" />}
                    Send test
                  </button>
                </div>
              </div>
            </section>

            {/* 2 ---------------------------------------------------- */}
            <section className="panel mb-6">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">
                    <span className="step">2</span> Send to one person
                  </h2>

                  <p className="panel-subtitle">
                    Their first copy or another one. Everything they
                    hold goes in a single PDF.
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
                      if (event.key === "Enter") void search();
                    }}
                  />

                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => void search()}
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
                    {groupByPerson(matches).map((person) => (
                      <div
                        className="resend-row"
                        key={person.email.toLowerCase()}
                      >
                        <div>
                          <div className="row-title">
                            {person.name || person.email}
                          </div>

                          <div className="row-meta">
                            {person.email} · {person.passes} pass
                            {person.passes === 1 ? "" : "es"}
                          </div>

                          {/* What is in the PDF, so the sender can
                              see they have the right person. */}
                          <div className="row-meta">
                            {person.what.slice(0, 3).join(" · ")}
                            {person.what.length > 3 &&
                              ` · +${person.what.length - 3} more`}
                          </div>

                          <div className="row-meta">
                            {person.lastSentAt
                              ? `Last sent ${new Date(
                                  person.lastSentAt
                                ).toLocaleString("en-IN")}`
                              : "Never sent"}
                          </div>
                        </div>

                        <div className="resend-actions">
                          {/* Armed per person: a page-level tick
                              would stay on and make the next click,
                              on somebody else, one press not two. */}
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={armed === person.email}
                              disabled={busy}
                              onChange={(event) =>
                                setArmed(
                                  event.target.checked
                                    ? person.email
                                    : null
                                )
                              }
                            />

                            <span>
                              Send{" "}
                              {person.lastSentAt
                                ? "again"
                                : person.passes === 1
                                  ? "the pass"
                                  : `all ${person.passes}`}
                            </span>
                          </label>

                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy || armed !== person.email}
                            onClick={() => void resend(person)}
                          >
                            {busy && armed === person.email && (
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

            {/* 3 ---------------------------------------------------- */}
            <section className="panel mb-6">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">
                    <span className="step">3</span> Send the queue
                  </h2>

                  <p className="panel-subtitle">
                    {waiting} email{waiting === 1 ? "" : "s"} waiting,
                    {" "}
                    {queue.batchSize} at a time. Preview first — this
                    cannot be recalled.
                  </p>
                </div>
              </div>

              <div className="panel-body">
                <div className="resend-search">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => void run(true)}
                    disabled={busy || waiting === 0}
                  >
                    {busy && <span className="btn-spinner" />}
                    Preview next {Math.min(queue.batchSize, waiting)}
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy || nextBatch === 0}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Send ${nextBatch} email${
                            nextBatch === 1 ? "" : "s"
                          } now? Each carries every pass that person holds. This cannot be undone.`
                        )
                      ) {
                        void run(false);
                      }
                    }}
                  >
                    Send {nextBatch} now
                  </button>
                </div>

                {waiting === 0 && (
                  <p className="help mt-4">
                    Everyone with an email address and a QR code has
                    been sent their passes.
                  </p>
                )}

                {waiting > 0 && queue.remainingToday === 0 && (
                  <p className="help mt-4">
                    The daily limit is used up. Sending resumes as the
                    24-hour window rolls forward.
                  </p>
                )}
              </div>
            </section>

            {/* Preview, right under the button that produced it. */}
            {preview && (
              <section className="panel mb-6">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Next batch</h2>

                    <p className="panel-subtitle">
                      {preview.length} email
                      {preview.length === 1 ? "" : "s"}. Nothing has
                      been sent.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPreview(null)}
                  >
                    Hide
                  </button>
                </div>

                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">To</th>
                        <th scope="col">Carrying</th>
                      </tr>
                    </thead>

                    <tbody>
                      {preview.map((row) => (
                        <tr key={row.email}>
                          <td>
                            <div className="row-title">
                              {row.email}
                            </div>
                          </td>
                          <td>
                            <div className="row-meta">
                              {row.registration_id}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* 4 ---------------------------------------------------- */}
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">
                    <span className="step">4</span> Automatic sending
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
                    disabled={busy}
                    onChange={(event) =>
                      void toggleAutoSend(event.target.checked)
                    }
                  />

                  <span>Mail people who register from now on</span>
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
                      {waiting} already waiting are not touched —
                      those stay on the button above.
                    </>
                  ) : (
                    <>
                      While this is off, the only way an email leaves
                      is the buttons above. Turning it on does not
                      mail the {waiting} already waiting; it only
                      covers people who register afterwards.
                    </>
                  )}
                </p>
              </div>
            </section>
          </>
        )}

      </div>
    </main>
  );
}
