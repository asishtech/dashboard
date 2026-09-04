"use client";

import { useState } from "react";

/*
 * Set an event's seat cap.
 *
 * Capacity is seeded from the organisers' sheet, so this is for the two
 * cases the sheet cannot cover: the nineteen events it left blank, and
 * any venue swapped after it was written.
 *
 * Deliberately not clamped to the number already registered, unlike
 * merchandise stock. Stock below units sold would describe caps that
 * do not exist; a cap below registrations describes something that
 * really happens -- a hall reassigned to a smaller room after people
 * signed up -- and the organisers need to see that as an overflow
 * rather than be refused the edit.
 */
export function CapacityEditor({
  eventId,
  capacity,
  registrations,
  onSaved,
}: {
  eventId: string;
  capacity: number | null;
  registrations: number;
  onSaved: () => void | Promise<void>;
}) {
  const [value, setValue] = useState(
    capacity === null ? "" : String(capacity)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const trimmed = value.trim();

  /* An empty box means "no figure", which is a valid saved state. */
  const parsed = trimmed === "" ? null : Number(trimmed);

  const invalid =
    parsed !== null &&
    (!Number.isInteger(parsed) || parsed < 0);

  const changed = parsed !== capacity;

  async function save() {
    if (invalid || saving) return;

    setSaving(true);
    setMessage("");
    setFailed(false);

    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(eventId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ capacity: parsed }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save the capacity");
      }

      setMessage(
        parsed === null
          ? "Capacity cleared"
          : `Capacity set to ${parsed}`
      );

      await onSaved();
    } catch (err) {
      setFailed(true);
      setMessage(
        err instanceof Error ? err.message : "Could not save"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Capacity</h2>
          <p className="panel-subtitle">
            How many seats this event has. Leave it empty if there is
            no fixed limit.
          </p>
        </div>
      </div>

      <div className="panel-body capacity-editor">
        <label className="sr-only" htmlFor="capacity-input">
          Seats for this event
        </label>

        <input
          id="capacity-input"
          className="input"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          placeholder="No limit"
          value={value}
          disabled={saving}
          onChange={(event) => {
            setValue(event.target.value);
            setMessage("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
          }}
          aria-invalid={invalid}
          aria-describedby="capacity-help"
        />

        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={saving || invalid || !changed}
        >
          {saving ? "Saving…" : "Save"}
        </button>

        <p id="capacity-help" className="dim">
          {invalid
            ? "Enter a whole number of seats, or leave it empty."
            : parsed !== null && parsed < registrations
              ? `${registrations} people are already registered — this would put the event ${
                  registrations - parsed
                } over.`
              : `${registrations} registered so far.`}
        </p>

        {message && (
          <p
            className={`banner ${
              failed ? "banner-danger" : "banner-success"
            }`}
            role="status"
          >
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
