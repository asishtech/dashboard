"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

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
};

export default function ScannerPage() {
  const [registration, setRegistration] =
    useState<Registration | null>(null);

  const [error, setError] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const scannerRef =
    useRef<any>(null);

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
                setRegistration(
                  data.registration
                );
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


  async function markGiven(
    itemId: number
  ) {
    setBusy(true);
    setError("");

    try {
      const response =
        await fetch(
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

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to mark item"
        );
      }

      setRegistration(
        data.registration
      );

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


  function resetScanner() {
    setRegistration(null);
    setError("");
    clearingRef.current =
      false;

    window.location.reload();
  }


  return (
    <main className="dashboard">
      <div className="container">

        <header className="header">

          <div>
            <h1>
              QR Scanner
            </h1>

            <p>
              Merchandise distribution
            </p>
          </div>

          <Link
            href="/volunteer"
            className="admin-link"
          >
            ← Volunteer
          </Link>

        </header>


        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}


        {!registration && (
          <section className="sales-panel">

            <h2>
              Scan Buyer QR
            </h2>

            <p className="panel-subtitle">
              Scan the QR code provided to
              the buyer.
            </p>

            <div
              id="qr-reader"
              style={{
                width: "100%",
                maxWidth: "500px",
                margin:
                  "24px auto 0",
              }}
            />

          </section>
        )}


        {registration && (
          <section className="sales-panel">

            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems: "flex-start",
                gap: "20px",
                flexWrap: "wrap",
              }}
            >

              <div>
                <h2>
                  {registration.name}
                </h2>

                <p
                  className="panel-subtitle"
                >
                  {registration.email}
                </p>

                <p
                  className="panel-subtitle"
                >
                  Registration:{" "}
                  {
                    registration.registration_id
                  }
                </p>
              </div>

              <button
                type="button"
                className="admin-link"
                onClick={
                  resetScanner
                }
              >
                Scan Another
              </button>

            </div>


            <div
              style={{
                marginTop: "28px",
              }}
            >

              <h3>
                Merchandise
              </h3>


              {registration.items.map(
                (item) => {

                  const given =
                    item.status ===
                    "GIVEN";

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        justifyContent:
                          "space-between",
                        alignItems:
                          "center",
                        gap: "16px",
                        padding:
                          "16px 0",
                        borderBottom:
                          "1px solid #e5e7eb",
                        flexWrap:
                          "wrap",
                      }}
                    >

                      <div>

                        <strong>
                          {item.item}
                        </strong>

                        {item.size && (
                          <div
                            style={{
                              color:
                                "#64748b",
                              fontSize:
                                "13px",
                              marginTop:
                                "4px",
                            }}
                          >
                            Size:{" "}
                            {item.size}
                          </div>
                        )}

                        {item.quantity >
                          1 && (
                          <div
                            style={{
                              color:
                                "#64748b",
                              fontSize:
                                "13px",
                              marginTop:
                                "4px",
                            }}
                          >
                            Quantity:{" "}
                            {item.quantity}
                          </div>
                        )}

                      </div>


                      {given ? (

                        <span
                          className="type-badge single"
                        >
                          GIVEN
                        </span>

                      ) : (

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            markGiven(
                              item.id
                            )
                          }
                          className="qr-button"
                        >
                          {busy
                            ? "Updating..."
                            : "Mark as Given"}
                        </button>

                      )}

                    </div>
                  );
                }
              )}

            </div>

          </section>
        )}

      </div>
    </main>
  );
}
