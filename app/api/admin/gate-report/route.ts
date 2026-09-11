import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { formatDateTimeIst } from "@/lib/format-time";
import {
  FEST_DAY_1_IST,
  FEST_DAY_2_IST,
  festDaysOf,
  istDateOf,
} from "@/lib/fest-days";
import {
  collegeFrom,
  emailFrom,
  originFrom,
  parseRaw,
  phoneFrom,
} from "@/lib/form-fields";
import { isTeamEvent } from "@/lib/team-events";
import { readAll } from "@/lib/paged";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/* 42P01 / PGRST205: supabase/gate-log.sql has not been run. */
const MISSING = ["42P01", "PGRST205", "PGRST202"];

type Registration = {
  event_id: string | number | null;
  resolved_event_id: string | null;
  name: string | null;
  email: string | null;
  raw_data: unknown;
};

type EventInfo = { day: string | null; team_size: string | null };

type GateVisit = { entered_at: string; exited_at: string | null };

export type DayRow = {
  name: string;
  email: string;
  phone: string | null;
  teamOrIndividual: string;
  college: string;
  enteredAt: string | null;
  exitedAt: string | null;
};

/*
 * "Team", "Individual", or "Team & Individual" when they hold events
 * of both kinds on this day -- collapsing that to just one would say
 * something false about whichever kind got dropped.
 */
function classify(kinds: Set<"team" | "individual">): string {
  if (kinds.has("team") && kinds.has("individual")) {
    return "Team & Individual";
  }

  if (kinds.has("team")) return "Team";
  if (kinds.has("individual")) return "Individual";

  return "";
}

/*
 * A person's earliest entry and latest exit among their gate visits
 * that actually happened on the given calendar date.
 *
 * A person who came, left, and came back on the same day collapses to
 * one row here -- "distinct participant list" means one line per
 * person per day, not one per visit.
 */
function summarizeVisits(
  visits: GateVisit[],
  date: string
): { enteredAt: string | null; exitedAt: string | null } {
  const onThatDay = visits.filter(
    (v) => istDateOf(v.entered_at) === date
  );

  if (onThatDay.length === 0) {
    return { enteredAt: null, exitedAt: null };
  }

  const enteredAt = onThatDay
    .map((v) => v.entered_at)
    .sort()
    .at(0)!;

  const exits = onThatDay
    .map((v) => v.exited_at)
    .filter((e): e is string => Boolean(e));

  const exitedAt = exits.length > 0 ? exits.sort().at(-1)! : null;

  return { enteredAt, exitedAt };
}

/*
 * GET /api/admin/gate-report        -- JSON, both days
 * GET /api/admin/gate-report?xlsx=1 -- the same, as a two-sheet
 *                                      spreadsheet (Day 1, Day 2)
 *
 * Every external participant registered for a Day 1 or Day 2 event,
 * with the gate visit (entry/exit through the External desk, not any
 * single event's own door) that actually happened on that date. Blank
 * entry/exit means registered but not yet through the gate that day --
 * the point of the list, not a gap in it.
 */
