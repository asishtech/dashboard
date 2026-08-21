"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import LogoutButton from "@/components/LogoutButton";

type Item = {
  id: number;
  item: string;
  size: string | null;
  quantity: number;
  status: string;
};

type Registration = {
  id: number;
  registration_id: string;
  name: string | null;
  email: string | null;
  ticket: string | null;
  qr_token: string;
  items: Item[];
};

export default function BuyerPage() {

  const [user, setUser] =
    useState<any>(null);

  const [registrations, setRegistrations] =
    useState<Registration[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");


  useEffect(() => {

    async function load() {

      try {

        const supabase =
          createSupabaseBrowser();

        const {
          data: {
            user,
          },
        } =
          await supabase.auth.getUser();

        if (!user) {

          window.location.href =
            "/login";

          return;
        }

        setUser(user);


        const response =
          await fetch(
            "/api/buyer",
            {
              cache: "no-store",
            }
          );

        const data =
          await response.json();

        if (!response.ok) {

          throw new Error(
            data.error ||
              "Unable to load orders"
          );

        }

        setRegistrations(
          data.registrations ?? []
        );

      } catch (err) {

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load orders"
        );

      } finally {

        setLoading(false);

      }

    }

    load();

  }, []);


  return (

    <main className="dashboard">

      <div className="container">

        <header className="header">

          <div>

            <h1>
              My Merchandise
            </h1>

            <p>
              Your V-TAPP merchandise
              orders
            </p>

          </div>

          <LogoutButton />

        </header>


        {user && (

          <div
            className="sales-panel"
            style={{
              marginBottom: "20px",
            }}
          >

            <strong>
              {user.email}
            </strong>

          </div>

        )}


        {error && (

          <div className="error-banner">
            ⚠️ {error}
          </div>

        )}


        {loading ? (

          <section className="sales-panel">

            <p>
              Loading your orders...
            </p>

          </section>

        ) : registrations.length === 0 ? (

          <section className="sales-panel">

            <h2>
              No merchandise found
            </h2>

            <p className="panel-subtitle">
              We couldn't find any V-TAPP
              merchandise associated with
              your Google account.
            </p>

          </section>

        ) : (

          registrations.map(
            registration => (

              <section
                className="sales-panel"
                key={
                  registration.id
                }
                style={{
                  marginBottom:
                    "20px",
                }}
              >

                <div
                  style={{
                    display:
                      "flex",
                    justifyContent:
                      "space-between",
                    alignItems:
                      "center",
                    gap: "20px",
                    flexWrap:
                      "wrap",
                  }}
                >

                  <div>

                    <h2>
                      Registration #
                      {
                        registration.registration_id
                      }
                    </h2>

                    <p className="panel-subtitle">
                      {
                        registration.ticket ??
                        "Merchandise"
                      }
                    </p>

                  </div>


                  <Link
                    href={`/claim/${registration.qr_token}`}
                    className="qr-button"
                  >
                    View QR
                  </Link>

                </div>


                <div
                  style={{
                    marginTop:
                      "20px",
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
                            "16px",
                          border:
                            "1px solid #e5e7eb",
                          borderRadius:
                            "10px",
                          marginBottom:
                            "10px",
                          display:
                            "flex",
                          justifyContent:
                            "space-between",
                          alignItems:
                            "center",
                          gap:
                            "15px",
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
                                marginTop:
                                  "4px",
                              }}
                            >
                              Size:{" "}
                              {item.size}
                            </div>

                          )}

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

                        </div>


                        <span
                          className={
                            item.status ===
                            "GIVEN"
                              ? "type-badge single"
                              : "type-badge combo"
                          }
                        >
                          {item.status ===
                          "GIVEN"
                            ? "✓ GIVEN"
                            : "PENDING"}
                        </span>

                      </div>

                    )
                  )}

                </div>

              </section>

            )
          )

        )}

      </div>

    </main>
  );
}
