"use client";

import NavBar from "@/components/NavBar";
import { DeskSearch, type Person } from "@/components/DeskSearch";
import { CheckIcon, SearchIcon } from "@/components/icons";

/*
 * Where is this person right now.
 *
 * "Where" is the event they were last admitted to, not what they
 * registered for: somebody entered for four events is at the one they
 * last walked into. The rest of their passes are the context for
 * whoever is asking.
 */
export default function WhereaboutsPage() {
  return (
    <main className="app">
      <NavBar />

      <div className="container container-narrow">
        <header className="page-header">
          <div>
            <span className="page-eyebrow">V-TAPP / Find</span>

            <h1 className="page-title">Where is someone</h1>

            <p className="page-subtitle">
              Type an email, registration number, name or phone
            </p>
          </div>
        </header>

        <section className="panel">
          <div className="panel-body">
            <DeskSearch placeholder="Email or registration number">
              {(person) => <Whereabouts person={person} />}
            </DeskSearch>

            <p className="help mt-4">
              <SearchIcon size={13} /> Everyone is searchable here,
              visitors and students alike. Phone numbers only match on
              the forms that asked for one.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function Whereabouts({ person }: { person: Person }) {
  const admitted = person.passes_detail
    .filter((pass) => pass.entered_at)
    .sort(
      (a, b) =>
        new Date(b.entered_at ?? 0).getTime() -
        new Date(a.entered_at ?? 0).getTime()
    );

  const current = admitted[0];

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
            {person.college && ` · ${person.college}`}
          </p>
        </div>
      </div>

      <div className="panel-body">
        {/*
          The answer, stated once and large. Everything below is the
          working that supports it.
        */}
        {current ? (
          <div className="stat stat-feature">
            <span className="stat-label">Last seen at</span>

            <strong className="stat-value stat-value-sm stat-success">
              {current.is_merch
                ? "Merchandise counter"
                : (current.event_name ?? "an event")}
            </strong>

            <span className="stat-meta">
              {[current.event_venue, current.event_day]
                .filter(Boolean)
                .join(" · ")}
              {current.entered_at &&
                ` — admitted ${new Date(
                  current.entered_at
                ).toLocaleString("en-IN")}`}
            </span>
          </div>
        ) : (
          <div className="stat">
            <span className="stat-label">Not seen yet</span>

            <strong className="stat-value stat-value-sm">
              Nowhere
            </strong>

            <span className="stat-meta">
              Holds {person.passes} pass
              {person.passes === 1 ? "" : "es"}, none used
            </span>
          </div>
        )}

        <p className="help mt-4">
          {person.admitted} of {person.passes} passes used
        </p>

        <div className="table-wrap mt-3">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Where</th>
                <th scope="col">Entry</th>
              </tr>
            </thead>

            <tbody>
              {person.passes_detail.map((pass) => (
                <tr key={pass.id}>
                  <td>
                    <div className="row-title">
                      {pass.is_merch
                        ? "Merchandise"
                        : (pass.event_name ?? "Unmapped ticket")}
                    </div>

                    <div className="row-meta">
                      #{pass.registration_id}
                    </div>
                  </td>

                  <td>
                    <div className="row-meta">
                      {[pass.event_day, pass.event_venue]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  </td>

                  <td>
                    {pass.entered_at ? (
                      <span className="badge badge-success">
                        <CheckIcon size={12} />{" "}
                        {new Date(
                          pass.entered_at
                        ).toLocaleTimeString("en-IN")}
                      </span>
                    ) : (
                      <span className="badge badge-plain">
                        Not in
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
