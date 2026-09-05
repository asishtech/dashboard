"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowser } from "./supabase-browser";
import { usePoll } from "./use-poll";

/* Slow reconciliation pass while pushes are arriving. */
const LIVE_RECONCILE_MS = 20_000;

/* Carries the load on its own when realtime is unavailable. */
const FALLBACK_POLL_MS = 30_000;

export type RealtimeStatus = "connecting" | "live" | "off";

/*
 * Push updates straight from Postgres to the open dashboard.
 *
 * The dashboards used to depend on a 60s poll (and a manual Sync
 * button) to notice that a volunteer had handed something over.
 * Subscribing to the tables collapses that to the round-trip time
 * of a single websocket frame.
 *
 * Realtime is best-effort. It only delivers rows the caller is
 * allowed to SELECT under RLS, and it needs the tables added to the
 * `supabase_realtime` publication -- see
 * supabase/enable-realtime.sql. When it does not connect, the
 * returned status is "off" and the caller keeps polling instead, so
 * the dashboard degrades to exactly its previous behaviour rather
 * than silently going stale.
 */
export function useRealtime(
  tables: string[],
  onChange: () => void
): RealtimeStatus {
  const [status, setStatus] =
    useState<RealtimeStatus>("connecting");

  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  /*
   * `tables` is nearly always a fresh array literal, so depend on
   * its contents rather than its identity to avoid resubscribing
   * on every render.
   */
  const key = tables.join(",");

  useEffect(() => {
    const supabase = createSupabaseBrowser();

    const channel = supabase.channel(`dashboard:${key}`);

    /*
     * A single change often lands as several row events (a
     * registration plus its items). Coalesce them so the dashboard
     * refetches once rather than once per row.
     */
    let pending: number | null = null;

    const schedule = () => {
      if (pending !== null) {
        return;
      }

      pending = window.setTimeout(() => {
        pending = null;
        onChangeRef.current();
      }, 250);
    };

    for (const table of key.split(",")) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        schedule
      );
    }

    channel.subscribe((state) => {
      if (state === "SUBSCRIBED") {
        setStatus("live");
        return;
      }

      if (
        state === "CHANNEL_ERROR" ||
        state === "TIMED_OUT" ||
        state === "CLOSED"
      ) {
        setStatus("off");
      }
    });

    return () => {
      if (pending !== null) {
        window.clearTimeout(pending);
      }

      supabase.removeChannel(channel);
    };
  }, [key]);

  return status;
}

/*
 * Realtime with a polling safety net.
 *
 * This is what the dashboards actually use. When the subscription
 * is live, updates arrive by push and the poll drops back to a slow
 * reconciliation pass that catches anything a dropped frame missed.
 * When it is not live, the poll tightens up and carries the load on
 * its own.
 */
export function useLiveRefresh(
  tables: string[],
  refresh: () => void
): RealtimeStatus {
  const status = useRealtime(tables, refresh);

  usePoll(
    refresh,
    status === "live" ? LIVE_RECONCILE_MS : FALLBACK_POLL_MS
  );

  return status;
}
