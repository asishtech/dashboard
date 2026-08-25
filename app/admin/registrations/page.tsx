"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import { usePoll } from "@/lib/use-poll";
import {
  AlertIcon,
  InboxIcon,
  SearchIcon,
} from "@/components/icons";

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
  }, [loadRegistrations]);

  usePoll(
    () => loadRegistrations(),
    60_000
  );

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
    <main className="app">
      <div className="container">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">
              V-TAPP / Registrations
            </span>

            <h1 className="page-title">Buyer Registrations</h1>

            <p className="page-subtitle">
              Purchases, merchandise and distribution records
            </p>
          </div>

          <div className="header-actions">
            <button
              type="button"
              onClick={() => loadRegistrations(true)}
              disabled={refreshing}
              className="btn btn-ghost btn-sm"
            >
              {refreshing && <span className="btn-spinner" />}
              {refreshing ? "Refreshing" : "Refresh"}
            </button>

            <Link href="/admin" className="btn btn-ghost btn-sm">
              Dashboard
            </Link>

            <Link
              href="/admin/inventory"
              className="btn btn-ghost btn-sm"
            >
              Inventory
            </Link>

            <LogoutButton />
          </div>
        </header>


        {error && (
          <div className="banner banner-danger" role="alert">
            <AlertIcon size={18} />
            <span>{error}</span>
          </div>
        )}


        <section className="stat-grid">
          <div className="stat stat-feature">
            <span className="stat-label">Revenue</span>

            <strong className="stat-value">
              {loading ? "—" : formatAmount(stats.revenue)}
            </strong>

            <span className="stat-meta">Across all buyers</span>
          </div>

          <div className="stat">
            <span className="stat-label">Buyers</span>

            <strong className="stat-value">
              {loading ? "—" : stats.buyers}
            </strong>

            <span className="stat-meta">Registrations synced</span>
          </div>

          <div className="stat">
            <span className="stat-label">Fully given</span>

            <strong className="stat-value stat-success">
              {loading ? "—" : stats.given}
            </strong>

            <span className="stat-meta">All items handed over</span>
          </div>

          <div className="stat">
            <span className="stat-label">Outstanding</span>

            <strong className="stat-value stat-warning">
              {loading ? "—" : stats.pending}
            </strong>

            <span className="stat-meta">Items still to collect</span>
          </div>
        </section>


        <section className="panel">
          <div className="panel-header">
            <div className="search" style={{ flex: "1 1 260px" }}>
              <span className="search-icon">
                <SearchIcon size={16} />
              </span>

              <label className="sr-only" htmlFor="registration-search">
                Search registrations
              </label>

              <input
                id="registration-search"
                type="search"
                className="input"
                placeholder="Search name, email or ID"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div
              className="segmented"
              role="group"
              aria-label="Filter by distribution status"
            >
              {(["ALL", "GIVEN", "PENDING"] as const).map(
                (option) => (
                  <button
                    key={option}
                    type="button"
                    className="segmented-item"
                    aria-pressed={filter === option}
                    onClick={() => setFilter(option)}
                  >
                    {option === "ALL"
                      ? "All"
                      : option === "GIVEN"
                        ? "Given"
                        : "Pending"}
                  </button>
                )
              )}
            </div>
          </div>

          {loading ? (
            <div className="panel-body stack">
              {[1, 2, 3, 4, 5].map((row) => (
                <div key={row}>
                  <div className="skeleton skeleton-line" />
                  <div
                    className="skeleton skeleton-line"
                    style={{ width: "40%" }}
                  />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">
                <InboxIcon size={22} />
              </div>

              <p className="empty-title">
                {registrations.length === 0
                  ? "No registrations yet"
                  : "Nothing matches this view"}
              </p>

              <p className="empty-body">
                {registrations.length === 0
                  ? "Run a V-TAPP sync from the dashboard to pull in buyers."
                  : "Try a different search term or clear the status filter."}
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">
                  Buyer registrations with merchandise and
                  distribution status
                </caption>

                <thead>
                  <tr>
                    <th scope="col">Buyer</th>
                    <th scope="col">Registration</th>
                    <th scope="col">Items</th>
                    <th scope="col" className="table-num">
                      Total
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((registration) => {
                    const status =
                      getRegistrationStatus(registration);

                    const items = registration.items ?? [];

                    const itemCount = items.reduce(
                      (sum, item) =>
                        sum + Number(item.quantity ?? 1),
                      0
                    );

                    return (
                      <tr key={registration.registration_id}>
                        <td>
                          <div className="row-title">
                            {registration.name}
                          </div>

                          <div className="row-meta truncate">
                            {registration.email}
                          </div>
                        </td>

                        <td className="mono dim">
                          #{registration.registration_id}
                        </td>

                        <td>
                          {itemCount}
                          <span className="dim"> pcs</span>
                        </td>

                        <td className="table-num">
                          {formatAmount(
                            Number(registration.total ?? 0)
                          )}
                        </td>

                        <td>
                          <span
                            className={`badge ${
                              status === "GIVEN"
                                ? "badge-success"
                                : "badge-warning"
                            }`}
                          >
                            {status === "GIVEN"
                              ? "Given"
                              : "Pending"}
                          </span>
                        </td>

                        <td className="table-num">
                          <Link
                            href={`/admin/registrations/${encodeURIComponent(
                              registration.registration_id
                            )}`}
                            className="btn btn-ghost btn-sm"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="panel-footer">
              Showing {filtered.length} of {registrations.length}{" "}
              registrations
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
