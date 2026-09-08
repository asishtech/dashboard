import { NextResponse } from "next/server";
import { allowedEventIds, requireRole } from "@/lib/auth";
import { classifyPricing, type Pricing } from "@/lib/event-pricing";
import { merchandiseEventIds } from "@/lib/events";
import { supabaseAdmin } from "@/lib/supabase";
import { isTeamEvent, maxTeamSize } from "@/lib/team-events";
import {
  collegeFrom,
  emailFrom,
  parseRaw,
  phoneFrom,
} from "@/lib/form-fields";
import { readAll } from "@/lib/paged";

export const dynamic = "force-dynamic";

type Summary = {
  event_id: string;
  name: string;
  event_date: string | null;
  venue?: string | null;
  registrations: number;
  participants: number;
  scanned: number;
  revenue?: number;
  pricing?: string | null;
  paidRegistrations?: number;
  freeRegistrations?: number;
  externalRegistrations?: number;
  capacity?: number | null;
  capacityNote?: string | null;
  seatsRemaining?: number | null;
  fillPercentage?: number | null;
};

/*
 * A money figure off the organisers' sheet, as a number where it is
 * one.
 *
 * prize_pool and budget are free text and were typed by hand: "0/-",
 * "8775/-", "15000". A number is what a spreadsheet can total and
 * sort, so anything that parses cleanly is returned as one -- and
 * anything that does not ("TBD", "sponsor covering it") is returned
 * as the text it is, rather than as a zero that would quietly join
 * the sum.
 *
 * Commas are stripped because "1,20,000" is how the sheet writes it.
 */
function rupees(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "";

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "";
  }

  const text = value.trim();

  if (!text) return "";

  const cleaned = text.replace(/[,\s₹]/g, "").replace(/\/-$/, "");

  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : text;
}

/*
 * The advance paid before the event: 70% of the proposed budget.
 *
 * Only where the budget parsed as a number. Eight of the figures on
 * the organisers' sheet are words -- "above 7k only", "RC car for
 * winners" -- and 70% of a phrase is not a number to hand the finance
 * committee.
 */
const ADVANCE_SHARE = 0.7;

function advanceOn(budget: number | string | null | undefined) {
  const value = rupees(budget);

  return typeof value === "number"
    ? Math.round(value * ADVANCE_SHARE)
    : "";
}

type Participant = {
  id: number;
  registration_id: string | null;
  name: string | null;
  email: string | null;
  created_at: string | null;
  resolved_event_id: string | null;
  raw_data: unknown;
};

/*
 * GET /api/events/export?filter=empty|all|seats|teams|team-participants
 *
 * The events list as a real .xlsx.
 *
 * Built server-side: exceljs is a megabyte, and shipping it to a
 * phone on fest wifi to save a round-trip would be a poor trade. It
 * also means the file is identical whoever downloads it.
 */
