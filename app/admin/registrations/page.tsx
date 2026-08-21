"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import LogoutButton from "@/components/LogoutButton";

type RegistrationItem = {
  id: number;
  item: string;
  size: string | null;
  quantity: number;
  status?: string;
};

type Registration = {
  registration_id: string;
  name: string;
  email: string;
  total?: number | null;
  items?: RegistrationItem[];
};

export default function RegistrationsPage() {
  const [registrations, setRegistrations] =
    useState<Registration[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [search, setSearch] =
    useState("");

  const [filter, setFilter] =
    useState<
      "ALL" | "GIVEN" | "PENDING"
    >("ALL");

  const [error, setError] =
    useState("");

  const loadRegistrations =
    useCallback(
      async (
        showLoading = false
      ) => {
        if (showLoading) {
          setRefreshing(true);
        }

        try {
          setError("");

          const response =
            await fetch(
              "/api/registrations",
              {
                cache: "no-store",
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.error ||
                "Failed to load registrations"
            );
          }

          setRegistrations(
            data.data ?? []
          );
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load registrations"
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      []
    );

  useEffect(() => {
    loadRegistrations();

    const interval =
      window.setInterval(() => {
        loadRegistrations();
      }, 60000);

    return () =>
      window.clearInterval(
        interval
      );
  }, [loadRegistrations]);

  const getRegistrationStatus =
    (registration: Registration) => {
      const items =
        registration.items ?? [];

      if (!items.length) {
        return "PENDING";
      }

      const total = items.reduce(
        (sum, item) =>
          sum +
          Number(
            item.quantity ?? 1
          ),
        0
      );

      const given = items.reduce(
        (sum, item) =>
          sum +
          (item.status === "GIVEN"
            ? Number(
                item.quantity ?? 1
              )
            : 0),
        0
      );

      return given >= total
        ? "GIVEN"
        : "PENDING";
    };

  const filtered =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return registrations.filter(
        (registration) => {
          const status =
            getRegistrationStatus(
              registration
            );

          const matchesFilter =
            filter === "ALL" ||
            status === filter;

          if (!matchesFilter) {
            return false;
          }

          if (!query) {
            return true;
          }

          return [
            registration.name,
            registration.email,
            registration.registration_id,
          ]
            .filter(Boolean)
            .some((value) =>
              value
                .toLowerCase()
                .includes(query)
            );
        }
      );
    }, [
      registrations,
      search,
      filter,
    ]);

  const stats = useMemo(() => {
    let revenue = 0;
    let given = 0;
    let pending = 0;

    for (const registration of registrations) {
      revenue += Number(
        registration.total ?? 0
      );

      const status =
        getRegistrationStatus(
          registration
        );

      if (status === "GIVEN") {
        given++;
      } else {
        pending++;
      }
    }

    return {
      buyers:
        registrations.length,
      revenue,
      given,
      pending,
    };
  }, [registrations]);

  const formatAmount = (
    amount: number
  ) =>
    new Intl.NumberFormat(
      "en-IN",
      {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }
    ).format(amount);

  return (
    <main className="dashboard">
      <div className="container">

        {/* HEADER */}

        <header className="header">

          <div>

            <div
              style={{
                color:
                  "var(--vt-orange-bright)",
                fontFamily:
                  '"SFMono-Regular", Consolas, monospace',
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: ".16em",
              }}
            >
              [03] / REGISTRATION CONTROL
            </div>

            <h1>
              Buyer Registrations
            </h1>

            <p>
              Purchases, merchandise
              and distribution records
            </p>

          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >

            <button
              type="button"
              onClick={() =>
                loadRegistrations(
                  true
                )
              }
              disabled={refreshing}
              className="admin-link"
              style={{
                cursor: refreshing
                  ? "wait"
                  : "pointer",
              }}
            >
              {refreshing
                ? "Refreshing..."
                : "Force Refresh"}
            </button>

            <Link
              href="/admin"
              className="admin-link"
            >
              Dashboard
            </Link>

            <Link
              href="/admin/inventory"
              className="admin-link"
            >
              Inventory
            </Link>

            <LogoutButton />

          </div>

        </header>


        {/* SYSTEM STATUS */}

        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "24px",
            padding: "11px 14px",
            border:
              "1px solid var(--vt-border)",
            background:
              "var(--vt-surface)",
          }}
        >

          <span
            style={{
              color:
                "var(--vt-orange-bright)",
              fontFamily:
                '"SFMono-Regular", Consolas, monospace',
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: ".12em",
            }}
          >
            ● REGISTRATION DATABASE ONLINE
          </span>

          <span
            style={{
              color:
                "var(--vt-muted)",
              fontFamily:
                '"SFMono-Regular", Consolas, monospace',
              fontSize: "9px",
            }}
          >
            {filtered.length} /{" "}
            {registrations.length} RECORDS
          </span>

        </div>


        {/* OVERVIEW */}

        <section>

          <SectionLabel
            number="01"
            title="Registration Overview"
          />

          <section className="stats">

            <RegistrationStat
              title="Total Buyers"
              value={
                loading
                  ? "—"
                  : stats.buyers
              }
              subtitle="Completed registrations"
            />

            <RegistrationStat
              title="Revenue"
              value={
                loading
                  ? "—"
                  : formatAmount(
                      stats.revenue
                    )
              }
              subtitle="Recorded sales"
            />

            <RegistrationStat
              title="Distributed"
              value={
                loading
                  ? "—"
                  : stats.given
              }
              subtitle="Completed handovers"
            />

            <RegistrationStat
              title="Pending"
              value={
                loading
                  ? "—"
                  : stats.pending
              }
              subtitle="Awaiting distribution"
            />

          </section>

        </section>


        {/* SEARCH */}

        <section
          className="inventory-panel"
          style={{
            marginTop: "30px",
          }}
        >

          <div
            className="section-header"
          >

            <div>

              <SectionLabel
                number="02"
                title="Registration Index"
              />

              <span>
                Search and filter buyer
                records
              </span>

            </div>

          </div>


          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(240px, 1fr) auto",
              gap: "10px",
              marginBottom: "20px",
            }}
          >

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="SEARCH NAME / EMAIL / REGISTRATION ID"
              style={{
                width: "100%",
                height: "42px",
                padding:
                  "0 13px",
                background:
                  "#080a0c",
                color:
                  "var(--vt-white)",
                border:
                  "1px solid var(--vt-border)",
                borderRadius: 0,
                outline: "none",
                fontFamily:
                  '"SFMono-Regular", Consolas, monospace',
                fontSize: "9px",
                letterSpacing:
                  ".04em",
              }}
            />


            <div
              style={{
                display: "flex",
                gap: "1px",
                background:
                  "var(--vt-border)",
              }}
            >

              {(
                [
                  "ALL",
                  "GIVEN",
                  "PENDING",
                ] as const
              ).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setFilter(value)
                  }
                  style={{
                    minWidth: "90px",
                    border: 0,
                    borderRadius: 0,
                    background:
                      filter === value
                        ? "var(--vt-orange)"
                        : "var(--vt-surface-2)",
                    color:
                      filter === value
                        ? "#080706"
                        : "var(--vt-muted)",
                    fontFamily:
                      '"SFMono-Regular", Consolas, monospace',
                    fontSize: "9px",
                    fontWeight: 800,
                    letterSpacing:
                      ".08em",
                    cursor:
                      "pointer",
                  }}
                >
                  {value}
                </button>
              ))}

            </div>

          </div>


          {/* TABLE */}

          {error && (
            <div
              style={{
                padding:
                  "14px",
                border:
                  "1px solid var(--vt-red)",
                color:
                  "var(--vt-red)",
                background:
                  "rgba(220,98,98,.06)",
                fontFamily:
                  '"SFMono-Regular", Consolas, monospace',
                fontSize: "10px",
              }}
            >
              {error}
            </div>
          )}


          {loading ? (
            <LoadingRows />
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding:
                  "60px 20px",
                textAlign:
                  "center",
                border:
                  "1px solid var(--vt-border)",
                color:
                  "var(--vt-muted)",
                fontFamily:
                  '"SFMono-Regular", Consolas, monospace',
                fontSize: "10px",
                letterSpacing:
                  ".08em",
              }}
            >
              NO REGISTRATION RECORDS
              FOUND
            </div>
          ) : (
            <div
              style={{
                overflowX:
                  "auto",
              }}
            >

              <div
                style={{
                  minWidth:
                    "900px",
                  border:
                    "1px solid var(--vt-border)",
                }}
              >

                <div
                  className="registration-row registration-header"
                >
                  <span>Buyer</span>
                  <span>Registration</span>
                  <span>Merchandise</span>
                  <span>Amount</span>
                  <span>Status</span>
                </div>


                {filtered.map(
                  (registration) => {

                    const status =
                      getRegistrationStatus(
                        registration
                      );

                    const items =
                      registration.items ??
                      [];

                    const itemCount =
                      items.reduce(
                        (
                          sum,
                          item
                        ) =>
                          sum +
                          Number(
                            item.quantity ??
                              1
                          ),
                        0
                      );

                    return (
                      <Link
                        href={`/admin/registrations/${encodeURIComponent(
                          registration.registration_id
                        )}`}
                        className="registration-row"
                        key={
                          registration.registration_id
                        }
                        style={{
                          textDecoration: "none",
                          color: "inherit",
                          cursor: "pointer",
                        }}
                      >

                        {/* BUYER */}

                        <div>
                          <strong
                            style={{
                              display:
                                "block",
                              color:
                                "var(--vt-white)",
                              fontSize:
                                "12px",
                              fontWeight:
                                600,
                            }}
                          >
                            {
                              registration.name
                            }
                          </strong>

                          <span
                            style={{
                              display:
                                "block",
                              marginTop:
                                "5px",
                              color:
                                "var(--vt-muted)",
                              fontFamily:
                                '"SFMono-Regular", Consolas, monospace',
                              fontSize:
                                "8px",
                            }}
                          >
                            {
                              registration.email
                            }
                          </span>
                        </div>


                        {/* ID */}

                        <div>
                          <span
                            style={{
                              color:
                                "var(--vt-orange-light)",
                              fontFamily:
                                '"SFMono-Regular", Consolas, monospace',
                              fontSize:
                                "9px",
                              fontWeight:
                                700,
                            }}
                          >
                            {
                              registration.registration_id
                            }
                          </span>
                        </div>


                        {/* MERCHANDISE */}

                        <div>

                          <strong
                            style={{
                              display:
                                "block",
                              color:
                                "var(--vt-white)",
                              fontFamily:
                                '"SFMono-Regular", Consolas, monospace',
                              fontSize:
                                "12px",
                            }}
                          >
                            {itemCount}
                          </strong>

                          <span
                            style={{
                              color:
                                "var(--vt-muted)",
                              fontSize:
                                "8px",
                            }}
                          >
                            items
                          </span>

                        </div>


                        {/* AMOUNT */}

                        <div>
                          <strong
                            style={{
                              color:
                                "var(--vt-white)",
                              fontFamily:
                                '"SFMono-Regular", Consolas, monospace',
                              fontSize:
                                "12px",
                            }}
                          >
                            {formatAmount(
                              Number(
                                registration.total ??
                                  0
                              )
                            )}
                          </strong>
                        </div>


                        {/* STATUS */}

                        <div>

                          <span
                            style={{
                              display:
                                "inline-flex",
                              alignItems:
                                "center",
                              minWidth:
                                "72px",
                              justifyContent:
                                "center",
                              padding:
                                "7px 8px",
                              border:
                                `1px solid ${
                                  status ===
                                  "GIVEN"
                                    ? "var(--vt-green)"
                                    : "var(--vt-yellow)"
                                }`,
                              color:
                                status ===
                                "GIVEN"
                                  ? "var(--vt-green)"
                                  : "var(--vt-yellow)",
                              background:
                                "transparent",
                              fontFamily:
                                '"SFMono-Regular", Consolas, monospace',
                              fontSize:
                                "8px",
                              fontWeight:
                                800,
                              letterSpacing:
                                ".08em",
                            }}
                          >
                            {status}
                          </span>

                        </div>

                      </Link>
                    );
                  }
                )}

              </div>

            </div>
          )}

        </section>


        {/* MERCHANDISE BREAKDOWN */}

        {!loading &&
          filtered.length > 0 && (
            <section
              style={{
                marginTop: "30px",
              }}
            >

              <SectionLabel
                number="03"
                title="Merchandise Breakdown"
              />

              <div
                className="inventory-grid"
              >

                {getMerchandiseSummary(
                  filtered
                ).map((item) => (
                  <div
                    className="inventory-card"
                    key={item.name}
                  >

                    <div
                      className="inventory-card-header"
                    >

                      <div>
                        <h3>
                          {item.name}
                        </h3>

                        <span>
                          {item.orders} orders
                        </span>
                      </div>

                      <div
                        className="stock-number"
                      >
                        {item.quantity}
                      </div>

                    </div>

                    <div
                      className="inventory-label"
                    >
                      units ordered
                    </div>

                    <div
                      className="inventory-footer"
                    >
                      <span>
                        {item.orders} buyers
                      </span>

                      <strong>
                        {formatAmount(
                          item.revenue
                        )}
                      </strong>
                    </div>

                  </div>
                ))}

              </div>

            </section>
          )}


        {/* FOOTER */}

        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            gap: "15px",
            flexWrap: "wrap",
            marginTop: "28px",
            paddingTop: "15px",
            borderTop:
              "1px solid var(--vt-border-soft)",
            color:
              "var(--vt-dim)",
            fontFamily:
              '"SFMono-Regular", Consolas, monospace',
            fontSize: "8px",
            letterSpacing:
              ".1em",
          }}
        >

          <span>
            VTAAP 2026 /
            REGISTRATION CONTROL
          </span>

          <span>
            AUTO REFRESH / 60 SEC
          </span>

        </div>

      </div>
    </main>
  );
}


