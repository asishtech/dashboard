"use client";

import { useEffect, useRef } from "react";

/*
 * Run `callback` on an interval, but only while the tab is
 * actually being looked at.
 *
 * A backgrounded dashboard used to keep polling forever, so every
 * tab a volunteer or admin left open kept hitting the API (and
 * therefore the database) all day. Hidden tabs now stop entirely
 * and refresh once on the way back, so what the user sees when
 * they return is still current.
 */
export function usePoll(
  callback: () => void,
  intervalMs: number,
  enabled = true
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let timer: number | null = null;

    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    const start = () => {
      stop();
      timer = window.setInterval(
        () => callbackRef.current(),
        intervalMs
      );
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        callbackRef.current();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") {
      start();
    }

    document.addEventListener(
      "visibilitychange",
      onVisibilityChange
    );

    return () => {
      stop();
      document.removeEventListener(
        "visibilitychange",
        onVisibilityChange
      );
    };
  }, [intervalMs, enabled]);
}
