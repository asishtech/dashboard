"use client";

import { useCallback, useEffect, useState } from "react";
import {
  flushQueue,
  loadPasses,
  queuedEntries,
  savePasses,
  type CachedPass,
} from "@/lib/offline";

/*
 * Registers the service worker, keeps the offline pass list fresh, and
 * says out loud what the app is doing about a missing network.
 *
 * A volunteer needs to know three things without asking: whether they
 * are online, whether anything is waiting to be sent, and whether the
 * pass list on this device is recent enough to trust.
 */
export default function OfflineBar() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [passCount, setPassCount] = useState(0);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refreshLocal = useCallback(() => {
    setPending(queuedEntries().length);

    const { at, passes } = loadPasses();

    setPassCount(passes.length);
    setCachedAt(at);
  }, []);

  /* Pull the pass list down while there is a connection to do it. */
  const refreshPasses = useCallback(async () => {
    try {
      const response = await fetch("/api/checkin/manifest", {
        cache: "no-store",
      });

      if (!response.ok) return;

      const data = await response.json();

      savePasses((data.passes ?? []) as CachedPass[]);
      refreshLocal();
    } catch {
      /* No signal. The copy already on the device still stands. */
    }
  }, [refreshLocal]);

  const sync = useCallback(async () => {
    if (syncing) return;

    setSyncing(true);

    try {
      const result = await flushQueue();

      if (result.sent > 0) await refreshPasses();

      refreshLocal();
    } finally {
      setSyncing(false);
    }
  }, [syncing, refreshPasses, refreshLocal]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js").catch(() => {
          /* Unsupported or blocked; the app works, just not offline. */
        });
      } else {
        /*
         * Never in development. Dev asset URLs are not content-hashed,
         * so a cached one goes stale and no amount of restarting the
         * server shifts it -- an afternoon lost to a stylesheet that
         * would not update. Also tears down anything registered
         * earlier, so a machine that has hit this heals itself.
         */
        void navigator.serviceWorker
          .getRegistrations()
          .then((regs) => Promise.all(regs.map((r) => r.unregister())));

        void caches
          ?.keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((k) => k.startsWith("vtapp-"))
                .map((k) => caches.delete(k))
            )
          );
      }
    }

    /*
     * Deferred a tick: setting state on the first line of an effect
     * causes a cascading render, and the codebase already uses this
     * pattern for its initial loads.
     */
    const timer = window.setTimeout(() => {
      setOnline(navigator.onLine);
      refreshLocal();

      if (navigator.onLine) {
        void refreshPasses();
        void sync();
      }
    }, 0);

    const goOnline = () => {
      setOnline(true);
      void sync();
    };

    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    /*
     * Flushing only on the online event is not enough: a phone that
     * regains signal without firing one, or a tab restored from the
     * background, would sit on a queue indefinitely.
     */
    const poll = window.setInterval(() => {
      setOnline(navigator.onLine);

      if (navigator.onLine && queuedEntries().length > 0) void sync();
    }, 20_000);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Silent when online with nothing waiting -- the normal case. */
  if (online && pending === 0) return null;

  return (
    <div
      className={`offline-bar${online ? " offline-bar-syncing" : ""}`}
      role="status"
      aria-live="polite"
    >
      {online ? (
        <span>
          {syncing ? "Sending" : "Waiting to send"} {pending} check-in
          {pending === 1 ? "" : "s"}
        </span>
      ) : (
        <span>
          Offline
          {pending > 0 ? ` · ${pending} check-in${pending === 1 ? "" : "s"} saved` : ""}
          {passCount > 0
            ? ` · ${passCount} passes on this device`
            : " · no passes cached"}
        </span>
      )}

      {online && pending > 0 && (
        <button
          type="button"
          className="link-button"
          onClick={() => void sync()}
          disabled={syncing}
        >
          Send now
        </button>
      )}

      {!online && cachedAt && (
        <span className="dim">
          list from{" "}
          {new Date(cachedAt).toLocaleString("en-IN", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </span>
      )}
    </div>
  );
}
