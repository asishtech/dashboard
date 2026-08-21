"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

type InventoryItem = {
  id: number;
  item: string;
  initial_stock: number;
  sold: number;
  remaining: number;
  remaining_percentage: number;
};

type DashboardData = {
  registrations: number;
  distribution: {
    given: number;
    pending: number;
    total: number;
  };
  inventory: InventoryItem[];
};

export default function VolunteerPage() {
  const [data, setData] =
    useState<DashboardData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const loadDashboard = useCallback(
    async (silent = false) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const response = await fetch(
          "/api/dashboard",
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(
            "Unable to load dashboard"
          );
        }

        const result =
          await response.json();

        setData({
          registrations:
            Number(
              result.registrations ?? 0
            ),

          distribution: {
            given: Number(
              result.distribution?.given ?? 0
            ),

            pending: Number(
              result.distribution?.pending ?? 0
            ),

            total: Number(
              result.distribution?.total ?? 0
            ),
          },

          inventory:
            result.inventory ?? [],
        });
      } catch (error) {
        console.error(
          "Volunteer dashboard error:",
          error
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadDashboard();

    const interval = setInterval(
      () => loadDashboard(true),
      30000
    );

    return () => clearInterval(interval);
  }, [loadDashboard]);

  async function logout() {
    const supabase =
      createSupabaseBrowser();

    await supabase.auth.signOut();

    window.location.href = "/login";
  }

  const given =
    data?.distribution.given ?? 0;

  const pending =
    data?.distribution.pending ?? 0;

  const total =
    data?.distribution.total ??
    given + pending;

  const percentage =
    total > 0
      ? Math.round(
          (given / total) * 100
        )
      : 0;

  const inventory =
    data?.inventory ?? [];

  return (
    <main className="volunteer-shell">

      <div className="volunteer-container">

        {/* =================================================
            HEADER
        ================================================= */}

        <header className="volunteer-header">

          <div>
            <div className="volunteer-kicker">
              V-TAPP / 2026
            </div>

            <h1>
              VOLUNTEER OPERATIONS
            </h1>

            <p>
              Merchandise distribution control
            </p>
          </div>

          <div className="volunteer-header-actions">

            <button
              className="volunteer-small-button"
              onClick={() =>
                loadDashboard(true)
              }
              disabled={refreshing}
            >
              {refreshing
                ? "LOADING"
                : "REFRESH"}
            </button>

            <Link
              href="/admin"
              className="volunteer-small-button"
            >
              ADMIN
            </Link>

            <button
              className="volunteer-logout"
              onClick={logout}
            >
              Logout
            </button>

          </div>

        </header>


        {/* =================================================
            DISTRIBUTION STATUS
        ================================================= */}

        <section className="distribution-hero">

          <div className="distribution-top">

            <div className="distribution-main">

              <div className="distribution-label">
                DISTRIBUTION STATUS
              </div>

              <div className="distribution-percent">
                {loading ? "—" : `${percentage}%`}
              </div>

              <div className="distribution-progress-label">
                DISTRIBUTION PROGRESS
              </div>

              <div className="distribution-track">
                <div
                  className="distribution-fill"
                  style={{
                    width: `${percentage}%`,
                  }}
                />
              </div>

              <div className="distribution-track-footer">
                <span>
                  {given} GIVEN
                </span>

                <span>
                  {total} TOTAL
                </span>
              </div>

            </div>


            <div className="distribution-numbers">

              <div>
                <span>GIVEN</span>
                <strong className="given-number">
                  {loading ? "—" : given}
                </strong>
              </div>

              <div>
                <span>PENDING</span>
                <strong className="pending-number">
                  {loading ? "—" : pending}
                </strong>
              </div>

            </div>

          </div>

        </section>


        {/* =================================================
            SCAN ACTION
        ================================================= */}

        <Link
          href="/volunteer/scan"
          className="scan-action"
        >

          <div>
            <div className="scan-action-label">
              DISTRIBUTION ACTION
            </div>

            <div className="scan-action-title">
              SCAN QR
            </div>
          </div>

          <div className="scan-arrow">
            →
          </div>

        </Link>


        {/* =================================================
            STATS
        ================================================= */}

        <section className="volunteer-stats">

          <div className="volunteer-stat">
            <span>PENDING</span>

            <strong className="pending-number">
              {loading ? "—" : pending}
            </strong>

            <small>
              Items awaiting distribution
            </small>
          </div>


          <div className="volunteer-stat">
            <span>GIVEN</span>

            <strong className="given-number">
              {loading ? "—" : given}
            </strong>

            <small>
              Items successfully distributed
            </small>
          </div>


          <div className="volunteer-stat">
            <span>TOTAL</span>

            <strong>
              {loading ? "—" : total}
            </strong>

            <small>
              Current allocation
            </small>
          </div>


          <div className="volunteer-stat">
            <span>BUYERS</span>

            <strong>
              {loading
                ? "—"
                : data?.registrations ?? 0}
            </strong>

            <small>
              Completed registrations
            </small>
          </div>

        </section>


        {/* =================================================
            INVENTORY
        ================================================= */}

        <section className="volunteer-inventory">

          <div className="volunteer-section-heading">

            <div>
              <span>
                01
              </span>

              <h2>
                INVENTORY
              </h2>
            </div>

            <Link
              href="/admin/inventory"
            >
              VIEW →
            </Link>

          </div>


          <div className="volunteer-inventory-list">

            {loading ? (

              [1, 2, 3, 4, 5].map(
                (item) => (
                  <div
                    className="volunteer-inventory-card"
                    key={item}
                  >
                    <div className="inventory-loading" />
                  </div>
                )
              )

            ) : (

              inventory.map(
                (item) => {

                  const percentage =
                    Math.max(
                      0,
                      Math.min(
                        100,
                        Number(
                          item.remaining_percentage ??
                            0
                        )
                      )
                    );

                  return (
                    <div
                      className="volunteer-inventory-card"
                      key={item.id}
                    >

                      <div className="inventory-card-top">

                        <div>
                          <h3>
                            {item.item}
                          </h3>

                          <span>
                            SOLD /{" "}
                            {item.initial_stock}
                          </span>
                        </div>

                        <strong>
                          {item.remaining}
                        </strong>

                      </div>


                      <div className="inventory-progress">

                        <div
                          className="inventory-progress-fill"
                          style={{
                            width: `${percentage}%`,
                          }}
                        />

                      </div>

                    </div>
                  );
                }
              )

            )}

          </div>

        </section>

      </div>

    </main>
  );
}
