"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertIcon, CheckIcon } from "@/components/icons";
import RoleSwitcher from "@/components/RoleSwitcher";

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

export default function ScannerPage() {
  const router = useRouter();

  const [registration, setRegistration] =
    useState<Registration | null>(null);

  const [error, setError] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const scannerRef =
    useRef<{
      clear: () => Promise<void>;
    } | null>(null);

  const clearingRef =
    useRef(false);

  const mountedRef =
    useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function start() {
      try {
        const {
          Html5QrcodeScanner,
        } = await import(
          "html5-qrcode"
        );

        if (!mountedRef.current) {
          return;
        }

        const scanner =
          new Html5QrcodeScanner(
            "qr-reader",
            {
              fps: 10,
              qrbox: {
                width: 280,
                height: 280,
              },
            },
            false
          );

        scannerRef.current =
          scanner;

        scanner.render(
          async (
            decodedText: string
          ) => {
            /*
             * Prevent the same QR from being
             * processed multiple times.
             */
            if (
              clearingRef.current
            ) {
              return;
            }

            clearingRef.current =
              true;

            try {
              /*
               * Stop the scanner safely.
               *
               * html5-qrcode can throw
               * NotFoundError when clear()
               * races with React cleanup.
               */
              try {
                await scanner.clear();
              } catch (clearError) {
                console.warn(
                  "QR scanner already cleared:",
                  clearError
                );
              }

              if (
                scannerRef.current ===
                scanner
              ) {
                scannerRef.current =
                  null;
              }

              /*
               * Extract token from QR URL.
               */
              const url =
                new URL(
                  decodedText
                );

              const parts =
                url.pathname.split(
                  "/"
                );

              const tokenIndex =
                parts.indexOf(
                  "claim"
                );

              const token =
                tokenIndex >= 0
                  ? parts[
                      tokenIndex + 1
                    ]
                  : null;

              if (!token) {
                throw new Error(
                  "Invalid V-TAPP QR code"
                );
              }

              /*
               * Fetch registration.
               */
              const response =
                await fetch(
                  `/api/distribution/${token}`,
                  {
                    cache:
                      "no-store",
                  }
                );

              const data =
                await response.json();

              if (!response.ok) {
                throw new Error(
                  data.error ||
                    "Invalid QR"
                );
              }

              if (
                mountedRef.current
              ) {
                setError("");
                setRegistration({
                  ...data.registration,
                  isEventOnly: Boolean(data.isEventOnly),
                });
              }

            } catch (err) {
              if (
                mountedRef.current
              ) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Invalid QR"
                );
              }
            }
          },
          () => {}
        );

      } catch (err) {
        if (
          mountedRef.current
        ) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to start QR scanner"
          );
        }
      }
    }

    start();

    return () => {
      mountedRef.current =
        false;

      const scanner =
        scannerRef.current;

      scannerRef.current =
        null;

      if (!scanner) {
        return;
      }

      /*
       * Cleanup is deliberately
       * fire-and-forget.
       *
       * Do not await clear() during
       * React unmount.
       */
      Promise.resolve(
        scanner.clear()
      ).catch(() => {
        // Scanner may already be cleared.
      });
    };
  }, []);


  async function resetScanner() {
    setRegistration(null);
    setError("");
    setBusy(false);

    /*
     * Give React a moment to remove the
     * previous scanner DOM before starting
     * html5-qrcode again.
     */
    setTimeout(() => {
      window.location.reload();
    }, 50);
  }

  async function markGiven(
    itemId: number
  ) {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        "/api/distribution",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            registrationItemId:
              itemId,
          }),
        }
      );

      const data =
        await response.json();

      /*
       * 409 means the item was already
       * distributed. Treat it as GIVEN,
       * not as an application error.
       */
      if (response.status === 409) {
        setRegistration(
          (current) => {
            if (!current) return current;

            return {
              ...current,
              items:
                current.items.map(
                  (item) =>
                    item.id === itemId
                      ? {
                          ...item,
                          status:
                            "GIVEN",
                        }
                      : item
                ),
            };
          }
        );

        setTimeout(() => {
          router.push("/volunteer");
          router.refresh();
        }, 700);

        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to mark item"
        );
      }

      /*
       * API returns the refreshed
       * registration. This immediately
       * changes the item to GIVEN.
       */
      if (data.registration) {
        setRegistration(
          data.registration
        );
      } else {
        setRegistration(
          (current) => {
            if (!current) return current;

            return {
              ...current,
              items:
                current.items.map(
                  (item) =>
                    item.id === itemId
                      ? {
                          ...item,
                          status:
                            "GIVEN",
                        }
                      : item
                ),
            };
          }
        );
      }

      /*
       * Give the volunteer a moment to
       * see the green GIVEN state.
       */
      setTimeout(() => {
        router.push("/volunteer");
        router.refresh();
      }, 700);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to distribute"
      );
    } finally {
      setBusy(false);
    }
  }


  return (
    <main className="app">
      <div className="container container-narrow">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">
              Volunteer / Scanner
            </span>

            <h1 className="page-title">QR Scanner</h1>

            <p className="page-subtitle">
              Scan a buyer&apos;s code to hand merchandise over.
            </p>
          </div>

          <div className="header-actions">
            <Link href="/volunteer" className="btn btn-ghost btn-sm">
              Back to dashboard
            </Link>

            <RoleSwitcher />
          </div>
        </header>


        {error && (
          <div className="banner banner-danger" role="alert">
            <AlertIcon size={18} />
            <span>{error}</span>
          </div>
        )}


        {!registration && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Scan buyer QR</h2>

                <p className="panel-subtitle">
                  Point the camera at the code on the buyer&apos;s
                  phone or printout.
                </p>
              </div>
            </div>

            <div className="panel-body">
              <div id="qr-reader" className="scanner" />
            </div>
          </section>
        )}


        {registration && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">
                  {registration.name}
                </h2>

                <p className="panel-subtitle">
                  {registration.email}
                </p>

                <p className="mono dim mt-2">
                  #{registration.registration_id}
                </p>
              </div>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={resetScanner}
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
                    ? "This is an event booking, so there is no merchandise to hand over. The scan has been recorded."
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
                      <div className="scan-item-name">
                        {item.item}
                      </div>

                      <div className="scan-item-meta">
                        {item.size ? `Size ${item.size}` : "One size"}
                        {item.quantity > 1
                          ? ` · Qty ${item.quantity}`
                          : ""}
                      </div>
                    </div>

                    {given ? (
                      <span className="badge badge-success">
                        Given
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => markGiven(item.id)}
                        className="btn btn-primary btn-sm"
                      >
                        {busy && <span className="btn-spinner" />}
                        {busy ? "Updating" : "Mark as given"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </section>
        )}

      </div>
    </main>
  );
}
