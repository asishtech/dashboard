"use client";

import { useEffect, useMemo, useState } from "react";
import NavBar from "@/components/NavBar";
import { useStepUp } from "@/lib/use-step-up";
import { useSuperAdmin } from "@/lib/use-super-admin";
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

type SizeRow = {
  item: string;
  size: string;
  quantity: number;
  lineItems: number;
  collected: number;
  pending: number;
  /* Null until an admin sets a stock figure for this item and size. */
  initialStock: number | null;
  remaining: number | null;
  remainingPercentage: number | null;
};

/* item and size together identify a row -- neither alone does. */
function sizeKey(item: string, size: string) {
  return `${item} ${size}`;
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sizes, setSizes] = useState<SizeRow[]>([]);
  const [sizesAvailable, setSizesAvailable] = useState(false);
  /* Admins edit stock; the registrations desk only reads it. */
  const [canEdit, setCanEdit] = useState(false);
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [sizeDraft, setSizeDraft] = useState<
    Record<string, number | "">
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sizeSaving, setSizeSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [sizeMessage, setSizeMessage] = useState("");

  /* A size nobody has bought yet, being capped before the first
     order rather than edited after it. */
  const [newSizeItem, setNewSizeItem] = useState("");
  const [newSizeSize, setNewSizeSize] = useState("");
  const [newSizeStock, setNewSizeStock] = useState("");
  const [addingSize, setAddingSize] = useState(false);

  const { ensure: ensureStepUp, modal: stepUpModal } = useStepUp();
  const { isSuperAdmin } = useSuperAdmin();

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

      const sizeRows: SizeRow[] = data.sizes ?? [];

      setInventory(items);
      setSizes(sizeRows);
      setSizesAvailable(Boolean(data.sizesAvailable));
      setCanEdit(Boolean(data.canEdit));

      const values: Record<number, number> = {};

      for (const item of items) {
        values[item.id] =
          Number(item.initial_stock);
      }

      setDraft(values);

      const sizeValues: Record<string, number | ""> = {};

      for (const row of sizeRows) {
        sizeValues[sizeKey(row.item, row.size)] =
          row.initialStock ?? "";
      }

      setSizeDraft(sizeValues);
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
    const timer = window.setTimeout(() => {
      loadInventory();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
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

  /*
   * The API returns one flat row per item+size, already ordered
   * S -> M -> L -> XL by the database. Grouping here preserves that
   * order because Map keeps insertion order.
   */
  const sizesByItem = useMemo(() => {
    const grouped = new Map<string, SizeRow[]>();

    for (const row of sizes) {
      const rows = grouped.get(row.item) ?? [];
      rows.push(row);
      grouped.set(row.item, rows);
    }

    return [...grouped.entries()];
  }, [sizes]);

  /* Widest single size row, so the bars share one scale. */
  const sizePeak = useMemo(
    () =>
      sizes.reduce(
        (max, row) => Math.max(max, Number(row.quantity ?? 0)),
        0
      ),
    [sizes]
  );

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
    /* Only a super admin needs to clear two-factor -- anyone else's
       request is refused server-side regardless, so there is no
       reason to walk them through an enrollment modal first. */
    if (isSuperAdmin && !(await ensureStepUp())) return;

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

  function updateSizeDraft(key: string, value: string) {
    setSizeDraft((current) => ({
      ...current,
      [key]: value === "" ? "" : Number(value),
    }));
  }

  async function saveSizeStock() {
    if (isSuperAdmin && !(await ensureStepUp())) return;

    setSizeSaving(true);
    setSizeMessage("");

    try {
      const payload: {
        item: string;
        size: string;
        initial_stock: number;
      }[] = [];

      for (const row of sizes) {
        const key = sizeKey(row.item, row.size);
        const raw = sizeDraft[key];

        /* Blank means "leave this one alone" -- most sizes will never
           get a figure typed in, and that must not be sent as 0. */
        if (raw === "" || raw === undefined) continue;

        const value = Number(raw);

        if (!Number.isFinite(value) || value < row.quantity) {
          throw new Error(
            `${row.item} (${row.size}): stock cannot be below ${row.quantity} sold`
          );
        }

        payload.push({
          item: row.item,
          size: row.size,
          initial_stock: value,
        });
      }

      if (payload.length === 0) {
        setSizeMessage("No changes to save.");
        return;
      }

      const response = await fetch("/api/inventory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sizes: payload }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save stock by size");
      }

      setSizeMessage("Stock by size updated successfully.");

      await loadInventory();
    } catch (error) {
      setSizeMessage(
        error instanceof Error
          ? error.message
          : "Failed to save stock by size"
      );
    } finally {
      setSizeSaving(false);
    }
  }

  /*
   * Cap a size before the first order against it. saveSizeStock()
   * above only ever edits a row already in `sizes`, which -- until
   * merchandise_by_size() started including inventory_sizes rows with
   * nothing sold -- meant a combination with zero sales had no row to
   * edit at all. This sends the same PUT shape as a batch of one.
   */
  async function addNewSize(event: React.FormEvent) {
    event.preventDefault();

    const item = newSizeItem.trim();
    const size = newSizeSize.trim().toUpperCase();
    const stock = Number(newSizeStock);

    if (!item || !size) {
      setSizeMessage("Pick an item and type a size.");
      return;
    }

    if (!Number.isFinite(stock) || stock < 0) {
      setSizeMessage("Stock must be zero or a positive number.");
      return;
    }

    if (isSuperAdmin && !(await ensureStepUp())) return;

    setAddingSize(true);
    setSizeMessage("");

    try {
      const response = await fetch("/api/inventory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sizes: [{ item, size, initial_stock: stock }],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to add that size");
      }

      setSizeMessage(`${item} (${size}) capped at ${stock}.`);
      setNewSizeItem("");
      setNewSizeSize("");
      setNewSizeStock("");

      await loadInventory();
    } catch (error) {
      setSizeMessage(
        error instanceof Error ? error.message : "Failed to add that size"
      );
    } finally {
      setAddingSize(false);
    }
  }

  const sizeDirty = sizes.some((row) => {
    const key = sizeKey(row.item, row.size);
    const value = sizeDraft[key];

    return value !== "" && value !== (row.initialStock ?? "");
  });

  const isError = /cannot|failed|unable|invalid/i.test(message);
  const isSizeError = /cannot|failed|unable|invalid/i.test(
    sizeMessage
  );

  const dirty = inventory.some(
    (item) =>
      Number(draft[item.id] ?? item.initial_stock) !==
      Number(item.initial_stock)
  );

  return (
    <main className="app">
      <NavBar />

      {stepUpModal}

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
              <h2 className="panel-title">
                {canEdit ? "Adjust stock" : "Stock"}
              </h2>

              <p className="panel-subtitle">
                {canEdit
                  ? "Stock cannot be set below the quantity already sold."
                  : "Read-only. Ask an admin to change a stock figure."}
              </p>
            </div>

            {canEdit && (
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
            )}
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
                          {!canEdit ? (
                            /* The figure, not a disabled box. A greyed
                               input still reads as "you may type here,
                               later". */
                            <span className="table-num">{stock}</span>
                          ) : (
                          <>
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
                          </>
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


        {/* Sold by size --------------------------------------------- */}
        {sizesAvailable && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Stock by size</h2>

                <p className="panel-subtitle">
                  {canEdit
                    ? "Set a stock cap per item and size. Blank means no cap has been set."
                    : "Units sold per size, and how many are still to be collected."}
                </p>
              </div>

              {canEdit && (
                <button
                  type="button"
                  onClick={saveSizeStock}
                  disabled={sizeSaving || loading || !sizeDirty}
                  className="btn btn-primary btn-sm"
                >
                  {sizeSaving && <span className="btn-spinner" />}
                  {sizeSaving
                    ? "Saving"
                    : sizeDirty
                      ? "Save changes"
                      : "No changes"}
                </button>
              )}
            </div>

            {sizeMessage && (
              <div className="panel-body">
                <div
                  className={`banner ${
                    isSizeError ? "banner-danger" : "banner-success"
                  }`}
                  role={isSizeError ? "alert" : "status"}
                  aria-live="polite"
                >
                  {isSizeError ? (
                    <AlertIcon size={18} />
                  ) : (
                    <CheckIcon size={18} />
                  )}
                  <span>{sizeMessage}</span>
                </div>
              </div>
            )}

            {canEdit && (
              <div className="panel-body">
                <p className="panel-subtitle mb-4">
                  Cap a size before it has sold anything -- to set a
                  limit, or to block it at 0.
                </p>

                <form
                  onSubmit={(event) => void addNewSize(event)}
                  style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                >
                  <label className="sr-only" htmlFor="new-size-item">
                    Item
                  </label>

                  <select
                    id="new-size-item"
                    className="select"
                    value={newSizeItem}
                    onChange={(event) =>
                      setNewSizeItem(event.target.value)
                    }
                    disabled={addingSize}
                  >
                    <option value="">Item...</option>
                    {inventory.map((item) => (
                      <option key={item.id} value={item.item}>
                        {item.item}
                      </option>
                    ))}
                  </select>

                  <label className="sr-only" htmlFor="new-size-size">
                    Size
                  </label>

                  <input
                    id="new-size-size"
                    className="input"
                    style={{ maxWidth: 140 }}
                    placeholder="Size (e.g. M, FREE SIZE)"
                    value={newSizeSize}
                    onChange={(event) =>
                      setNewSizeSize(event.target.value)
                    }
                    disabled={addingSize}
                  />

                  <label className="sr-only" htmlFor="new-size-stock">
                    Stock
                  </label>

                  <input
                    id="new-size-stock"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="input input-num"
                    style={{ maxWidth: 100 }}
                    placeholder="Stock"
                    value={newSizeStock}
                    onChange={(event) =>
                      setNewSizeStock(event.target.value)
                    }
                    disabled={addingSize}
                  />

                  <button
                    type="submit"
                    className="btn btn-sm"
                    disabled={
                      addingSize ||
                      !newSizeItem ||
                      !newSizeSize.trim() ||
                      newSizeStock === ""
                    }
                  >
                    {addingSize && <span className="btn-spinner" />}
                    {addingSize ? "Adding..." : "Add"}
                  </button>
                </form>
              </div>
            )}

            {sizesByItem.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">
                  <BoxIcon size={22} />
                </div>

                <p className="empty-title">Nothing sold yet</p>

                <p className="empty-body">
                  Sizes appear here once merchandise orders sync in.
                </p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">
                    Merchandise sold per size, with collection progress
                  </caption>

                  <thead>
                    <tr>
                      <th scope="col">Size</th>
                      <th scope="col" className="table-num">
                        Sold
                      </th>
                      <th scope="col" style={{ width: "34%" }}>
                        Share
                      </th>
                      <th scope="col" className="table-num">
                        Collected
                      </th>
                      <th scope="col" className="table-num">
                        Pending
                      </th>
                      <th scope="col" style={{ width: 140 }}>
                        Stock
                      </th>
                      <th scope="col" className="table-num">
                        Remaining
                      </th>
                    </tr>
                  </thead>

                  {sizesByItem.map(([item, rows]) => {
                    const itemTotal = rows.reduce(
                      (sum, row) => sum + Number(row.quantity ?? 0),
                      0
                    );

                    return (
                      <tbody key={item}>
                        <tr>
                          <th
                            scope="rowgroup"
                            colSpan={7}
                            className="table-group"
                          >
                            <div className="row-title">{item}</div>

                            <div className="row-meta">
                              {itemTotal} total
                            </div>
                          </th>
                        </tr>

                        {rows.map((row) => {
                          const quantity = Number(row.quantity ?? 0);

                          const percent =
                            sizePeak > 0
                              ? (quantity / sizePeak) * 100
                              : 0;

                          /* A size nobody recorded is a data gap, not
                             a size; flag it rather than let it read
                             as a stock line. */
                          const unsized = row.size === "No size";

                          return (
                            <tr key={`${item}-${row.size}`}>
                              <td>
                                <span
                                  className={`badge ${
                                    unsized
                                      ? "badge-warning"
                                      : "badge-plain"
                                  }`}
                                >
                                  {row.size}
                                </span>
                              </td>

                              <td className="table-num">{quantity}</td>

                              <td>
                                <div
                                  className="meter-track"
                                  role="progressbar"
                                  aria-valuenow={quantity}
                                  aria-valuemin={0}
                                  aria-valuemax={sizePeak}
                                  aria-label={`${item} ${row.size} sold`}
                                >
                                  <div
                                    className="meter-fill meter-fill-success"
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>

                                <div className="meter-foot">
                                  <span>
                                    {itemTotal > 0
                                      ? Math.round(
                                          (quantity / itemTotal) * 100
                                        )
                                      : 0}
                                    % of {item}
                                  </span>
                                </div>
                              </td>

                              <td className="table-num">
                                {row.collected}
                              </td>

                              <td className="table-num">
                                {row.pending > 0 ? (
                                  <span className="stat-warning">
                                    {row.pending}
                                  </span>
                                ) : (
                                  <span className="dim">0</span>
                                )}
                              </td>

                              <td>
                                {!canEdit ? (
                                  <span className="table-num">
                                    {row.initialStock ?? "—"}
                                  </span>
                                ) : (
                                  <>
                                    <label
                                      className="sr-only"
                                      htmlFor={`size-stock-${item}-${row.size}`}
                                    >
                                      Stock for {item} {row.size}
                                    </label>

                                    <input
                                      id={`size-stock-${item}-${row.size}`}
                                      type="number"
                                      inputMode="numeric"
                                      min={quantity}
                                      placeholder="Not set"
                                      className="input input-num"
                                      value={
                                        sizeDraft[
                                          sizeKey(item, row.size)
                                        ] ?? ""
                                      }
                                      onChange={(event) =>
                                        updateSizeDraft(
                                          sizeKey(item, row.size),
                                          event.target.value
                                        )
                                      }
                                      disabled={sizeSaving}
                                    />
                                  </>
                                )}
                              </td>

                              <td className="table-num">
                                {row.remaining === null ? (
                                  <span className="dim">—</span>
                                ) : row.remaining < 0 ? (
                                  <span className="stat-danger">
                                    {row.remaining}
                                  </span>
                                ) : (
                                  row.remaining
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    );
                  })}
                </table>
              </div>
            )}
          </section>
        )}

      </div>
    </main>
  );
}
