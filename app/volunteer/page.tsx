"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { useLiveRefresh } from "@/lib/use-realtime";
import RoleSwitcher from "@/components/RoleSwitcher";
import { BoxIcon, ScanIcon } from "@/components/icons";

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

const LIVE_TABLES = [
  "registrations",
  "registration_items",
  "distributions",
  "inventory",
];

export default function VolunteerPage() {
  const [data, setData] =
    useState<DashboardData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const loadDashboard = useCallback(
    async (
      mode: "initial" | "silent" | "manual" = "manual"
    ) => {
      try {
        /*
         * The first load leaves the state alone: `loading`
         * already starts true, and setting it again from the
         * mount effect forces an extra render pass.
         */
        if (mode === "silent") {
          setRefreshing(true);
        } else if (mode === "manual") {
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
    const timer = window.setTimeout(() => {
      loadDashboard("initial");
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadDashboard]);

  /*
   * Live updates. The volunteer screen is the one that most needs
   * to be current: two people scanning at the same counter must see
   * each other's handovers immediately.
   */
  const live = useLiveRefresh(
    LIVE_TABLES,
    useCallback(
      () => loadDashboard("silent"),
      [loadDashboard]
    )
  );

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
    <main className="app">
      <div className="container">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">
              V-TAPP / 2026
            </span>

            <h1 className="page-title">
              Volunteer Operations
            </h1>

            <p className="page-subtitle">
              Merchandise distribution control
            </p>
          </div>

          <div className="header-actions">
            <span
              className={`pulse${
                live === "live" ? "" : " pulse-idle"
              }`}
            >
              {live === "live" ? "Live" : "Polling"}
            </span>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => loadDashboard("silent")}
              disabled={refreshing}
            >
              {refreshing && <span className="btn-spinner" />}
              {refreshing ? "Refreshing" : "Refresh"}
            </button>

            <Link href="/admin" className="btn btn-ghost btn-sm">
              Admin
            </Link>

            <RoleSwitcher />

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={logout}
            >
              Sign out
            </button>
          </div>
        </header>


        {/* Primary action. One per screen. */}
        <Link
          href="/volunteer/scan"
          className="card-link card-link-feature mb-8"
        >
          <div className="row-between">
            <div>
              <span className="eyebrow eyebrow-accent">
                Distribution action
              </span>

              <div className="page-title mt-2">Scan QR</div>

              <p className="card-link-body">
                Open the camera and hand merchandise over.
              </p>
            </div>

            <ScanIcon size={34} />
          </div>
        </Link>


        {/* Distribution progress */}
        <section className="panel mb-8">
          <div className="panel-body">
            <div className="meter">
              <div className="meter-head">
                <span className="meter-label">
                  Distribution progress
                </span>

                <span className="meter-value">
                  {loading ? "—" : `${percentage}%`}
                </span>
              </div>

              <div
                className="meter-track"
                role="progressbar"
                aria-valuenow={percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Items distributed"
              >
                <div
                  className="meter-fill"
                  style={{ width: `${percentage}%` }}
                />
              </div>

              <div className="meter-foot">
                <span>{given} given</span>
                <span>{total} total</span>
              </div>
            </div>

            <div className="split">
              <div className="split-item">
                <span className="stat-label">Given</span>

                <strong className="split-value stat-success">
                  {loading ? "—" : given}
                </strong>

                <span className="stat-meta">
                  Items distributed
                </span>
              </div>

              <div className="split-item">
                <span className="stat-label">Pending</span>

                <strong className="split-value stat-warning">
                  {loading ? "—" : pending}
                </strong>

                <span className="stat-meta">
                  Awaiting distribution
                </span>
              </div>
            </div>
          </div>
        </section>


        {/* Totals */}
        <section className="stat-grid">
          <div className="stat">
            <span className="stat-label">Total items</span>

            <strong className="stat-value">
              {loading ? "—" : total}
            </strong>

            <span className="stat-meta">Current allocation</span>
          </div>

          <div className="stat">
            <span className="stat-label">Buyers</span>

            <strong className="stat-value">
              {loading ? "—" : data?.registrations ?? 0}
            </strong>

            <span className="stat-meta">
              Completed registrations
            </span>
          </div>
        </section>


        {/* Inventory */}
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Inventory</h2>

              <p className="panel-subtitle">
                Remaining stock by item
              </p>
            </div>

            <Link
              href="/admin/inventory"
              className="btn btn-ghost btn-sm"
            >
              View all
            </Link>
          </div>

          <div className="panel-body stack">
            {loading ? (
              [1, 2, 3, 4, 5].map((item) => (
                <div key={item}>
                  <div className="skeleton skeleton-line" />
                  <div className="skeleton meter-track" />
                </div>
              ))
            ) : inventory.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">
                  <BoxIcon size={22} />
                </div>

                <p className="empty-title">No inventory yet</p>

                <p className="empty-body">
                  Stock appears here once items are configured.
                </p>
              </div>
            ) : (
              inventory.map((item) => {
                const remainingPercent = Math.max(
                  0,
                  Math.min(
                    100,
                    Number(item.remaining_percentage ?? 0)
                  )
                );

                const level =
                  remainingPercent <= 15
                    ? "meter-fill-danger"
                    : remainingPercent <= 40
                      ? "meter-fill-warning"
                      : "meter-fill-success";

                return (
                  <div className="meter" key={item.id}>
                    <div className="meter-head">
                      <span className="meter-label">
                        {item.item}
                      </span>

                      <span className="meter-value">
                        {item.remaining} / {item.initial_stock}
                      </span>
                    </div>

                    <div
                      className="meter-track"
                      role="progressbar"
                      aria-valuenow={remainingPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${item.item} stock remaining`}
                    >
                      <div
                        className={`meter-fill ${level}`}
                        style={{ width: `${remainingPercent}%` }}
                      />
                    </div>

                    <div className="meter-foot">
                      <span>{item.sold} sold</span>
                      <span>{remainingPercent}% left</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

      </div>
    </main>
  );
}
