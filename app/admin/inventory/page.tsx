"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import {
  AlertIcon,
  BoxIcon,
  CheckIcon,
} from "@/components/icons";

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

  const isError = /cannot|failed|unable|invalid/i.test(message);

  const dirty = inventory.some(
    (item) =>
      Number(draft[item.id] ?? item.initial_stock) !==
      Number(item.initial_stock)
  );

  return (
    <main className="app">
      <div className="container">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">
              V-TAPP / Inventory
            </span>

            <h1 className="page-title">Stock Control</h1>

            <p className="page-subtitle">
              Configured capacity for each merchandise item
            </p>
          </div>

          <div className="header-actions">
            <Link href="/admin" className="btn btn-ghost btn-sm">
              Dashboard
            </Link>

            <Link
              href="/admin/registrations"
              className="btn btn-ghost btn-sm"
            >
              Registrations
            </Link>

            <LogoutButton />
          </div>
        </header>


        {message && (
          <div
            className={`banner ${
              isError ? "banner-danger" : "banner-success"
            }`}
            role={isError ? "alert" : "status"}
            aria-live="polite"
          >
            {isError ? (
              <AlertIcon size={18} />
            ) : (
              <CheckIcon size={18} />
            )}
            <span>{message}</span>
          </div>
        )}


        <section className="stat-grid">
          <div className="stat">
            <span className="stat-label">Configured stock</span>

            <strong className="stat-value">
              {loading ? "—" : totals.stock}
            </strong>

            <span className="stat-meta">Across all items</span>
          </div>

          <div className="stat">
            <span className="stat-label">Sold</span>

            <strong className="stat-value">
              {loading ? "—" : totals.sold}
            </strong>

            <span className="stat-meta">
              {loading ? " " : `${Math.round(utilization)}% of stock`}
            </span>
          </div>

          <div className="stat">
            <span className="stat-label">Remaining</span>

            <strong className="stat-value stat-success">
              {loading ? "—" : totals.remaining}
            </strong>

            <span className="stat-meta">Available to sell</span>
          </div>
        </section>


        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Adjust stock</h2>

              <p className="panel-subtitle">
                Stock cannot be set below the quantity already sold.
              </p>
            </div>

            <button
              type="button"
              onClick={saveInventory}
              disabled={saving || loading || !dirty}
              className="btn btn-primary btn-sm"
            >
              {saving && <span className="btn-spinner" />}
              {saving
                ? "Saving"
                : dirty
                  ? "Save changes"
                  : "No changes"}
            </button>
          </div>

          {loading ? (
            <div className="panel-body stack">
              {[1, 2, 3, 4, 5].map((row) => (
                <div key={row}>
                  <div className="skeleton skeleton-line" />
                  <div className="skeleton meter-track" />
                </div>
              ))}
            </div>
          ) : inventory.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">
                <BoxIcon size={22} />
              </div>

              <p className="empty-title">No inventory configured</p>

              <p className="empty-body">
                Items appear here once they exist in Supabase.
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">
                  Merchandise stock levels, editable
                </caption>

                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col" className="table-num">
                      Sold
                    </th>
                    <th scope="col" className="table-num">
                      Remaining
                    </th>
                    <th scope="col" style={{ width: "34%" }}>
                      Level
                    </th>
                    <th scope="col" style={{ width: 140 }}>
                      Stock
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {inventory.map((item) => {
                    const stock = Number(item.initial_stock ?? 0);
                    const sold = Number(item.sold ?? 0);
                    const remaining = Number(item.remaining ?? 0);

                    const percent =
                      stock > 0
                        ? Math.max(
                            0,
                            Math.min(100, (remaining / stock) * 100)
                          )
                        : 0;

                    const level =
                      percent <= 15
                        ? "meter-fill-danger"
                        : percent <= 40
                          ? "meter-fill-warning"
                          : "meter-fill-success";

                    const value = draft[item.id] ?? stock;
                    const invalid = value < sold;

                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="row-title">
                            {item.item}
                          </div>
                        </td>

                        <td className="table-num">{sold}</td>

                        <td className="table-num">{remaining}</td>

                        <td>
                          <div
                            className="meter-track"
                            role="progressbar"
                            aria-valuenow={Math.round(percent)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${item.item} stock remaining`}
                          >
                            <div
                              className={`meter-fill ${level}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>

                          <div className="meter-foot">
                            <span>{Math.round(percent)}% left</span>
                          </div>
                        </td>

                        <td>
                          <label
                            className="sr-only"
                            htmlFor={`stock-${item.id}`}
                          >
                            Stock for {item.item}
                          </label>

                          <input
                            id={`stock-${item.id}`}
                            type="number"
                            inputMode="numeric"
                            min={sold}
                            className={`input input-num${
                              invalid ? " input-invalid" : ""
                            }`}
                            value={value}
                            aria-invalid={invalid}
                            aria-describedby={
                              invalid
                                ? `stock-error-${item.id}`
                                : undefined
                            }
                            onChange={(event) =>
                              updateDraft(
                                item.id,
                                event.target.value
                              )
                            }
                            disabled={saving}
                          />

                          {invalid && (
                            <span
                              id={`stock-error-${item.id}`}
                              className="field-error"
                            >
                              Min {sold}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
