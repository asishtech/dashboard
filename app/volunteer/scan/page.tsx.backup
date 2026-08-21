"use client";

import { useEffect, useState } from "react";
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


  useEffect(() => {

    let scanner: any;

    async function start() {

      const {
        Html5QrcodeScanner
      } = await import(
        "html5-qrcode"
      );

      scanner =
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


      scanner.render(
        async (
          decodedText: string
        ) => {

          await scanner.clear();

          try {

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

            const response =
              await fetch(
                `/api/distribution/${token}`
              );

            const data =
              await response.json();

            if (!response.ok) {
              throw new Error(
                data.error ||
                  "Invalid QR"
              );
            }

            setRegistration(
              data.registration
            );

          } catch (err) {

            setError(
              err instanceof Error
                ? err.message
                : "Invalid QR"
            );

          }

        },
        () => {}
      );
    }

    start();

    return () => {

      try {
        scanner?.clear();
      } catch {}

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
            ⚠️ {error}
          </div>

        )}


        {!registration && (

          <section className="sales-panel">

            <div
              id="qr-reader"
              style={{
                maxWidth:
                  "500px",
                margin:
                  "0 auto",
              }}
            />

          </section>

        )}


        {registration && (

          <section className="sales-panel">

            <h2>
              {registration.name}
            </h2>

            <p>
              {registration.email}
            </p>

            <p>
              Registration #
              {registration.registration_id}
            </p>


            <div
              style={{
                marginTop:
                  "25px",
              }}
            >

              {registration.items.map(
                item => (

                  <div
                    key={
                      item.id
                    }
                    style={{
                      padding:
                        "18px",
                      border:
                        "1px solid #e5e7eb",
                      borderRadius:
                        "12px",
                      marginBottom:
                        "12px",
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      alignItems:
                        "center",
                    }}
                  >

                    <div>

                      <strong>
                        {item.item}
                      </strong>

                      {item.size && (
                        <div>
                          Size:{" "}
                          {item.size}
                        </div>
                      )}

                    </div>


                    {item.status ===
                    "GIVEN" ? (

                      <span className="type-badge single">
                        ✓ GIVEN
                      </span>

                    ) : (

                      <button
                        className="save-button"
                        disabled={
                          busy
                        }
                        onClick={() =>
                          markGiven(
                            item.id
                          )
                        }
                      >
                        MARK GIVEN
                      </button>

                    )}

                  </div>

                )
              )}

            </div>


            <button
              className="admin-link"
              style={{
                marginTop:
                  "15px",
                border:
                  "none",
                cursor:
                  "pointer",
              }}
              onClick={() =>
                window.location.reload()
              }
            >
              Scan Another QR
            </button>

          </section>

        )}

      </div>

    </main>
  );
}
