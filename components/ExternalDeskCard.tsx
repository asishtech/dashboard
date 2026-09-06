"use client";

import { useRef, useState } from "react";
import type { Pass, Person } from "@/components/DeskSearch";
import { CheckIcon } from "@/components/icons";

/*
 * One visitor at the desk: who they are, their college ID, and the
 * events they can be let into.
 *
 * The order is the order it happens in — find them, check the card,
 * then admit — and admitting is disabled until the card has been
 * seen, because that is the whole reason a visitor is stopped at a
 * desk rather than walking to the gate.
 */
export function ExternalDeskCard({
  person,
  refresh,
}: {
  person: Person;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);

  /* Any pass will do as the key for the card: it belongs to the
     person, and the desk photographs one card, not one per event. */
  const anchor = person.passes_detail[0];

  async function uploadCard(file: File) {
    if (busy) return;

    setBusy("card");
    setError("");
    setNote("");

    try {
      const body = new FormData();
      body.set("registrationId", String(anchor.id));
      body.set("file", file);

      const response = await fetch("/api/desk/id-card", {
        method: "POST",
        body,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setPreview(URL.createObjectURL(file));
      setNote("ID card saved.");

      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy("");
    }
  }

  async function admit(pass: Pass) {
    if (busy) return;

    setBusy(`pass-${pass.id}`);
    setError("");
    setNote("");

    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: pass.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.alreadyEntered
            ? `Already admitted at ${new Date(
                data.enteredAt
              ).toLocaleTimeString("en-IN")}`
            : data.error || "Could not mark entry"
        );
      }

      setNote(
        `Admitted to ${pass.event_name ?? "the event"}.`
      );

      refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not mark entry"
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="panel mb-4">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">
            {person.name || person.email}
          </h3>

          <p className="panel-subtitle">
            {person.email}
            {person.phone && ` · ${person.phone}`}
          </p>

          <p className="panel-subtitle">
            {person.college ?? "No college recorded"}
          </p>
        </div>

        <span
          className={`badge ${
            person.id_checked ? "badge-success" : "badge-warning"
          }`}
        >
          {person.id_checked ? "ID checked" : "ID not checked"}
        </span>
      </div>

      <div className="panel-body">
        {/* 1. The card ------------------------------------------- */}
        <div className="resend-search">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            /*
             * `capture` opens the rear camera straight away on a
             * phone, which is what the desk has. On a laptop the
             * attribute is ignored and it stays a file picker.
             */
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadCard(file);
              event.target.value = "";
            }}
          />

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => fileInput.current?.click()}
            disabled={busy !== ""}
          >
            {busy === "card" && <span className="btn-spinner" />}
            {person.id_checked
              ? "Replace ID photo"
              : "Photograph college ID"}
          </button>

          {person.id_checked && person.id_checked_at && (
            <span className="row-meta">
              Seen{" "}
              {new Date(person.id_checked_at).toLocaleString("en-IN")}
            </span>
          )}
        </div>

        {preview && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={preview}
            alt="The ID card just photographed"
            className="id-preview mt-3"
          />
        )}

        {/* 2. The passes ----------------------------------------- */}
        <div className="stack mt-4">
          {person.passes_detail.map((pass) => (
            <div className="resend-row" key={pass.id}>
              <div>
                <div className="row-title">
                  {pass.is_merch
                    ? "Merchandise"
                    : (pass.event_name ?? "Unmapped ticket")}
                </div>

                <div className="row-meta">
                  {[pass.event_day, pass.event_venue]
                    .filter(Boolean)
                    .join(" · ") || "No venue recorded"}
                  {" · #"}
                  {pass.registration_id}
                </div>
              </div>

              <div className="resend-actions">
                {pass.entered_at ? (
                  <span className="badge badge-success">
                    <CheckIcon size={12} /> In at{" "}
                    {new Date(pass.entered_at).toLocaleTimeString(
                      "en-IN"
                    )}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void admit(pass)}
                    disabled={busy !== "" || !person.id_checked}
                    title={
                      person.id_checked
                        ? undefined
                        : "Photograph their college ID first"
                    }
                  >
                    {busy === `pass-${pass.id}` && (
                      <span className="btn-spinner" />
                    )}
                    Mark entry
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {!person.id_checked && (
          <p className="help mt-3">
            Entry is disabled until the college ID has been
            photographed — that check is the reason a visitor comes to
            this desk rather than walking to the gate.
          </p>
        )}

        {note && (
          <p className="banner banner-success mt-4" role="status">
            {note}
          </p>
        )}

        {error && (
          <p className="banner banner-danger mt-4" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
