/*
 * Working without a network.
 *
 * A gate has a queue in front of it. Waiting for a request that will
 * not complete is not an option, and neither is turning somebody away
 * because a hall has no signal. So a scan resolves against a list
 * downloaded in advance, an admission is written down locally, and the
 * two are reconciled when the signal comes back.
 *
 * localStorage rather than IndexedDB on purpose: the queue is a few
 * hundred short records at most, and a synchronous store cannot lose a
 * write to a transaction that never settles because the browser was
 * backgrounded mid-scan.
 */

const PASSES_KEY = "vtapp.passes.v1";
const QUEUE_KEY = "vtapp.checkin-queue.v1";

export type CachedPass = {
  id: number;
  token: string;
  registration_id: string;
  name: string | null;
  event_id: string | null;
  event_name: string;
  event_day: string | null;
  event_venue: string | null;
  is_merch: boolean;
  entered_at: string | null;
};

export type QueuedEntry = {
  token: string;
  /* When the volunteer actually admitted them, not when it synced. */
  at: string;
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    /* Corrupt or full. An unusable cache must not break the page. */
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Quota exceeded; the app still works online. */
  }
}

/* -- The pass list, downloaded while there is a connection. -------- */

export function savePasses(passes: CachedPass[]) {
  write(PASSES_KEY, { at: new Date().toISOString(), passes });
}

export function loadPasses(): {
  at: string | null;
  passes: CachedPass[];
} {
  const stored = read<{ at: string; passes: CachedPass[] }>(
    PASSES_KEY,
    { at: "", passes: [] }
  );

  return { at: stored.at || null, passes: stored.passes ?? [] };
}

export function findPass(token: string): CachedPass | null {
  return (
    loadPasses().passes.find((pass) => pass.token === token) ?? null
  );
}

/* -- The queue of admissions waiting to reach the server. ---------- */

export function queuedEntries(): QueuedEntry[] {
  return read<QueuedEntry[]>(QUEUE_KEY, []);
}

export function queueEntry(token: string) {
  const queue = queuedEntries();

  /* One entry per pass here too, or a double tap sends two. */
  if (queue.some((entry) => entry.token === token)) return queue;

  const next = [...queue, { token, at: new Date().toISOString() }];

  write(QUEUE_KEY, next);

  /*
   * Reflected into the cached pass immediately, so a second scan of
   * the same code says "already checked in" while still offline
   * rather than admitting them twice.
   */
  const { at, passes } = loadPasses();

  savePasses(
    passes.map((pass) =>
      pass.token === token
        ? { ...pass, entered_at: new Date().toISOString() }
        : pass
    )
  );

  void at;

  return next;
}

export function isQueued(token: string) {
  return queuedEntries().some((entry) => entry.token === token);
}

/*
 * Send everything waiting.
 *
 * A 409 means the server already has them -- someone else scanned the
 * same pass, or this entry synced before and the response was lost.
 * That is success, not failure: drop it. Anything else stays queued so
 * a flaky connection cannot silently discard an admission.
 */
export async function flushQueue(): Promise<{
  sent: number;
  failed: number;
}> {
  const queue = queuedEntries();

  if (queue.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;

  const remaining: QueuedEntry[] = [];

  for (const entry of queue) {
    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: entry.token, at: entry.at }),
      });

      if (response.ok || response.status === 409) {
        sent += 1;
      } else if (response.status >= 400 && response.status < 500) {
        /*
         * A 403 or 404 will never succeed on retry -- wrong event, or
         * a code that is not ours. Keeping it would block the queue
         * forever.
         */
        sent += 1;
      } else {
        remaining.push(entry);
      }
    } catch {
      remaining.push(entry);
    }
  }

  write(QUEUE_KEY, remaining);

  return { sent, failed: remaining.length };
}

export function clearOfflineData() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(PASSES_KEY);
  window.localStorage.removeItem(QUEUE_KEY);
}
