"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NavBar from "@/components/NavBar";
import { AlertIcon, CheckIcon, ScanIcon } from "@/components/icons";

type Item = {
  id: number;
  item: string;
  size: string | null;
  quantity: number;
  status: string;
};

type Registration = {
  registration_id: string;
  name: string;
  email: string;
  items: Item[];
  /* True when the QR belongs to an event booking with no merchandise. */
  isEventOnly?: boolean;
};

type Pass = {
  id: number;
  registration_id: string;
  name: string | null;
  email: string | null;
  event_id: string | null;
  event_name: string;
  event_day: string | null;
  event_venue: string | null;
  is_merch: boolean;
  entered_at: string | null;
};

/* Minimal surface of Html5Qrcode, so the import stays lazy. */
type Scanner = {
  start: (
    camera: string | { facingMode: string },
    config: { fps: number; qrbox: number | { width: number; height: number } },
    onSuccess: (text: string) => void,
    onFailure: (message: string) => void
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
  getState: () => number;
};

const READER_ID = "qr-reader";

/*
 * The volunteer screen is the scanner.
 *
 * It used to be a dashboard -- distribution counts, buyer totals, a
 * stock table -- with the scanner one tap away. None of that is a
 * volunteer's job at the counter, and the numbers were coming from
 * /api/dashboard, which also carries revenue. One task, one screen.
 */
export default function VolunteerPage() {
  const [registration, setRegistration] =
    useState<Registration | null>(null);

  const [pass, setPass] = useState<Pass | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [starting, setStarting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scanToken, setScanToken] = useState("");

  const scannerRef = useRef<Scanner | null>(null);
  const handlingRef = useRef(false);
  const mountedRef = useRef(true);

  /*
   * handleToken has to restart the camera after a bad code, and
   * startScanner needs handleToken as its success callback. Going
   * through a ref breaks that cycle instead of declaring one of them
   * before it exists.
   */
  const restartRef = useRef<() => void>(() => {});

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;

    if (!scanner) return;

    scannerRef.current = null;

    try {
      /* 2 === SCANNING. Stopping an already-stopped scanner throws. */
      if (scanner.getState() === 2) {
        await scanner.stop();
      }

      scanner.clear();
    } catch {
      /* Already torn down, or the element is gone. Nothing to do. */
    }
  }, []);

  const handleToken = useCallback(
    async (decodedText: string) => {
      /* One QR at a time; the camera fires this many times a second. */
      if (handlingRef.current) return;

      handlingRef.current = true;

      await stopScanner();

      try {
        /*
         * The QR encodes a claim URL, but a bare token is accepted
         * too -- a volunteer should not be stuck because a code was
         * generated slightly differently.
         */
        let token = decodedText.trim();

        if (/^https?:\/\//i.test(token)) {
          const parts = new URL(token).pathname.split("/");
          const index = parts.indexOf("claim");

          token = index >= 0 ? (parts[index + 1] ?? "") : "";
        }

        if (!token) {
          throw new Error("That is not a V-TAPP QR code");
        }

        setScanToken(token);

        /*
         * Ask what the pass is before deciding what to show. An event
         * booking carries no merchandise, and the old flow read that as
         * "nothing to distribute" -- a dead end where the answer should
         * have been a way to admit them.
         */
        const passResponse = await fetch(
          `/api/checkin?token=${encodeURIComponent(token)}`,
          { cache: "no-store" }
        );

        const passData = await passResponse.json();

        if (!passResponse.ok) {
          throw new Error(passData.error || "Invalid QR code");
        }

        if (!mountedRef.current) return;

        const scanned = passData.pass as Pass;

        setError("");
        setNotice("");
        setPass(scanned);

        /* Merchandise still needs its item list. */
        if (!scanned.is_merch) {
          setRegistration(null);
          return;
        }

        const response = await fetch(
          `/api/distribution/${encodeURIComponent(token)}`,
          { cache: "no-store" }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Invalid QR code");
        }

        if (!mountedRef.current) return;

        setRegistration({
          ...data.registration,
          isEventOnly: Boolean(data.isEventOnly),
        });
      } catch (err) {
        if (!mountedRef.current) return;

        setError(
          err instanceof Error ? err.message : "Invalid QR code"
        );

        /* A bad code should not end the shift. Let them try again. */
        handlingRef.current = false;
        restartRef.current();
      }
    },
    [stopScanner]
  );

  const startScanner = useCallback(async () => {
    setStarting(true);
    setError("");

    /*
     * getUserMedia only exists in a secure context. Served over plain
     * http from a laptop's LAN address -- which is exactly how someone
     * tests this on a phone -- the camera silently does not exist, and
     * the old UI just sat there. Say so instead.
     */
    if (
      typeof window !== "undefined" &&
      !window.isSecureContext &&
      window.location.hostname !== "localhost"
    ) {
      setStarting(false);
      setError(
        "The camera needs a secure connection. Open this page over https, not a plain http address."
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStarting(false);
      setError("This browser cannot open the camera.");
      return;
    }

    try {
      const { Html5Qrcode } = await import("html5-qrcode");

      if (!mountedRef.current) return;

      const scanner = new Html5Qrcode(READER_ID) as unknown as Scanner;

      scannerRef.current = scanner;

      const config = { fps: 10, qrbox: { width: 250, height: 250 } };

      /*
       * Rear camera, chosen for the volunteer rather than offered as a
       * dropdown -- they are pointing a phone at a printout, and it is
       * never the selfie camera.
       */
      try {
        await scanner.start(
          { facingMode: "environment" },
          config,
          handleToken,
          () => {
            /* Fires continuously while no code is in frame. */
          }
        );
      } catch {
        /*
         * Some laptops and older Androids reject the facingMode
         * constraint outright. Fall back to the last camera in the
         * list, which is the rear one on essentially every phone.
         */
        const cameras = await (
          Html5Qrcode as unknown as {
            getCameras: () => Promise<{ id: string }[]>;
          }
        ).getCameras();

        if (cameras.length === 0) {
          throw new Error("No camera found on this device");
        }

        await scanner.start(
          cameras[cameras.length - 1].id,
          config,
          handleToken,
          () => {}
        );
      }

      if (mountedRef.current) setStarting(false);
    } catch (err) {
      if (!mountedRef.current) return;

      setStarting(false);

      const message = err instanceof Error ? err.message : String(err);

      /*
       * The raw errors here are unreadable at a counter. Translate the
       * two that actually happen.
       */
      setError(
        /NotAllowedError|Permission/i.test(message)
          ? "Camera access was blocked. Allow the camera for this site in your browser settings, then reload."
          : /NotFoundError|No camera/i.test(message)
            ? "No camera found on this device."
            : `Could not start the camera. ${message}`
      );
    }
  }, [handleToken]);

  useEffect(() => {
    mountedRef.current = true;

    restartRef.current = () => {
      void startScanner();
    };

    /*
     * Deferred a tick rather than called inline: startScanner sets
     * state on its first line, and doing that synchronously inside an
     * effect triggers a cascading render. Same pattern the other
     * screens use for their initial load.
     */
    const timer = window.setTimeout(() => {
      void startScanner();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      mountedRef.current = false;
      void stopScanner();
    };
  }, [startScanner, stopScanner]);

  function scanAnother() {
    setRegistration(null);
    setPass(null);
    setError("");
    setNotice("");
    setScanToken("");
    handlingRef.current = false;
    void startScanner();
  }

  /*
   * Admitting someone is a press, not a side effect of pointing a
   * camera. A 409 means they are already inside, which is an answer to
   * show plainly rather than an error to apologise for.
   */
  async function markEntry() {
    if (busy || !scanToken) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: scanToken }),
      });

      const data = await response.json();

      if (response.ok) {
        setPass(data.pass ?? null);
        setNotice("Entry recorded.");
        return;
      }

      if (response.status === 409 && data.alreadyEntered) {
        setPass(data.pass ?? null);
        setNotice("Already checked in — this pass has been used.");
        return;
      }

      throw new Error(data.error || "Could not record entry");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not record entry"
      );
    } finally {
      setBusy(false);
    }
  }

  const formatTime = (value: string) =>
    new Date(value).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  async function markGiven(itemId: number) {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/distribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationItemId: itemId }),
      });

      const data = await response.json();

      /*
       * 409 means someone already handed it over. That is the correct
       * outcome, not an error to argue with.
       */
      if (response.ok || response.status === 409) {
        setRegistration((current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.id === itemId
                    ? { ...item, status: "GIVEN" }
                    : item
                ),
              }
            : current
        );

        return;
      }

      throw new Error(data.error || "Could not mark that item");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not mark that item"
      );
    } finally {
      setBusy(false);
    }
  }

  const allGiven =
    registration !== null &&
    registration.items.length > 0 &&
    registration.items.every((item) => item.status === "GIVEN");

  return (
    <main className="app">
      <NavBar />

      <div className="container container-narrow">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / Volunteer</span>

            <h1 className="page-title">Scan</h1>

            <p className="page-subtitle">
              Point the camera at the buyer&apos;s QR code.
            </p>
          </div>
        </header>


        {error && (
          <div className="banner banner-danger" role="alert">
            <AlertIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="banner banner-success" role="status">
            <CheckIcon size={18} />
            <span>{notice}</span>
          </div>
        )}


        {/* The reader element must stay mounted: html5-qrcode attaches
            the video stream to it by id, and unmounting it mid-scan is
            what produced the NotFoundError teardown races. */}
        <section
          className="panel"
          hidden={pass !== null || registration !== null}
        >
          <div className="panel-body">
            <div id={READER_ID} className="scanner" />

            {starting && (
              <p className="help mt-4" style={{ textAlign: "center" }}>
                Starting the camera...
              </p>
            )}

            {!starting && !error && (
              <p className="help mt-4" style={{ textAlign: "center" }}>
                <ScanIcon size={14} /> Ready
              </p>
            )}

            {error && (
              <button
                type="button"
                className="btn btn-primary btn-block mt-4"
                onClick={() => {
                  handlingRef.current = false;
                  void startScanner();
                }}
              >
                Try again
              </button>
            )}
          </div>
        </section>


        {pass && !pass.is_merch && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{pass.event_name}</h2>

                <p className="panel-subtitle">
                  {[pass.event_day, pass.event_venue]
                    .filter(Boolean)
                    .join(" · ") || "V-TAPP event"}
                </p>
              </div>

              <span
                className={`badge ${
                  pass.entered_at ? "badge-success" : "badge-warning"
                }`}
              >
                {pass.entered_at ? "Inside" : "Not yet in"}
              </span>
            </div>

            <div className="panel-body stack">
              <div className="scan-item">
                <div>
                  <div className="scan-item-name">
                    {pass.name ?? "Attendee"}
                  </div>

                  <div className="scan-item-meta">
                    {pass.email ?? "No email on record"}
                  </div>

                  <div className="mono dim text-sm mt-2">
                    #{pass.registration_id}
                  </div>
                </div>
              </div>

              {pass.entered_at ? (
                /* Deliberately not an error state. A second scan is a
                   normal thing to do; the answer is when they came in. */
                <div className="empty">
                  <div className="empty-icon">
                    <CheckIcon size={22} />
                  </div>

                  <p className="empty-title">Already checked in</p>

                  <p className="empty-body">
                    Admitted {formatTime(pass.entered_at)}. Each pass
                    admits one person, once.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  disabled={busy}
                  onClick={markEntry}
                >
                  {busy && <span className="btn-spinner" />}
                  {busy ? "Recording" : "Mark entry"}
                </button>
              )}
            </div>

            <div className="panel-footer">
              <button
                type="button"
                className="btn btn-block"
                onClick={scanAnother}
              >
                <ScanIcon size={16} />
                Scan next code
              </button>
            </div>
          </section>
        )}

        {registration && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{registration.name}</h2>

                <p className="panel-subtitle">{registration.email}</p>

                <p className="mono dim mt-2">
                  #{registration.registration_id}
                </p>
              </div>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={scanAnother}
              >
                Scan another
              </button>
            </div>

            {registration.items.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">
                  <CheckIcon size={22} />
                </div>

                <p className="empty-title">Checked in</p>

                <p className="empty-body">
                  {registration.isEventOnly
                    ? "This is an event booking, so there is nothing to hand over. The scan has been recorded."
                    : "No merchandise is attached to this registration."}
                </p>
              </div>
            ) : (
              <div className="panel-body stack-tight stack">
                {registration.items.map((item) => {
                  const given = item.status === "GIVEN";

                  return (
                    <div
                      key={item.id}
                      className={`scan-item${
                        given ? " scan-item-given" : ""
                      }`}
                    >
                      <div>
                        <div className="scan-item-name">{item.item}</div>

                        <div className="scan-item-meta">
                          {item.size ? `Size ${item.size}` : "One size"}
                          {item.quantity > 1
                            ? ` · Qty ${item.quantity}`
                            : ""}
                        </div>
                      </div>

                      {given ? (
                        <span className="badge badge-success">Given</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => markGiven(item.id)}
                          className="btn btn-primary btn-sm"
                        >
                          {busy && <span className="btn-spinner" />}
                          {busy ? "Saving" : "Mark as given"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/*
              Returning to the camera is a deliberate tap, not a timer.
              The old screen navigated away 700ms after the last item,
              which took the confirmation off the screen before the
              volunteer had finished handing the bag over.
            */}
            <div className="panel-footer">
              <button
                type="button"
                className="btn btn-block"
                onClick={scanAnother}
              >
                <ScanIcon size={16} />
                {allGiven ? "Done - scan the next code" : "Scan next code"}
              </button>
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