/* ============================================================
   COMPONENTS
   ============================================================ */

function SectionLabel({
  number,
  title,
}: {
  number: string;
  title: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "12px",
        marginBottom: "12px",
      }}
    >
      <span
        style={{
          color:
            "var(--vt-orange-bright)",
          fontFamily:
            '"SFMono-Regular", Consolas, monospace',
          fontSize: "9px",
          fontWeight: 700,
          letterSpacing:
            ".1em",
        }}
      >
        {number}
      </span>

      <h2
        style={{
          margin: 0,
          color:
            "var(--vt-white)",
          fontSize: "18px",
          fontWeight: 500,
          textTransform:
            "uppercase",
          letterSpacing:
            "-.02em",
        }}
      >
        {title}
      </h2>
    </div>
  );
}


function RegistrationStat({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string | number;
  subtitle: string;
}) {
  return (
    <div className="stat-card">

      <div className="stat-title">
        {title}
      </div>

      <div className="stat-value">
        {value}
      </div>

      <div className="stat-subtitle">
        {subtitle}
      </div>

    </div>
  );
}


function LoadingRows() {
  return (
    <div
      style={{
        border:
          "1px solid var(--vt-border)",
      }}
    >
      {[1, 2, 3, 4, 5, 6].map(
        (row) => (
          <div
            key={row}
            className="registration-row"
          >
            <div
              className="skeleton skeleton-line medium"
            />

            <div
              className="skeleton skeleton-line short"
            />

            <div
              className="skeleton skeleton-line short"
            />

            <div
              className="skeleton skeleton-line short"
            />

            <div
              className="skeleton skeleton-line short"
            />
          </div>
        )
      )}
    </div>
  );
}


function getMerchandiseSummary(
  registrations: Registration[]
) {
  const map =
    new Map<
      string,
      {
        name: string;
        quantity: number;
        orders: number;
        revenue: number;
      }
    >();

  for (const registration of registrations) {
    for (const item of
      registration.items ?? []) {

      const name =
        item.item || "Unknown";

      const quantity =
        Number(
          item.quantity ?? 1
        );

      const current =
        map.get(name) ?? {
          name,
          quantity: 0,
          orders: 0,
          revenue: 0,
        };

      current.quantity +=
        quantity;

      current.orders += 1;

      map.set(
        name,
        current
      );
    }
  }

  return Array.from(
    map.values()
  ).sort(
    (a, b) =>
      b.quantity -
      a.quantity
  );
}
