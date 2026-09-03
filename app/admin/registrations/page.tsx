"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import NavBar from "@/components/NavBar";
import { useLiveRefresh } from "@/lib/use-realtime";
import {
  AlertIcon,
  CheckIcon,
  DownloadIcon,
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

type RegistrationEvent = {
  slug: string | null;
  name: string;
  day: string | null;
  venue: string | null;
  merch: boolean;
};

type Registration = {
  id?: number;
  registration_id: string;
  name: string;
  email: string;
  total?: number | null;
  items?: RegistrationItem[];
  /* When they were admitted at the gate; null if they have not been. */
  entered_at?: string | null;
  /*
   * Resolved server-side. The page used to label rows from the
   * upstream bucket id -- 513 "Merchandise", 514 "V-TAPP Event",
   * anything else "Unknown" -- which made all 89 events one string.
   */
  event?: RegistrationEvent;
};

const LIVE_TABLES = [
  "registrations",
  "registration_items",
  "distributions",
];

/* Sentinel for "no size recorded"; no real size can collide with it. */
const NO_SIZE = " no-size";

const sizeLabel = (item: RegistrationItem) =>
  (item.size ?? "").trim() || "—";

const UNMAPPED: RegistrationEvent = {
  slug: null,
  name: "Unmapped ticket",
  day: null,
  venue: null,
  merch: false,
};

type Status = "GIVEN" | "PENDING";

function statusOf(registration: Registration): Status {
  const items = registration.items ?? [];

  if (items.length === 0) return "PENDING";

  const total = items.reduce(
    (sum, item) => sum + Number(item.quantity ?? 1),
    0
  );

  const given = items.reduce(
    (sum, item) =>
      sum + (item.status === "GIVEN" ? Number(item.quantity ?? 1) : 0),
    0
  );

  return given >= total ? "GIVEN" : "PENDING";
}

export default function RegistrationsPage() {
  const [registrations, setRegistrations] = useState<Registration[]>(
    []
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"ALL" | "EVENT" | "MERCH">("ALL");
  const [status, setStatus] = useState<"ALL" | Status>("ALL");
  const [eventFilter, setEventFilter] = useState("ALL");
  const [itemFilter, setItemFilter] = useState("ALL");
  const [sizeFilter, setSizeFilter] = useState("ALL");

  /*
   * The three dropdowns sat permanently beside the search box, which
   * read as filters already applied even at "All". They are behind a
   * toggle now, and the toggle says how many are actually narrowing
   * anything -- so "no filters" and "some filters" look different.
   */
  const [showFilters, setShowFilters] = useState(false);

  /* Which registration's entry is being undone. */
  const [undoing, setUndoing] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const loadRegistrations = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);

    try {
      const response = await fetch("/api/registrations", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load registrations");
      }

      setRegistrations(data.registrations ?? []);
      setError("");
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
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => loadRegistrations(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRegistrations]);

  const live = useLiveRefresh(
    LIVE_TABLES,
    useCallback(() => loadRegistrations(true), [loadRegistrations])
  );

  /* Filter options, built from what is actually present. */
  const { eventOptions, itemOptions, sizeOptions } = useMemo(() => {
    const events = new Map<string, string>();
    const items = new Set<string>();
    const sizes = new Set<string>();
    let anyUnsized = false;

    for (const registration of registrations) {
      const event = registration.event ?? UNMAPPED;

      if (!event.merch) {
        events.set(event.slug ?? event.name, event.name);
      }

      for (const item of registration.items ?? []) {
        items.add(item.item);

        const size = (item.size ?? "").trim();

        if (size) sizes.add(size);
        else anyUnsized = true;
      }
    }

    return {
      eventOptions: [...events.entries()].sort((a, b) =>
        a[1].localeCompare(b[1])
      ),
      itemOptions: [...items].sort(),
      sizeOptions: [
        ...[...sizes].sort(),
        ...(anyUnsized ? [NO_SIZE] : []),
      ],
    };
  }, [registrations]);

  const itemMatches = useCallback(
    (item: RegistrationItem) => {
      if (itemFilter !== "ALL" && item.item !== itemFilter) {
        return false;
      }

      if (sizeFilter === "ALL") return true;

      const size = (item.size ?? "").trim();

      return sizeFilter === NO_SIZE ? !size : size === sizeFilter;
    },
    [itemFilter, sizeFilter]
  );

  const merchActive = itemFilter !== "ALL" || sizeFilter !== "ALL";

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return registrations.filter((registration) => {
      const event = registration.event ?? UNMAPPED;

      if (kind === "EVENT" && event.merch) return false;
      if (kind === "MERCH" && !event.merch) return false;

      if (status !== "ALL" && statusOf(registration) !== status) {
        return false;
      }

      if (
        eventFilter !== "ALL" &&
        (event.slug ?? event.name) !== eventFilter
      ) {
        return false;
      }

      /* A merchandise filter excludes anyone with no matching line. */
      if (
        merchActive &&
        !(registration.items ?? []).some(itemMatches)
      ) {
        return false;
      }

      if (!query) return true;

      return (
        registration.name?.toLowerCase().includes(query) ||
        registration.email?.toLowerCase().includes(query) ||
        registration.registration_id?.toLowerCase().includes(query) ||
        event.name.toLowerCase().includes(query)
      );
    });
  }, [
    registrations,
    search,
    kind,
    status,
    eventFilter,
    merchActive,
    itemMatches,
  ]);

  const stats = useMemo(() => {
    let revenue = 0;
    let given = 0;
    let events = 0;
    let merch = 0;

    for (const registration of filtered) {
      revenue += Number(registration.total ?? 0);

      if (statusOf(registration) === "GIVEN") given += 1;

      if ((registration.event ?? UNMAPPED).merch) merch += 1;
      else events += 1;
    }

    return { revenue, given, events, merch };
  }, [filtered]);

  const formatTime = (value: string) =>
    new Date(value).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  /*
   * Undo an admission from the desk, without needing the pass in hand.
   * Sends the registration id rather than the token, so the page never
   * receives a bearer credential it has no use for.
   */
  async function undoEntry(registration: Registration) {
    if (undoing !== null || !registration.id) return;

    if (
      !window.confirm(
        `Undo the entry for ${registration.name || registration.email}? Their pass becomes usable again.`
      )
    ) {
      return;
    }

    setUndoing(registration.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/checkin", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: registration.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not undo entry");
      }

      setNotice(
        `Entry undone for ${registration.name || registration.email}.`
      );

      await loadRegistrations(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not undo entry"
      );
    } finally {
      setUndoing(null);
    }
  }

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);

  /*
   * Export exactly what is on screen.
   *
   * One row per merchandise line rather than per buyer, so sizes stay
   * summable in Excel: narrow to "T-Shirt / L" and the download is the
   * L t-shirts to pack. The file is an HTML table Excel opens as .xls,
   * which keeps a spreadsheet writer out of the client bundle.
   */
  function downloadXls() {
    const escape = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const headers = [
      "Registration ID",
      "Name",
      "Email",
      "Event",
      "Day",
      "Venue",
      "Merchandise",
      "Size",
      "Quantity",
      "Item status",
      "Registration status",
      "Checked in at",
      "Total (INR)",
    ];

    const rows: string[] = [];

    for (const registration of filtered) {
      const event = registration.event ?? UNMAPPED;
      const state = statusOf(registration);
      const total = Number(registration.total ?? 0);

      const lines = (registration.items ?? []).filter((item) =>
        merchActive ? itemMatches(item) : true
      );

      const cells = (item: RegistrationItem | null) =>
        [
          registration.registration_id,
          registration.name,
          registration.email,
          event.name,
          event.day ?? "",
          event.venue ?? "",
          item?.item ?? "",
          item ? sizeLabel(item) : "",
          item?.quantity ?? "",
          item?.status ?? "",
          state,
          registration.entered_at
            ? formatTime(registration.entered_at)
            : "",
          total,
        ]
          .map((cell) => `<td>${escape(cell)}</td>`)
          .join("");

      /* An event booking has no lines; it still belongs in the file. */
      if (lines.length === 0) {
        rows.push(`<tr>${cells(null)}</tr>`);
      } else {
        for (const item of lines) {
          rows.push(`<tr>${cells(item)}</tr>`);
        }
      }
    }

    const html = `<html><head><meta charset="utf-8"></head><body><table><thead><tr>${headers
      .map((header) => `<th>${escape(header)}</th>`)
      .join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></body></html>`;

    const url = URL.createObjectURL(
      new Blob([html], { type: "application/vnd.ms-excel" })
    );

    const link = document.createElement("a");

    link.href = url;
    link.download = `vtapp-registrations-${new Date()
      .toISOString()
      .slice(0, 10)}.xls`;

    link.click();

    URL.revokeObjectURL(url);
  }

  function reset() {
    setSearch("");
    setKind("ALL");
    setStatus("ALL");
    setEventFilter("ALL");
    setItemFilter("ALL");
    setSizeFilter("ALL");
  }

  const activeFilterCount = [
    kind !== "ALL",
    status !== "ALL",
    eventFilter !== "ALL",
    itemFilter !== "ALL",
    sizeFilter !== "ALL",
  ].filter(Boolean).length;

  const anyFilter =
    search !== "" ||
    kind !== "ALL" ||
    status !== "ALL" ||
    eventFilter !== "ALL" ||
    merchActive;

  return (
    <main className="app">
      <NavBar />

      <div className="container">

        <header className="page-header">
          <div>
            <span className="page-eyebrow">
              V-TAPP / Registrations
            </span>

            <h1 className="page-title">Registrations</h1>

            <p className="page-subtitle">
              Every event booking and merchandise order
            </p>
          </div>

          <div className="header-actions">
            <span
              className={`pulse${live === "live" ? "" : " pulse-idle"}`}
            >
              {live === "live" ? "Live" : "Polling"}
            </span>

            <button
              type="button"
              onClick={() => loadRegistrations(true)}
              disabled={refreshing}
              className="btn btn-ghost btn-sm"
            >
              {refreshing && <span className="btn-spinner" />}
              {refreshing ? "Refreshing" : "Refresh"}
            </button>

            <button
              type="button"
              onClick={downloadXls}
              disabled={loading || filtered.length === 0}
              className="btn btn-primary btn-sm"
              title="Download the current view as an Excel file"
            >
              <DownloadIcon size={14} />
              Export
            </button>
          </div>
        </header>


        {error && (
          <div className="banner banner-danger" role="alert">
            <AlertIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="banner banner-success" role="status">
            <CheckIcon size={18} />
            <span>{notice}</span>
          </div>
        )}


        {!loading && (
          <section className="stat-grid">
            <div className="stat stat-feature">
              <span className="stat-label">Showing</span>

              <strong className="stat-value">{filtered.length}</strong>

              <span className="stat-meta">
                {anyFilter
                  ? `of ${registrations.length} registrations`
                  : "registrations"}
              </span>
            </div>

            <div className="stat">
              <span className="stat-label">Event bookings</span>

              <strong className="stat-value">{stats.events}</strong>

              <span className="stat-meta">
                {stats.merch} merchandise order
                {stats.merch === 1 ? "" : "s"}
              </span>
            </div>

            <div className="stat">
              <span className="stat-label">Collected</span>

              <strong className="stat-value stat-success">
                {stats.given}
              </strong>

              <span className="stat-meta">Fully handed over</span>
            </div>

            <div className="stat">
              <span className="stat-label">Value</span>

              <strong className="stat-value">
                {formatAmount(stats.revenue)}
              </strong>

              <span className="stat-meta">Of the rows shown</span>
            </div>
          </section>
        )}


        <section className="panel">
          <div className="panel-header">
            <div
              className="segmented"
              role="group"
              aria-label="Filter by kind"
            >
              {(
                [
                  ["ALL", "All"],
                  ["EVENT", "Events"],
                  ["MERCH", "Merchandise"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="segmented-item"
                  aria-pressed={kind === value}
                  onClick={() => setKind(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div
              className="segmented"
              role="group"
              aria-label="Filter by collection status"
            >
              {(
                [
                  ["ALL", "Any"],
                  ["GIVEN", "Collected"],
                  ["PENDING", "Pending"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="segmented-item"
                  aria-pressed={status === value}
                  onClick={() => setStatus(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="panel-header">
            <div className="search" style={{ flex: "1 1 240px" }}>
              <span className="search-icon">
                <SearchIcon size={16} />
              </span>

              <label className="sr-only" htmlFor="reg-search">
                Search registrations
              </label>

              <input
                id="reg-search"
                type="search"
                className="input"
                placeholder="Name, email, registration ID or event"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <button
              type="button"
              className={`btn btn-sm ${
                activeFilterCount > 0 ? "btn-primary" : "btn-ghost"
              }`}
              aria-expanded={showFilters}
              aria-controls="reg-filters"
              onClick={() => setShowFilters((open) => !open)}
            >
              Filters
              {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>

            {anyFilter && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={reset}
              >
                Clear
              </button>
            )}
          </div>

          {showFilters && (
            <div className="panel-header" id="reg-filters">
            <label className="sr-only" htmlFor="reg-event">
              Event
            </label>

            <select
              id="reg-event"
              className="select select-sm"
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value)}
            >
              <option value="ALL">All events</option>

              {eventOptions.map(([slug, name]) => (
                <option key={slug} value={slug}>
                  {name}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="reg-item">
              Merchandise
            </label>

            <select
              id="reg-item"
              className="select select-sm"
              value={itemFilter}
              onChange={(event) => setItemFilter(event.target.value)}
            >
              <option value="ALL">Any item</option>

              {itemOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="reg-size">
              Size
            </label>

            <select
              id="reg-size"
              className="select select-sm"
              value={sizeFilter}
              onChange={(event) => setSizeFilter(event.target.value)}
            >
              <option value="ALL">Any size</option>

              {sizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size === NO_SIZE ? "No size" : size}
                </option>
              ))}
            </select>

            </div>
          )}

          {loading ? (
            <div className="panel-body stack">
              {[1, 2, 3, 4].map((row) => (
                <div key={row}>
                  <div className="skeleton skeleton-line" />
                  <div
                    className="skeleton skeleton-line"
                    style={{ width: "45%" }}
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
                  : "Nothing matches those filters"}
              </p>

              <p className="empty-body">
                {registrations.length === 0
                  ? "Rows appear here after a V-TAPP sync."
                  : "Try clearing a filter or widening the search."}
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">
                  Registrations with their event and collection status
                </caption>

                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Event</th>
                    <th scope="col">Merchandise</th>
                    <th scope="col" className="table-num">
                      Total
                    </th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((registration) => {
                    const event = registration.event ?? UNMAPPED;
                    const state = statusOf(registration);
                    const key = registration.registration_id;

                    const lines = (registration.items ?? []).filter(
                      (item) => (merchActive ? itemMatches(item) : true)
                    );

                    return (
                      <tr key={key}>
                        <td>
                          <div className="row-title">
                            {registration.name || "—"}
                          </div>

                          <div className="row-meta">
                            {registration.email}
                          </div>

                          <Link
                            href={`/admin/registrations/${encodeURIComponent(
                              key
                            )}`}
                            className="row-meta mono"
                            onClick={(click) => click.stopPropagation()}
                          >
                            #{key}
                          </Link>
                        </td>

                        <td>
                          <div className="row-title">{event.name}</div>

                          <div className="row-meta">
                            {[event.day, event.venue]
                              .filter(Boolean)
                              .join(" · ") ||
                              (event.merch
                                ? "Collection counter"
                                : "No schedule recorded")}
                          </div>
                        </td>

                        {/* Listed outright. Hiding these behind a
                            click meant the one thing this screen is
                            for -- what someone bought -- was the one
                            thing not on it. */}
                        <td>
                          {lines.length === 0 ? (
                            <span className="dim">
                              {event.merch ? "No items" : "—"}
                            </span>
                          ) : (
                            <div className="chip-row">
                              {lines.map((item) => (
                                <span
                                  key={item.id}
                                  className={`badge ${
                                    item.status === "GIVEN"
                                      ? "badge-success"
                                      : "badge-warning"
                                  }`}
                                  title={
                                    item.status === "GIVEN"
                                      ? "Collected"
                                      : "Not collected yet"
                                  }
                                >
                                  {item.item}
                                  {sizeLabel(item) !== "—"
                                    ? ` · ${sizeLabel(item)}`
                                    : ""}
                                  {item.quantity > 1
                                    ? ` ×${item.quantity}`
                                    : ""}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="table-num">
                          {formatAmount(
                            Number(registration.total ?? 0)
                          )}
                        </td>

                        <td>
                          {event.merch ? (
                            <span
                              className={`badge ${
                                state === "GIVEN"
                                  ? "badge-success"
                                  : "badge-warning"
                              }`}
                            >
                              {state === "GIVEN"
                                ? "Collected"
                                : "Pending"}
                            </span>
                          ) : registration.entered_at ? (
                            /* An event booking that has been admitted.
                               Undo is here because this is the screen
                               you reach by searching an email, which is
                               all a desk has to go on. */
                            <div className="stack stack-tight">
                              <span className="badge badge-success">
                                Checked in
                              </span>

                              <span className="row-meta">
                                {formatTime(registration.entered_at)}
                              </span>

                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                disabled={undoing !== null}
                                onClick={() => undoEntry(registration)}
                              >
                                {undoing === registration.id && (
                                  <span className="btn-spinner" />
                                )}
                                {undoing === registration.id
                                  ? "Undoing"
                                  : "Undo entry"}
                              </button>
                            </div>
                          ) : (
                            <span className="badge badge-plain">
                              Not checked in
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

          {!loading && filtered.length > 0 && (
            <div className="panel-footer">
              Showing {filtered.length} of {registrations.length}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