export async function GET(request: Request) {
  const auth = await requireRole("admin", "registrations");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const db = supabaseAdmin();

    const [{ rows }, eventsResult, gateResult] = await Promise.all([
      readAll<Registration>((from, to) =>
        db
          .from("registrations")
          .select("event_id,resolved_event_id,name,email,raw_data")
          .order("id", { ascending: true })
          .range(from, to)
      ),

      db.from("events").select("event_id,day,team_size"),

      db
        .from("gate_log")
        .select("email_key,entered_at,exited_at"),
    ]);

    if (eventsResult.error) throw eventsResult.error;

    if (gateResult.error) {
      if (MISSING.includes(gateResult.error.code ?? "")) {
        return NextResponse.json(
          {
            error:
              "Run supabase/gate-log.sql to record gate entry and exit.",
          },
          { status: 409 }
        );
      }

      throw gateResult.error;
    }

    const eventsById = new Map<string, EventInfo>(
      (eventsResult.data ?? []).map((row) => [
        String(row.event_id),
        { day: row.day, team_size: row.team_size },
      ])
    );

    const visitsByEmail = new Map<string, GateVisit[]>();

    for (const scan of gateResult.data ?? []) {
      const key = scan.email_key.toLowerCase();
      const list = visitsByEmail.get(key) ?? [];

      list.push({ entered_at: scan.entered_at, exited_at: scan.exited_at });
      visitsByEmail.set(key, list);
    }

    type Person = {
      name: string;
      email: string;
      college: string;
      phone: string | null;
      /* What kind of event they hold on each day they are registered
         for -- built up as registrations are walked, one day set per
         person rather than one for both. */
      kinds: { D1: Set<"team" | "individual">; D2: Set<"team" | "individual"> };
    };

    const people = new Map<string, Person>();

    for (const row of rows) {
      const raw = parseRaw(row.raw_data);
      const email = (row.email?.trim() || emailFrom(raw)).toLowerCase();

      if (!email) continue;
      if (originFrom(raw, email) !== "external") continue;

      /* Merchandise and hostel carry no event day -- they never put
         anyone on either list by themselves. */
      const eventInfo = row.resolved_event_id
        ? eventsById.get(row.resolved_event_id)
        : undefined;

      const days = festDaysOf(eventInfo?.day);

      if (days.size === 0) continue;

      const college = collegeFrom(raw);
      const phone = phoneFrom(raw);

      const person =
        people.get(email) ??
        (() => {
          const created: Person = {
            name: row.name || "",
            email,
            college: college || "",
            phone: phone || null,
            kinds: { D1: new Set(), D2: new Set() },
          };

          people.set(email, created);

          return created;
        })();

      if (!person.name && row.name) person.name = row.name;
      if (!person.college && college) person.college = college;
      if (!person.phone && phone) person.phone = phone;

      const kind = isTeamEvent(eventInfo?.team_size)
        ? "team"
        : "individual";

      for (const day of days) {
        person.kinds[day].add(kind);
      }
    }

    const day1: DayRow[] = [];
    const day2: DayRow[] = [];

    for (const person of people.values()) {
      const visits = visitsByEmail.get(person.email) ?? [];
      const shared = {
        name: person.name || "Unnamed",
        email: person.email,
        phone: person.phone,
        college: person.college || "Not specified",
      };

      if (person.kinds.D1.size > 0) {
        const { enteredAt, exitedAt } = summarizeVisits(
          visits,
          FEST_DAY_1_IST
        );

        day1.push({
          ...shared,
          teamOrIndividual: classify(person.kinds.D1),
          enteredAt,
          exitedAt,
        });
      }

      if (person.kinds.D2.size > 0) {
        const { enteredAt, exitedAt } = summarizeVisits(
          visits,
          FEST_DAY_2_IST
        );

        day2.push({
          ...shared,
          teamOrIndividual: classify(person.kinds.D2),
          enteredAt,
          exitedAt,
        });
      }
    }

    const byName = (a: DayRow, b: DayRow) => a.name.localeCompare(b.name);

    day1.sort(byName);
    day2.sort(byName);

    if (new URL(request.url).searchParams.get("xlsx") !== "1") {
      return NextResponse.json({ success: true, day1, day2 });
    }

    const ExcelJS = (await import("exceljs")).default;

    const book = new ExcelJS.Workbook();
    book.creator = "V-TAPP Dashboard";

    const columns = [
      { header: "Name", key: "name", width: 28 },
      { header: "Email", key: "email", width: 32 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Team / Individual", key: "teamOrIndividual", width: 18 },
      { header: "College", key: "college", width: 32 },
      { header: "Entry time", key: "enteredAt", width: 20 },
      { header: "Exit time", key: "exitedAt", width: 20 },
    ];

    for (const [label, dayRows] of [
      ["Day 1", day1],
      ["Day 2", day2],
    ] as const) {
      const sheet = book.addWorksheet(label);

      sheet.columns = columns;
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      for (const row of dayRows) {
        sheet.addRow({
          name: row.name,
          email: row.email,
          phone: row.phone ?? "",
          teamOrIndividual: row.teamOrIndividual,
          college: row.college,
          enteredAt: row.enteredAt
            ? formatDateTimeIst(row.enteredAt)
            : "",
          exitedAt: row.exitedAt ? formatDateTimeIst(row.exitedAt) : "",
        });
      }
    }

    const buffer = await book.xlsx.writeBuffer();

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="vtapp-gate-days-${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Gate day-report API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to build the day participant list",
      },
      { status: 500 }
    );
  }
}
