"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/icons";

export type RosterPass = {
  id: number;
  registration_id: string;
  event_name: string | null;
  event_day: string | null;
  event_venue: string | null;
  entered_at: string | null;
  exited_at: string | null;
};

export type RosterPerson = {
  name: string | null;
  email_key: string;
  email: string;
  phone: string | null;
  college_as_typed: string | null;
  passes: number;
  admitted: number;
  inside: number;
  /*
   * Whether their college ID has been photographed at the desk.
   * Absent until supabase/desk-gate.sql runs, which is different from
   * false and is treated as such below.
   */
  id_checked?: boolean;
  id_checked_at?: string | null;
  passes_detail: RosterPass[];
};

/*
 * Everyone from one college, and the buttons to move them through the
 * door.
 *
 * The desk works down this list with a queue waiting, so each pass
 * carries its own control and the state it is in: not admitted,
 * inside, or left. Three states rather than a checkbox, because "has
 * not arrived" and "came and went" look identical to a tick and are
 * completely different to somebody counting a hall.
 */
export function CollegeRoster({
  people,
  collegeName,
  onChanged,
}: {
  people: RosterPerson[];
  collegeName: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function act(pass: RosterPass, action: "enter" | "exit") {
    if (busy !== null) return;

    setBusy(pass.id);
    setNote("");
    setError("");

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
            : data.error || "That did not work"
        );
      }

      setNote(
        action === "exit"
          ? data.alreadyExited
            ? `Already marked out at ${new Date(
                data.exitedAt
              ).toLocaleTimeString("en-IN")}`
            : `Marked out of ${pass.event_name ?? "the event"}`
          : `Admitted to ${pass.event_name ?? "the event"}`
      );

      onChanged();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "That did not work"
      );
    } finally {
      setBusy(null);
    }
  }

  const inside = people.reduce(
    (sum, person) => sum + Number(person.inside ?? 0),
    0
  );

  /*
   * Whether the roster knows about the ID check at all.
   *
   * Undefined is not false. Before supabase/desk-gate.sql runs the
   * field is simply absent, and refusing every entry on the strength
   * of a missing field would shut the door on a desk that has no way
   * to tell why. So: absent means carry on as before, and the note
   * below names the migration.
   */
  const gateKnown = people.some(
    (person) => person.id_checked !== undefined
  );

  return (
    <div className="stack">
      <p className="help">
        {people.length} {people.length === 1 ? "person" : "people"}{" "}
        from {collegeName} · {inside} currently inside
      </p>

      {note && (
        <p className="banner banner-success" role="status">
          {note}
        </p>
      )}

      {error && (
        <p className="banner banner-danger" role="alert">
          {error}
        </p>
      )}

      {!gateKnown && (
        <p className="help">
          Run supabase/desk-gate.sql to hold entry here until the
          college ID has been seen at the desk.
        </p>
      )}

      {people.map((person) => {
        /*
         * Admitting from this screen skips the desk entirely, which
         * is the one thing the desk exists for. Entry waits for the
         * card; exit never does -- somebody already inside is leaving
         * whether or not the paperwork was done, and refusing to
         * record that would only lose the count of who is still in
         * the building.
         */
        const blocked = person.id_checked === false;

        return (
        <div className="resend-row" key={person.email_key}>
          <div>
            <div className="row-title">
              {person.name || person.email}
            </div>

            <div className="row-meta">
              {person.email}
              {person.phone && ` · ${person.phone}`}
            </div>

            {/* What they typed, so a wrong grouping is visible on
                the person rather than only on the college. */}
            {person.college_as_typed &&
              person.college_as_typed !== collegeName && (
                <div className="row-meta dim">
                  typed &ldquo;{person.college_as_typed}&rdquo;
                </div>
              )}

            {blocked && (
              <div className="row-meta">
                <span className="badge badge-warning">
                  ID not checked
                </span>
              </div>
            )}
          </div>

          <div className="stack stack-tight roster-passes">
            {person.passes_detail.map((pass) => {
              const entered = Boolean(pass.entered_at);
              const left = Boolean(pass.exited_at);

              return (
                <div className="roster-pass" key={pass.id}>
                  <span className="row-meta">
                    {pass.event_name ?? "Unmapped ticket"}
                    {pass.event_day && ` · ${pass.event_day}`}
                  </span>

                  {left ? (
                    <span className="badge badge-plain">
                      Left{" "}
                      {new Date(
                        pass.exited_at as string
                      ).toLocaleTimeString("en-IN")}
                    </span>
                  ) : entered ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => void act(pass, "exit")}
                      disabled={busy !== null}
                    >
                      {busy === pass.id && (
                        <span className="btn-spinner" />
                      )}
                      Mark exit
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => void act(pass, "enter")}
                      disabled={busy !== null || blocked}
                      title={
                        blocked
                          ? "Their college ID has not been photographed. Find them on the External desk first."
                          : undefined
                      }
                    >
                      {busy === pass.id && (
                        <span className="btn-spinner" />
                      )}
                      Mark entry
                    </button>
                  )}

                  {entered && !left && (
                    <span className="badge badge-success">
                      <CheckIcon size={12} /> In since{" "}
                      {new Date(
                        pass.entered_at as string
                      ).toLocaleTimeString("en-IN")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );
}
