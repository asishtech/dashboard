"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LogoutButton from "@/components/LogoutButton";

type Inventory = {
  id: number;
  item: string;
  initial_stock: number;
  sold: number;
  remaining: number;
  remaining_percentage: number;
};

export default function InventoryPage() {

  const [items, setItems] =
    useState<Inventory[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  async function load() {

    const response =
      await fetch(
        "/api/inventory",
        {
          cache: "no-store",
        }
      );

    const data =
      await response.json();

    setItems(
      data.inventory ?? []
    );

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);


  function changeQuantity(
    id: number,
    value: string
  ) {

    setItems(
      current =>
        current.map(
          item =>
            item.id === id
              ? {
                  ...item,
                  initial_stock:
                    Number(value),
                }
              : item
        )
    );
  }


  async function save() {

    setSaving(true);
    setMessage("");

    try {

      for (const item of items) {

        if (
          item.initial_stock <
          item.sold
        ) {

          throw new Error(
            `${item.item} cannot be below ${item.sold} sold items.`
          );

        }

      }

      const response =
        await fetch(
          "/api/inventory",
          {
            method: "PUT",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              inventory:
                items.map(item => ({
                  id: item.id,
                  initial_stock:
                    item.initial_stock,
                })),
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to save"
        );
      }

      setMessage(
        "✓ Inventory updated successfully"
      );

      await load();

    } catch (error) {

      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to save"
      );

    } finally {

      setSaving(false);

    }
  }


  return (

    <main className="dashboard">

      <div className="container">

        <header className="header">

          <div>

            <h1>
              Inventory Management
            </h1>

            <p>
              Admin quantity controls
            </p>

          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
            }}
          >
            <Link
              href="/admin"
              className="admin-link"
            >
              ← Admin
            </Link>

            <LogoutButton />
          </div>

        </header>


        {message && (

          <div className="error-banner">
            {message}
          </div>

        )}


        <section className="table-card">

          <div className="table-header">

            <div>
              <h2>
                Merchandise Stock
              </h2>

              <span>
                Sold quantities are calculated
                automatically.
              </span>
            </div>

          </div>


          {loading ? (

            <div className="empty">
              Loading inventory...
            </div>

          ) : (

            <div className="table-wrapper">

              <table>

                <thead>

                  <tr>
                    <th>Item</th>
                    <th>Initial Qty</th>
                    <th>Sold</th>
                    <th>Remaining</th>
                    <th>Status</th>
                  </tr>

                </thead>

                <tbody>

                  {items.map(
                    item => (

                      <tr
                        key={item.id}
                      >

                        <td>
                          <strong>
                            {item.item}
                          </strong>
                        </td>

                        <td>

                          <input
                            className="quantity-input"
                            type="number"
                            min={item.sold}
                            value={
                              item.initial_stock
                            }
                            onChange={e =>
                              changeQuantity(
                                item.id,
                                e.target.value
                              )
                            }
                          />

                        </td>

                        <td>
                          {item.sold}
                        </td>

                        <td>

                          <strong>
                            {Math.max(
                              0,
                              item.initial_stock -
                                item.sold
                            )}
                          </strong>

                        </td>

                        <td>

                          {item.initial_stock <
                          item.sold ? (

                            <span className="type-badge combo">
                              Invalid
                            </span>

                          ) : (

                            <span className="type-badge single">
                              Active
                            </span>

                          )}

                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          )}


          <div
            style={{
              padding: "24px",
              display: "flex",
              justifyContent:
                "flex-end",
            }}
          >

            <button
              className="save-button"
              onClick={save}
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : "Save Inventory"}
            </button>

          </div>

        </section>

      </div>

    </main>
  );
}
