"use client";

import { useRef, useState } from "react";
import type { Pass, Person } from "@/components/DeskSearch";
import { CheckIcon } from "@/components/icons";
import { LivePhotoCapture } from "@/components/LivePhotoCapture";

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

  /* Whether the live-photo camera is open, and what it proved. */
  const [capturing, setCapturing] = useState(false);
  const [photo, setPhoto] = useState<{
    liveness: string;
    score: number;
  } | null>(null);

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

  /*
   * The gate, both ways.
   *
   * Exit is here and not only in the college list because this is the
   * screen the desk has open: a visitor leaving comes back to the
   * same person they were checked in by, and making them findable
   * twice -- once to admit, once through a college -- is how the
   * count of who is still inside goes wrong.
   */
  async function gate(pass: Pass, action: "enter" | "exit") {
    if (busy) return;

    setBusy(`pass-${pass.id}`);
    setError("");
    setNote("");

    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "exit"
            ? { action: "exit", registrationId: pass.id }
            : { registrationId: pass.id }
        ),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.alreadyEntered
            ? `Already admitted at ${new Date(
                data.enteredAt
              ).toLocaleTimeString("en-IN")}`
            : data.error ||
              `Could not mark ${action === "exit" ? "exit" : "entry"}`
        );
      }

      setNote(
        action === "exit"
          ? data.alreadyExited
            ? `Already marked out at ${new Date(
                data.exitedAt
              ).toLocaleTimeString("en-IN")}`
            : `Marked out of ${pass.event_name ?? "the event"}.`
          : `Admitted to ${pass.event_name ?? "the event"}.`
      );

      refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Could not mark ${action === "exit" ? "exit" : "entry"}`
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

        {/*
          The person, not the document.

          Only after the card has been seen. The desk works one
          visitor at a time with a queue behind it, and two camera
          buttons side by side before either has been used invites
          taking the selfie first -- which proves somebody is standing
          there and nothing about who they are. The card is the check;
          the live photo is the record of who presented it, and is
          meaningless before it.
        */}
        {person.id_checked && (
        <div className="resend-search mt-4">
          {capturing ? (
            <LivePhotoCapture
              registrationId={anchor.id}
              onDone={(result) => {
                setPhoto(result);
                setCapturing(false);
                setNote(
                  result.liveness === "blink"
                    ? "Live photo saved — blink confirmed."
                    : "Live photo saved — movement confirmed, not a blink."
                );
                refresh();
              }}
              onCancel={() => setCapturing(false)}
            />
          ) : (
            <>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setNote("");
                  setError("");
                  setCapturing(true);
                }}
                disabled={busy !== ""}
              >
                {photo ? "Retake live photo" : "Take live photo"}
              </button>

              {photo && (
                <span className="row-meta">
                  {photo.liveness === "blink"
                    ? `blink confirmed (${photo.score.toFixed(2)})`
                    : `movement only (${photo.score.toFixed(1)})`}
                </span>
              )}
            </>
          )}
        </div>
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
                {pass.exited_at ? (
                  /* Came and went. Distinct from never arrived, which
                     a single tick would have made identical. */
                  <span className="badge badge-plain">
                    Left{" "}
                    {new Date(pass.exited_at).toLocaleTimeString(
                      "en-IN"
                    )}
                  </span>
                ) : pass.entered_at ? (
                  <>
                    <span className="badge badge-success">
                      <CheckIcon size={12} /> In at{" "}
                      {new Date(pass.entered_at).toLocaleTimeString(
                        "en-IN"
                      )}
                    </span>

                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => void gate(pass, "exit")}
                      disabled={busy !== ""}
                    >
                      {busy === `pass-${pass.id}` && (
                        <span className="btn-spinner" />
                      )}
                      Mark exit
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void gate(pass, "enter")}
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