export async function GET(request: Request) {
  const auth = await requireRole("admin", "faculty", "registrations");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const params = new URL(request.url).searchParams;

    const filter = params.get("filter");

    /*
     * Also a modifier, so it can stack with the team filter below.
     * "Which team events has nobody entered" needs both at once, and
     * one `filter` value cannot express two questions.
     */
    const onlyEmpty = filter === "empty" || params.get("empty") === "1";

    /*
     * A two-column sheet: event, seats left. Asked for as its own
     * thing rather than a column on the wide export, because it gets
     * printed and handed to people on a desk who do not need revenue
     * or check-in counts on the page.
     */
    const seatsOnly = filter === "seats";

    /* The events entered as teams, and separately the people in them. */
    const teamsOnly = filter === "teams";
    const teamPeople = filter === "team-participants";

    /*
     * The events nobody is signing up for, with somebody to ring
     * about it. Thirty percent by default and overridable, because
     * the number that means "worry" on Wednesday is not the one that
     * means it on Friday.
     */
    const quietOnly = filter === "quiet";

    const belowPercent = (() => {
      const asked = Number(params.get("below"));

      return Number.isFinite(asked) && asked > 0 && asked <= 100
        ? asked
        : 30;
    })();

    const [summaries, merchIds, allowed, teamSizes] =
      await Promise.all([
        supabaseAdmin().rpc("event_summaries"),
        merchandiseEventIds(),
        allowedEventIds(auth),
        supabaseAdmin()
          .from("events")
          .select(
            "event_id,team_size,registration_fee,prize_pool,budget,proposed_by,proposer_name"
          ),
      ]);

    const eventRows = (teamSizes.data ?? []) as {
      event_id: string;
      team_size: string | null;
      registration_fee: number | string | null;
      prize_pool: string | null;
      budget: string | null;
      /* Absent until supabase/event-proposers.sql runs. */
      proposed_by?: string | null;
      proposer_name?: string | null;
    }[];

    const teamSizeById = new Map(
      eventRows.map((row) => [String(row.event_id), row.team_size])
    );

    /* The organisers' own figures, straight off their sheet. */
    const moneyById = new Map(
      eventRows.map((row) => [
        String(row.event_id),
        {
          fee: row.registration_fee,
          prize: row.prize_pool,
          budget: row.budget,
          proposedBy: row.proposed_by ?? null,
          proposerName: row.proposer_name ?? null,
        },
      ])
    );

    if (summaries.error) throw summaries.error;

    const rows = ((summaries.data ?? []) as Summary[])
      /* Merchandise is stock, not a gate; it has its own screen. */
      .filter((event) => !merchIds.has(event.event_id))
      .filter(
        (event) =>
          allowed === null || allowed.includes(event.event_id)
      )
      .filter((event) =>
        onlyEmpty ? Number(event.registrations ?? 0) === 0 : true
      )
      /*
       * No capacity, no percentage, no judgement. Four events have
       * none -- the organisers' sheet simply gave no figure -- and
       * calling them 0% full would put them at the top of a list of
       * events to worry about on the strength of a missing number.
       */
      .filter((event) =>
        quietOnly
          ? event.capacity !== null &&
            event.capacity !== undefined &&
            Number(event.fillPercentage ?? 0) < belowPercent
          : true
      )
      /* No capacity means no answer to "how many left". */
      .filter((event) =>
        seatsOnly
          ? event.capacity !== null && event.capacity !== undefined
          : true
      )
      .filter((event) =>
        teamsOnly || teamPeople
          ? isTeamEvent(teamSizeById.get(String(event.event_id)))
          : true
      )
      .sort(
        (a, b) =>
          Number(b.registrations ?? 0) -
            Number(a.registrations ?? 0) ||
          a.name.localeCompare(b.name)
      );

    const isAdmin = auth.activeRole === "admin";

    const ExcelJS = (await import("exceljs")).default;

    const book = new ExcelJS.Workbook();

    book.creator = "V-TAPP Dashboard";
    book.created = new Date();

    const sheet = book.addWorksheet(
      seatsOnly
        ? "Seats left"
        : quietOnly
          ? `Under ${belowPercent}%`
          : teamPeople
          ? "Team participants"
          : teamsOnly
            ? "Team events"
            : onlyEmpty
              ? "No registrations"
              : "Events"
    );

    if (seatsOnly) {
      sheet.columns = [
        { header: "Event", key: "name", width: 56 },
        { header: "Seats left", key: "seats", width: 12 },
      ];

      const head = sheet.getRow(1);
      head.font = { bold: true };
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      /* Fewest seats first: the point of this sheet is what is about
         to run out, not an alphabetical inventory. */
      for (const event of [...rows].sort(
        (a, b) =>
          Number(a.seatsRemaining ?? 0) - Number(b.seatsRemaining ?? 0)
      )) {
        const left = Number(event.seatsRemaining ?? 0);

        const row = sheet.addRow({
          name: event.name,
          /* Negative is the truth, not zero: an event 14 past its cap
             is a different problem from one exactly full. */
          seats: left,
        });

        if (left <= 0) {
          row.getCell("seats").font = {
            bold: true,
            color: { argb: "FFB00020" },
          };
        }
      }

      const buffer = await book.xlsx.writeBuffer();

      return new NextResponse(buffer as ArrayBuffer, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="vtapp-seats-left-${new Date()
            .toISOString()
            .slice(0, 10)}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    /*
     * The quiet events, and who to ring about each one.
     *
     * A list of under-filled events is a report; the same list with a
     * coordinator's address against each row is something somebody
     * can act on before the doors open, which is the only reason to
     * ask two days out.
     */
    if (quietOnly) {
      const { data: coordinators, error: coordError } =
        await supabaseAdmin()
          .from("event_coordinators")
          .select("event_id,name,email,kind");

      if (coordError) throw coordError;

      /*
       * Faculty by address, not by label.
       *
       * `kind` is typed in and disagrees with reality: 5 coordinators
       * marked "student" hold @vitap.ac.in staff addresses -- among
       * them "Dr. Bileesh P Babu" and "P. Ravikumar" -- and one
       * marked "faculty" is on a student address. Trusting the label
       * would have left five of these events looking as though no
       * member of staff was attached to them.
       *
       * Students are @vitapstudent.ac.in and staff are @vitap.ac.in,
       * which is a fact about the university's mail rather than about
       * a spreadsheet column, so it is the sounder test. The label is
       * still honoured where the address says nothing.
       */
      const facultyByEvent = new Map<
        string,
        { name: string | null; email: string }[]
      >();

      for (const row of (coordinators ?? []) as {
        event_id: string;
        name: string | null;
        email: string;
        kind: string | null;
      }[]) {
        const staff =
          /@vitap\.ac\.in\s*$/i.test(row.email ?? "") ||
          /@vitap\.ac\.in\s*,/i.test(row.email ?? "") ||
          row.kind === "faculty";

        if (!staff) continue;

        const key = String(row.event_id);
        const list = facultyByEvent.get(key) ?? [];

        list.push({ name: row.name, email: row.email });
        facultyByEvent.set(key, list);
      }

      /* The one sheet already created above, named for this filter --
         adding another would leave an empty "Events" tab beside it. */
      const quiet = sheet;

      quiet.columns = [
        { header: "Event", key: "name", width: 52 },
        { header: "Proposed by", key: "proposedBy", width: 13 },
        { header: "Club / Chapter / Faculty", key: "proposerName", width: 30 },
        { header: "Registrations", key: "registrations", width: 13 },
        { header: "Capacity", key: "capacity", width: 10 },
        { header: "Filled %", key: "fill", width: 9 },
        { header: "Prize money", key: "prize", width: 13 },
        { header: "Registration cost", key: "fee", width: 16 },
        { header: "Proposed budget", key: "budget", width: 16 },
        /* 70% of the budget, paid up front. Blank where the budget is
           not a number -- 70% of "above 7k only" is not a figure to
           put in front of the finance committee. */
        { header: "Advance (70%)", key: "advance", width: 14 },
        ...(isAdmin
          ? [
              {
                header: "Revenue generated",
                key: "revenue",
                width: 16,
              },
            ]
          : []),
        { header: "Faculty coordinator", key: "coordinator", width: 30 },
        { header: "Email", key: "email", width: 34 },
      ];

      const head = quiet.getRow(1);
      head.font = { bold: true };
      head.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3E6DA" },
      };
      quiet.views = [{ state: "frozen", ySplit: 1 }];

      /*
       * Fewest registrations first: the worst-off event is the first
       * row, and the sheet is worked down. Fill percentage breaks
       * ties, so 3 of 40 sits above 3 of 400.
       */
      for (const event of [...rows].sort(
        (a, b) =>
          Number(a.registrations ?? 0) - Number(b.registrations ?? 0) ||
          Number(a.fillPercentage ?? 0) - Number(b.fillPercentage ?? 0)
      )) {
        const faculty = facultyByEvent.get(String(event.event_id)) ?? [];
        const money = moneyById.get(String(event.event_id));

        const row = quiet.addRow({
          name: event.name,
          registrations: Number(event.registrations ?? 0),
          capacity: event.capacity ?? "",
          fill: Number(event.fillPercentage ?? 0) / 100,
          proposedBy: money?.proposedBy ?? "Not recorded",
          proposerName: money?.proposerName ?? "",
          prize: rupees(money?.prize),
          fee: rupees(money?.fee),
          budget: rupees(money?.budget),
          advance: advanceOn(money?.budget),
          ...(isAdmin
            ? { revenue: Number(event.revenue ?? 0) }
            : {}),
          /* Said, not left blank. A gap in a column reads as a bug in
             the export; "None recorded" reads as the job it is. */
          coordinator:
            faculty.length > 0
              ? faculty
                  .map((person) => person.name ?? "Name not recorded")
                  .join("; ")
              : "None recorded",
          email: faculty.map((person) => person.email).join("; "),
        });

        if (faculty.length === 0) {
          row.getCell("coordinator").font = {
            bold: true,
            color: { argb: "FFB00020" },
          };
        }
      }

      quiet.getColumn("fill").numFmt = "0%";

      /* Only the cells that parsed as numbers are formatted as money;
         a cell still holding "TBD" is left as the text it is. */
      for (const key of ["prize", "fee", "budget", "advance"]) {
        quiet.getColumn(key).numFmt = '"\u20B9"#,##0';
      }

      if (isAdmin) {
        quiet.getColumn("revenue").numFmt = '"\u20B9"#,##0';
      }

      quiet.addRow({});

      /* Only the rows whose figures are numbers are summed, and the
         label says how many that was -- a total under a column with
         eight words in it would otherwise read as the whole festival's
         budget. */
      const numericBudgets = rows
        .map((event) =>
          rupees(moneyById.get(String(event.event_id))?.budget)
        )
        .filter((value): value is number => typeof value === "number");

      const budgetTotal = numericBudgets.reduce(
        (sum, value) => sum + value,
        0
      );

      const total = quiet.addRow({
        name: `${rows.length} event${
          rows.length === 1 ? "" : "s"
        } under ${belowPercent}% full` +
          (numericBudgets.length < rows.length
            ? ` · budget totals ${numericBudgets.length} of them`
            : ""),
        registrations: rows.reduce(
          (sum, event) => sum + Number(event.registrations ?? 0),
          0
        ),
        budget: budgetTotal,
        advance: Math.round(budgetTotal * ADVANCE_SHARE),
        ...(isAdmin
          ? {
              revenue: rows.reduce(
                (sum, event) => sum + Number(event.revenue ?? 0),
                0
              ),
            }
          : {}),
      });

      total.font = { bold: true };

      const quietBuffer = await book.xlsx.writeBuffer();

      return new NextResponse(quietBuffer as ArrayBuffer, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="vtapp-under-${belowPercent}-percent-${new Date()
            .toISOString()
            .slice(0, 10)}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    /*
     * Everybody registered for a team event, one row each.
     *
     * One row each, and not one row per team, because there are no
     * teams in the data. The feed carries a registration per person
     * with nothing linking them: no team name, no captain, no shared
     * order -- 1,000 sampled registrations gave 0 order_ids covering
     * more than one of them. So this is the roster of people entering
     * team events, and who stands with whom is settled at the venue.
     */
    if (teamPeople) {
      const ids = rows.map((event) => String(event.event_id));

      const db = supabaseAdmin();

      const [people, scans] = await Promise.all([
        ids.length === 0
          ? Promise.resolve({ rows: [] as Participant[] })
          : readAll<Participant>((from, to) =>
              db
                .from("registrations")
                .select(
                  "id,registration_id,name,email,created_at,resolved_event_id,raw_data"
                )
                .in("resolved_event_id", ids)
                .order("id", { ascending: true })
                .range(from, to)
            ),

        /*
         * Every scan rather than the ones for these registrations:
         * `in` on a couple of thousand ids is a URL no proxy will
         * carry, and the whole table is three columns.
         */
        readAll<{
          registration_id: number;
          scanned_at: string | null;
        }>((from, to) =>
          db
            .from("qr_scans")
            .select("registration_id,scanned_at")
            .order("id", { ascending: true })
            .range(from, to)
        ),
      ]);

      const enteredAt = new Map<number, string>();

      for (const scan of scans.rows) {
        const at = scan.scanned_at ?? "";

        /* First scan wins: that is when they came in. */
        if (at && !enteredAt.has(Number(scan.registration_id))) {
          enteredAt.set(Number(scan.registration_id), at);
        }
      }

      const eventById = new Map(rows.map((e) => [String(e.event_id), e]));

      const sorted = [...people.rows].sort((a, b) => {
        const left = eventById.get(String(a.resolved_event_id));
        const right = eventById.get(String(b.resolved_event_id));

        return (
          (left?.name ?? "").localeCompare(right?.name ?? "") ||
          (a.name ?? "").localeCompare(b.name ?? "")
        );
      });

      const built = sorted.map((person) => {
        const event = eventById.get(String(person.resolved_event_id));
        const size = teamSizeById.get(String(person.resolved_event_id));
        const raw = parseRaw(person.raw_data);
        const entered = enteredAt.get(person.id);

        return {
          event: event?.name ?? person.resolved_event_id ?? "",
          team: size ?? "",
          max: maxTeamSize(size) ?? "",
          name: person.name ?? "",
          email: person.email?.trim() || emailFrom(raw),
          phone: phoneFrom(raw),
          college: collegeFrom(raw),
          registration_id: person.registration_id ?? "",
          registered: person.created_at
            ? new Date(person.created_at).toLocaleString("en-IN")
            : "",
          checkedIn: entered
            ? new Date(entered).toLocaleString("en-IN")
            : "",
        };
      });

      /*
       * Phone is dropped when nobody has one.
       *
       * Only some forms ask for a number, and today none of the team
       * events do -- all 157 phone numbers in the feed came in on
       * merchandise orders. A "Phone" heading over 1,010 blank cells
       * reads as an export that failed rather than as a question that
       * was never asked, so the column appears only once an answer
       * exists.
       */
      const anyPhone = built.some((row) => row.phone);

      sheet.columns = [
        { header: "Event", key: "event", width: 40 },
        { header: "Team size", key: "team", width: 22 },
        { header: "Max per team", key: "max", width: 13 },
        { header: "Name", key: "name", width: 28 },
        { header: "Email", key: "email", width: 32 },
        ...(anyPhone
          ? [{ header: "Phone", key: "phone", width: 15 }]
          : []),
        { header: "College", key: "college", width: 34 },
        { header: "Registration ID", key: "registration_id", width: 16 },
        { header: "Registered", key: "registered", width: 20 },
        { header: "Checked in", key: "checkedIn", width: 20 },
      ];

      const head = sheet.getRow(1);
      head.font = { bold: true };
      head.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3E6DA" },
      };
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      for (const row of built) {
        sheet.addRow(row);
      }

      sheet.addRow({});

      const summary = sheet.addRow({
        event: `${sorted.length} registration${
          sorted.length === 1 ? "" : "s"
        } across ${rows.length} team event${
          rows.length === 1 ? "" : "s"
        }`,
      });

      summary.font = { bold: true };

      const teamBuffer = await book.xlsx.writeBuffer();

      return new NextResponse(teamBuffer as ArrayBuffer, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="vtapp-team-participants-${new Date()
            .toISOString()
            .slice(0, 10)}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    sheet.columns = [
      { header: "Event", key: "name", width: 46 },
      ...(teamsOnly
        ? [{ header: "Team size", key: "team", width: 22 }]
        : []),
      { header: "Day", key: "day", width: 10 },
      { header: "Venue", key: "venue", width: 22 },
      { header: "Pricing", key: "pricing", width: 10 },
      { header: "Registrations", key: "registrations", width: 14 },
      { header: "Participants", key: "participants", width: 13 },
      { header: "Checked in", key: "scanned", width: 12 },
      { header: "External", key: "external", width: 10 },
      { header: "Capacity", key: "capacity", width: 10 },
      { header: "Seats left", key: "seats", width: 11 },
      { header: "Filled %", key: "fill", width: 9 },
      ...(isAdmin
        ? [{ header: "Revenue", key: "revenue", width: 12 }]
        : []),
      { header: "Event ID", key: "event_id", width: 34 },
    ];

    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF3E6DA" },
    };

    /* Freeze it, so scrolling 89 rows keeps the column names. */
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const event of rows) {
      const registrations = Number(event.registrations ?? 0);

      sheet.addRow({
        name: event.name,
        ...(teamsOnly
          ? { team: teamSizeById.get(String(event.event_id)) ?? "" }
          : {}),
        day: event.event_date ?? "",
        venue: event.venue ?? "",
        pricing: classifyPricing(event) as Pricing,
        registrations,
        participants: Number(event.participants ?? 0),
        scanned: Number(event.scanned ?? 0),
        external: Number(event.externalRegistrations ?? 0),
        capacity: event.capacity ?? "",
        seats: event.seatsRemaining ?? "",
        fill:
          event.fillPercentage === null ||
          event.fillPercentage === undefined
            ? ""
            : Number(event.fillPercentage) / 100,
        ...(isAdmin ? { revenue: Number(event.revenue ?? 0) } : {}),
        event_id: event.event_id,
      });
    }

    sheet.getColumn("fill").numFmt = "0%";

    if (isAdmin) {
      sheet.getColumn("revenue").numFmt = '"₹"#,##0';
    }

    /*
     * Red fill on a zero, so the empty events are findable in the
     * "all" export too rather than only in the filtered one.
     */
    sheet.eachRow((row, index) => {
      if (index === 1) return;

      if (Number(row.getCell("registrations").value ?? 0) === 0) {
        row.getCell("registrations").font = {
          bold: true,
          color: { argb: "FFB00020" },
        };
      }
    });

    /* A totals line, so the sheet answers "how many" on its own. */
    sheet.addRow({});

    const total = sheet.addRow({
      name: `${rows.length} event${rows.length === 1 ? "" : "s"}`,
      registrations: rows.reduce(
        (sum, event) => sum + Number(event.registrations ?? 0),
        0
      ),
      ...(isAdmin
        ? {
            revenue: rows.reduce(
              (sum, event) => sum + Number(event.revenue ?? 0),
              0
            ),
          }
        : {}),
    });

    total.font = { bold: true };

    const buffer = await book.xlsx.writeBuffer();

    const stamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="vtapp-${
          teamsOnly
            ? onlyEmpty
              ? "team-events-with-no-registrations"
              : "team-events"
            : onlyEmpty
              ? "events-with-no-registrations"
              : "events"
        }-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Events export failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to build the spreadsheet",
      },
      { status: 500 }
    );
  }
}
