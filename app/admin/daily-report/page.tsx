"use client";

import { useEffect, useMemo, useState } from "react";
import NavBar from "@/components/NavBar";
import { formatDateIst } from "@/lib/format-time";
import { AlertIcon, DownloadIcon } from "@/components/icons";

type Domain = "merch" | "hostel";

type MerchPreview = {
  domain: "merch";
  count: number;
  counts: { item: string; size: string | null; quantity: number }[];
};

type HostelPreview = {
  domain: "hostel";
  count: number;
  total: number;
};

/* Today, in IST -- the fest runs there regardless of where this page
   happens to be opened from. */
function todayIst() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

export default function DailyReportPage() {
  const [date, setDate] = useState(todayIst);
  const [domain, setDomain] = useState<Domain>("merch");
  const [preview, setPreview] = useState<
    MerchPreview | HostelPreview | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const query = useMemo(
    () => `date=${encodeURIComponent(date)}&domain=${domain}`,
    [date, domain]
  );

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError("");

    fetch(`/api/admin/daily-report?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load this report");
        }

        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setPreview(null);
          setError(
            err instanceof Error ? err.message : "Unable to load this"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <main className="app">
      <NavBar />

      <div className="container">
        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / Daily report</span>

            <h1 className="page-title">Daily report</h1>

            <p className="page-subtitle">
              One day of merchandise collections or hostel check-ins,
              with timestamps and a count sheet
            </p>
          </div>
        </header>

        {error && (
          <div className="banner banner-danger mb-6" role="alert">
            <AlertIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        <section className="panel">
          <div className="panel-header">
            <div
              className="segmented"
              role="group"
              aria-label="Report type"
            >
              <button
                type="button"
                className="segmented-item"
                aria-pressed={domain === "merch"}
                onClick={() => setDomain("merch")}
              >
                Merchandise
              </button>

              <button
                type="button"
                className="segmented-item"
                aria-pressed={domain === "hostel"}
                onClick={() => setDomain("hostel")}
              >
                Hostel
              </button>
            </div>

            <div>
              <label className="sr-only" htmlFor="report-date">
                Date
              </label>

              <input
                id="report-date"
                type="date"
                className="input"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>

            <a
              className="btn btn-primary btn-sm"
              href={`/api/admin/daily-report?${query}&xlsx=1`}
              download
            >
              <DownloadIcon size={13} />
              Download
            </a>
          </div>

          <div className="panel-body">
            {loading ? (
              <div className="skeleton skeleton-line" />
            ) : !preview ? (
              <p className="help">Nothing to show for this date yet.</p>
            ) : domain === "merch" && preview.domain === "merch" ? (
              <>
                <p className="mb-4">
                  <strong>{preview.count}</strong> item
                  {preview.count === 1 ? "" : "s"} collected on{" "}
                  {formatDateIst(`${date}T00:00:00+05:30`, {
                    dateStyle: "full",
                  })}
                  .
                </p>

                {preview.counts.length === 0 ? (
                  <p className="help">
                    Nothing was collected on this date.
                  </p>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <caption className="sr-only">
                        Items collected, by size
                      </caption>

                      <thead>
                        <tr>
                          <th scope="col">Item</th>
                          <th scope="col">Size</th>
                          <th scope="col" className="table-num">
                            Quantity
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {preview.counts.map((row) => (
                          <tr key={`${row.item}-${row.size}`}>
                            <td>{row.item}</td>
                            <td>{row.size ?? "One size"}</td>
                            <td className="table-num">
                              {row.quantity}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : preview.domain === "hostel" ? (
              <p>
                <strong>{preview.total}</strong> check-in
                {preview.total === 1 ? "" : "s"} on{" "}
                {formatDateIst(`${date}T00:00:00+05:30`, {
                  dateStyle: "full",
                })}
                .
              </p>
            ) : null}
          </div>

          <div className="panel-footer">
            The download includes a full timestamped list on its own
            sheet, alongside this count.
          </div>
        </section>
      </div>
    </main>
  );
}
