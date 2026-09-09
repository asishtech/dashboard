"use client";

import { useEffect, useMemo, useState } from "react";
import NavBar from "@/components/NavBar";
import { DownloadIcon, SearchIcon } from "@/components/icons";
import type { MerchOrder } from "@/app/api/admin/merchandise/route";

type Summary = {
  orders: number;
  items: number;
  collected: number;
  pending: number;
};

const ORIGIN_LABEL: Record<MerchOrder["origin"], string> = {
  internal: "Internal",
  external: "External",
  unknown: "Unknown",
};

function orderStatus(order: MerchOrder) {
  if (order.items.length === 0) {
    return { label: "No items", className: "badge-plain" };
  }

  const given = order.items.filter((item) => item.given).length;

  if (given === order.items.length) {
    return { label: "Collected", className: "badge-success" };
  }

  if (given === 0) {
    return { label: "Pending", className: "badge-warning" };
  }

  return { label: `${given}/${order.items.length} collected`, className: "" };
}

export default function MerchandisePage() {
  const [orders, setOrders] = useState<MerchOrder[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/admin/merchandise", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Unable to read merchandise registrations"
          );
        }

        if (!cancelled) {
          setOrders(data.orders ?? []);
          setSummary(data.summary ?? null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to read this"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return orders;

    return orders.filter((order) =>
      [
        order.name,
        order.email,
        order.phone,
        order.registration_id,
        ...order.items.map((item) => item.item),
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    );
  }, [orders, search]);

  function exportCsv() {
    const rows = [
      [
        "Registration ID",
        "Name",
        "Email",
        "Phone",
        "Internal / External",
        "Items",
        "Status",
      ],
      ...filtered.map((order) => {
        const status = orderStatus(order);

        return [
          order.registration_id,
          order.name,
          order.email ?? "",
          order.phone ?? "",
          ORIGIN_LABEL[order.origin],
          order.items
            .map(
              (item) =>
                `${item.item}${item.size ? ` (${item.size})` : ""} x${item.quantity}${item.given ? " [given]" : " [pending]"}`
            )
            .join("; "),
          status.label,
        ];
      }),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" })
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = "vtapp-merchandise.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <main className="app">
      <NavBar />

      <div className="container">
        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / Merchandise</span>

            <h1 className="page-title">Merchandise orders</h1>

            <p className="page-subtitle">
              Everyone who has ordered merchandise, with what they
              ordered and what has been handed over
            </p>
          </div>

          <div className="header-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={exportCsv}
              disabled={filtered.length === 0}
            >
              <DownloadIcon size={13} />
              Export
            </button>
          </div>
        </header>

        {error && (
          <div className="banner banner-danger mb-6">{error}</div>
        )}

        {loading ? (
          <section className="panel">
            <div className="panel-body stack">
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-card" />
            </div>
          </section>
        ) : (
          <>
            {summary && (
              <section className="stat-grid mb-6">
                <div className="stat stat-feature">
                  <span className="stat-label">Orders</span>
                  <strong className="stat-value">
                    {summary.orders}
                  </strong>
                </div>

                <div className="stat">
                  <span className="stat-label">Items</span>
                  <strong className="stat-value">
                    {summary.items}
                  </strong>
                </div>

                <div className="stat">
                  <span className="stat-label">Collected</span>
                  <strong className="stat-value stat-success">
                    {summary.collected}
                  </strong>
                </div>

                <div className="stat">
                  <span className="stat-label">Pending</span>
                  <strong className="stat-value stat-warning">
                    {summary.pending}
                  </strong>
                </div>
              </section>
            )}

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Orders</h2>

                  <p className="panel-subtitle">
                    {orders.length} registration
                    {orders.length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="search" style={{ flex: "0 1 240px" }}>
                  <span className="search-icon">
                    <SearchIcon size={14} />
                  </span>

                  <input
                    className="input"
                    placeholder="Name, email, phone or item"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="empty">
                  <p className="empty-title">Nothing here</p>

                  <p className="empty-body">
                    {search
                      ? "No order matches that."
                      : "No merchandise orders yet."}
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <caption className="sr-only">
                      Merchandise orders
                    </caption>

                    <thead>
                      <tr>
                        <th scope="col">Buyer</th>
                        <th scope="col">Phone</th>
                        <th scope="col">Origin</th>
                        <th scope="col">Items</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filtered.map((order) => {
                        const status = orderStatus(order);

                        return (
                          <tr key={order.id}>
                            <td>
                              <div className="row-title">
                                {order.name}
                              </div>

                              <div className="row-meta truncate">
                                {order.email || "No email"}
                              </div>

                              <div className="mono dim text-sm mt-2">
                                #{order.registration_id}
                              </div>
                            </td>

                            <td className="mono">
                              {order.phone ?? "—"}
                            </td>

                            <td>
                              <span
                                className={`badge ${
                                  order.origin === "internal"
                                    ? "badge-plain"
                                    : order.origin === "external"
                                      ? "badge-accent"
                                      : "badge-warning"
                                }`}
                              >
                                {ORIGIN_LABEL[order.origin]}
                              </span>
                            </td>

                            <td>
                              {order.items.length === 0 ? (
                                <span className="help">No items</span>
                              ) : (
                                <div className="stack-tight stack">
                                  {order.items.map((item) => (
                                    <div
                                      key={item.id}
                                      className="row-meta"
                                    >
                                      {item.item}
                                      {item.size
                                        ? ` (${item.size})`
                                        : ""}
                                      {item.quantity > 1
                                        ? ` x${item.quantity}`
                                        : ""}
                                      {item.given ? (
                                        <span
                                          className="badge badge-success"
                                          style={{ marginLeft: 8 }}
                                        >
                                          Given
                                        </span>
                                      ) : (
                                        <span
                                          className="badge badge-warning"
                                          style={{ marginLeft: 8 }}
                                        >
                                          Pending
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>

                            <td>
                              <span
                                className={`badge ${status.className}`}
                              >
                                {status.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="panel-footer">
                Showing {filtered.length} of {orders.length}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
