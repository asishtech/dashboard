"use client";

import { useCallback, useState } from "react";
import { SearchIcon } from "@/components/icons";

export type Pass = {
  id: number;
  registration_id: string;
  event_id: string | null;
  event_name: string | null;
  event_day: string | null;
  event_venue: string | null;
  is_merch: boolean;
  /* Null until they have been admitted to that event. */
  entered_at: string | null;
  /* Null until they have been marked back out of it. */
  exited_at?: string | null;
};

export type Person = {
  email_key: string;
  email: string;
  name: string | null;
  phone: string | null;
  college: string | null;
  id_checked: boolean;
  id_checked_at: string | null;
  /*
   * When their current visit started, or null if they are not inside
   * the venue. Absent until supabase/gate-log.sql runs.
   */
  gate_entered_at?: string | null;
  passes: number;
  admitted: number;
  passes_detail: Pass[];
};

/*
 * Finding a person, by whatever the desk actually has.
 *
 * Shared between the external desk and the admin "where is this
 * person" lookup, because both start the same way and only differ in
 * what they do once somebody is found.
 */
export function DeskSearch({
  externalOnly,
  placeholder,
  onFound,
  children,
}: {
  externalOnly?: boolean;
  placeholder?: string;
  onFound?: (people: Person[]) => void;
  children: (person: Person, refresh: () => void) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /*
   * The query the visible results belong to, so a refresh after an
   * action re-runs that search rather than whatever has since been
   * typed into the box.
   *
   * State rather than a ref: `refresh` is handed to the caller during
   * render, and a callback closing over a ref read at render time is
   * exactly what the React compiler refuses -- correctly, since the
   * results would not re-render when it changed.
   */
  const [lastQuery, setLastQuery] = useState("");

  const run = useCallback(
    async (value: string) => {
      const trimmed = value.trim();

      if (trimmed.length < 3 || busy) return;

      setBusy(true);
      setError("");

      try {
        const response = await fetch(
          `/api/desk?q=${encodeURIComponent(trimmed)}${
            externalOnly ? "&external=1" : ""
          }`,
          { cache: "no-store" }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Search failed");
        }

        setLastQuery(trimmed);
        setPeople(data.people ?? []);
        onFound?.(data.people ?? []);
      } catch (err) {
        setPeople(null);
        setError(
          err instanceof Error ? err.message : "Search failed"
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, externalOnly, onFound]
  );

  const refresh = useCallback(() => {
    if (lastQuery) void run(lastQuery);
  }, [run, lastQuery]);

  return (
    <>
      <div className="resend-search">
        <div className="search" style={{ flex: "1 1 18rem" }}>
          <span className="search-icon">
            <SearchIcon size={14} />
          </span>

          <label className="sr-only" htmlFor="desk-query">
            Search by name, email, phone or registration number
          </label>

          <input
            id="desk-query"
            className="input"
            placeholder={
              placeholder ??
              "Name, email, phone or registration number"
            }
            value={query}
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void run(query);
            }}
          />
        </div>

        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void run(query)}
          disabled={busy || query.trim().length < 3}
        >
          {busy && <span className="btn-spinner" />}
          {busy ? "Searching" : "Search"}
        </button>
      </div>

      {error && (
        <div className="banner banner-danger mt-4">{error}</div>
      )}

      {people?.length === 0 && (
        <p className="help mt-4">
          Nobody matches that.
          {externalOnly
            ? " This searches visitors only — a VIT-AP student will not appear here."
            : ""}{" "}
          Phone search only works for the forms that asked for one.
        </p>
      )}

      {people && people.length > 0 && (
        <div className="stack mt-4">
          {people.map((person) => (
            <div key={person.email_key}>
              {children(person, refresh)}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
