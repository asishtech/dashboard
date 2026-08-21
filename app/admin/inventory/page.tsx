"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LogoutButton from "@/components/LogoutButton";

type InventoryItem = {
  id: number;
  item: string;
  initial_stock: number;
  sold: number;
  remaining: number;
  remaining_percentage: number;
};

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadInventory() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        "/api/inventory",
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to load inventory"
        );
      }

      const items: InventoryItem[] =
        data.inventory ?? [];

      setInventory(items);

      const values: Record<number, number> = {};

      for (const item of items) {
        values[item.id] =
          Number(item.initial_stock);
      }

      setDraft(values);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to load inventory"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInventory();
  }, []);

  const totals = useMemo(() => {
    return inventory.reduce(
      (acc, item) => {
        acc.stock += Number(
          item.initial_stock ?? 0
        );

        acc.sold += Number(
          item.sold ?? 0
        );

        acc.remaining += Number(
          item.remaining ?? 0
        );

        return acc;
      },
      {
        stock: 0,
        sold: 0,
        remaining: 0,
      }
    );
  }, [inventory]);

  const utilization =
    totals.stock > 0
      ? (totals.sold / totals.stock) * 100
      : 0;

  function updateDraft(
    id: number,
    value: string
  ) {
    setDraft((current) => ({
      ...current,
      [id]:
        value === ""
          ? 0
          : Number(value),
    }));
  }

  async function saveInventory() {
    setSaving(true);
    setMessage("");

    try {
      for (const item of inventory) {
        const value = Number(
          draft[item.id]
        );

        if (
          !Number.isFinite(value) ||
          value < Number(item.sold)
        ) {
          throw new Error(
            `${item.item}: stock cannot be below ${item.sold} sold`
          );
        }
      }

      const payload = inventory.map(
        (item) => ({
          id: item.id,
          initial_stock:
            Number(draft[item.id]),
        })
      );

      const response = await fetch(
        "/api/inventory",
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            inventory: payload,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to save inventory"
        );
      }

      setMessage(
        "Inventory updated successfully."
      );

      await loadInventory();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to save inventory"
      );
    } finally {
      setSaving(false);
    }
  }

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
              [02] / INVENTORY CONTROL
            </div>

            <h1>
              Merchandise Inventory
            </h1>

            <p>
              Stock configuration and
              availability monitoring
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

            <Link
              href="/admin"
              className="admin-link"
            >
              Dashboard
            </Link>

            <Link
              href="/admin/registrations"
              className="admin-link"
            >
              Registrations
            </Link>

            <Link
              href="/volunteer"
              className="admin-link"
            >
              Volunteer
            </Link>

            <LogoutButton />

          </div>

        </header>


        {/* STATUS */}

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
            ● INVENTORY SYSTEM ONLINE
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
            {inventory.length} PRODUCTS INDEXED
          </span>

        </div>


        {/* OVERVIEW */}

        <section>

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
              }}
            >
              01
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
              }}
            >
              Inventory Overview
            </h2>

          </div>


          <section className="stats">

            <InventoryStat
              title="Total Stock"
              value={
                loading
                  ? "—"
                  : totals.stock
              }
              subtitle="Configured capacity"
            />

            <InventoryStat
              title="Sold"
              value={
                loading
                  ? "—"
                  : totals.sold
              }
              subtitle="Physical items"
            />

            <InventoryStat
              title="Remaining"
              value={
                loading
                  ? "—"
                  : totals.remaining
              }
              subtitle="Available now"
            />

            <InventoryStat
              title="Utilization"
              value={
                loading
                  ? "—"
                  : `${utilization.toFixed(1)}%`
              }
              subtitle="Stock consumed"
            />

          </section>

        </section>


        {/* INVENTORY STATUS */}

        <section
          style={{
            marginTop: "30px",
          }}
        >

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
              }}
            >
              02
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
              }}
            >
              Inventory Status
            </h2>

          </div>


          <div
            className="inventory-grid"
          >

            {loading
              ? [1, 2, 3, 4, 5].map(
                  (id) => (
                    <div
                      className="inventory-card"
                      key={id}
                    >
                      <div
                        className="skeleton skeleton-line medium"
                      />

                      <div
                        className="skeleton skeleton-line short"
                        style={{
                          marginTop: "18px",
                        }}
                      />

                      <div
                        className="skeleton skeleton-card"
                        style={{
                          marginTop: "22px",
                        }}
                      />
                    </div>
                  )
                )
              : inventory.map(
                  (item) => {

                    const sold =
                      Number(
                        item.sold ?? 0
                      );

                    const remaining =
                      Number(
                        item.remaining ?? 0
                      );

                    const stock =
                      Number(
                        item.initial_stock ?? 0
                      );

                    const percentage =
                      stock > 0
                        ? (remaining /
                            stock) *
                          100
                        : 0;

                    return (
                      <div
                        className="inventory-card"
                        key={item.id}
                      >

                        <div
                          className="inventory-card-header"
                        >

                          <div>
                            <h3>
                              {item.item}
                            </h3>

                            <span>
                              Capacity:{" "}
                              {stock}
                            </span>
                          </div>

                          <div
                            className="stock-number"
                          >
                            {remaining}
                          </div>

                        </div>


                        <div
                          className="inventory-label"
                        >
                          remaining
                        </div>


                        <div
                          className="inventory-track"
                        >
                          <div
                            className="inventory-fill"
                            style={{
                              width:
                                `${Math.max(
                                  0,
                                  Math.min(
                                    100,
                                    percentage
                                  )
                                )}%`,
                            }}
                          />
                        </div>


                        <div
                          className="inventory-footer"
                        >

                          <span>
                            {sold} sold
                          </span>

                          <strong>
                            {percentage.toFixed(
                              1
                            )}
                            % left
                          </strong>

                        </div>

                      </div>
                    );
                  }
                )}

          </div>

        </section>


        {/* STOCK CONFIGURATION */}

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

              <div
                style={{
                  display: "flex",
                  alignItems:
                    "baseline",
                  gap: "12px",
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
                  }}
                >
                  03
                </span>

                <h2>
                  Stock Configuration
                </h2>

              </div>

              <span>
                Update available
                merchandise quantities
              </span>

            </div>

          </div>


          {message && (
            <div
              style={{
                marginBottom: "18px",
                padding:
                  "11px 14px",
                border:
                  "1px solid var(--vt-border)",
                background:
                  "var(--vt-surface-2)",
                color:
                  message
                    .toLowerCase()
                    .includes("success")
                    ? "var(--vt-orange-bright)"
                    : "var(--vt-red)",
                fontFamily:
                  '"SFMono-Regular", Consolas, monospace',
                fontSize: "10px",
              }}
            >
              {message}
            </div>
          )}


          <div
            style={{
              overflowX: "auto",
            }}
          >

            <div
              style={{
                minWidth: "650px",
              }}
            >

              {/* TABLE HEADER */}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "2fr 1fr 1fr 1fr",
                  gap: "20px",
                  padding:
                    "10px 14px",
                  borderBottom:
                    "1px solid var(--vt-border)",
                  color:
                    "var(--vt-dim)",
                  fontFamily:
                    '"SFMono-Regular", Consolas, monospace',
                  fontSize: "8px",
                  fontWeight: 700,
                  letterSpacing: ".12em",
                  textTransform:
                    "uppercase",
                }}
              >

                <span>Product</span>
                <span>Sold</span>
                <span>Remaining</span>
                <span>New Stock</span>

              </div>


              {inventory.map(
                (item) => {

                  const sold =
                    Number(
                      item.sold ?? 0
                    );

                  const remaining =
                    Number(
                      item.remaining ?? 0
                    );

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "2fr 1fr 1fr 1fr",
                        gap: "20px",
                        alignItems:
                          "center",
                        padding:
                          "16px 14px",
                        borderBottom:
                          "1px solid var(--vt-border-soft)",
                      }}
                    >

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
                            textTransform:
                              "uppercase",
                          }}
                        >
                          {item.item}
                        </strong>

                        <span
                          style={{
                            display:
                              "block",
                            marginTop:
                              "5px",
                            color:
                              "var(--vt-dim)",
                            fontFamily:
                              '"SFMono-Regular", Consolas, monospace',
                            fontSize:
                              "8px",
                          }}
                        >
                          ID: {item.id}
                        </span>
                      </div>


                      <span
                        style={{
                          color:
                            "var(--vt-text)",
                          fontFamily:
                            '"SFMono-Regular", Consolas, monospace',
                          fontSize:
                            "12px",
                        }}
                      >
                        {sold}
                      </span>


                      <span
                        style={{
                          color:
                            "var(--vt-orange-bright)",
                          fontFamily:
                            '"SFMono-Regular", Consolas, monospace',
                          fontSize:
                            "13px",
                          fontWeight:
                            700,
                        }}
                      >
                        {remaining}
                      </span>


                      <input
                        type="number"
                        min={sold}
                        value={
                          draft[item.id] ??
                          ""
                        }
                        onChange={(event) =>
                          updateDraft(
                            item.id,
                            event.target.value
                          )
                        }
                        style={{
                          width: "100%",
                          minWidth: "90px",
                          height: "38px",
                          padding:
                            "0 10px",
                          background:
                            "#080a0c",
                          color:
                            "var(--vt-white)",
                          border:
                            "1px solid var(--vt-border)",
                          borderRadius: "0",
                          outline: "none",
                          fontFamily:
                            '"SFMono-Regular", Consolas, monospace',
                          fontSize: "12px",
                        }}
                      />

                    </div>
                  );
                }
              )}

            </div>

          </div>


          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              gap: "15px",
              flexWrap: "wrap",
              marginTop: "20px",
            }}
          >

            <span
              style={{
                color:
                  "var(--vt-dim)",
                fontFamily:
                  '"SFMono-Regular", Consolas, monospace',
                fontSize: "9px",
              }}
            >
              STOCK CANNOT BE SET
              BELOW SOLD QUANTITY
            </span>

            <button
              type="button"
              onClick={saveInventory}
              disabled={
                saving || loading
              }
              style={{
                minHeight: "40px",
                padding:
                  "0 20px",
                background:
                  saving
                    ? "#5b3219"
                    : "var(--vt-orange)",
                color:
                  "#080706",
                border:
                  "1px solid var(--vt-orange)",
                borderRadius: "0",
                fontFamily:
                  '"SFMono-Regular", Consolas, monospace',
                fontSize: "9px",
                fontWeight: 800,
                letterSpacing:
                  ".1em",
                textTransform:
                  "uppercase",
                cursor:
                  saving
                    ? "wait"
                    : "pointer",
              }}
            >
              {saving
                ? "Saving..."
                : "Save Inventory"}
            </button>

          </div>

        </section>


        {/* FOOTER */}

        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            gap: "15px",
            flexWrap: "wrap",
            marginTop: "25px",
            paddingTop: "15px",
            borderTop:
              "1px solid var(--vt-border-soft)",
            color:
              "var(--vt-dim)",
            fontFamily:
              '"SFMono-Regular", Consolas, monospace',
            fontSize: "8px",
            letterSpacing: ".1em",
          }}
        >

          <span>
            VTAAP 2026 / INVENTORY CONTROL
          </span>

          <Link
            href="/admin"
            style={{
              color:
                "var(--vt-orange-bright)",
            }}
          >
            ← RETURN TO CONTROL CENTER
          </Link>

        </div>

      </div>
    </main>
  );
}


function InventoryStat({
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
