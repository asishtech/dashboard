import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { formatDateTimeIst } from "@/lib/format-time";
import {
  collegeFrom,
  emailFrom,
  originFrom,
  parseRaw,
  phoneFrom,
  type RawRegistration,
} from "@/lib/form-fields";
import { isTeamEvent } from "@/lib/team-events";
import { readAll } from "@/lib/paged";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const HOSTEL_EVENT_ID = "516";
const MERCH_EVENT_ID = "513";

type Registration = {
  id: number;
  event_id: string | number | null;
  resolved_event_id: string | null;
  name: string | null;
  email: string | null;
  product_meta: string | null;
  raw_data: unknown;
};

type EventInfo = {
  name: string;
  team_size: string | null;
};

type Scan = {
  registration_id: number;
  created_at: string;
  exited_at: string | null;
  block: string | null;
  room: string | null;
};

/*
 * One row per event a person is registered for -- the same person
 * repeats across rows if they entered more than one, with everything
 * that is true of *them* (contact details, hostel status) carried on
 * every one of their rows rather than only the first.
 */
export type ExternalReportRow = {
  name: string;
  email: string;
  phone: string | null;
  teamOrIndividual: "Team" | "Individual" | null;
  eventName: string | null;
  college: string;
  /* The state their hostel form named, if they have one -- the only
     form that asks. Null for someone with no hostel registration to
     read it from. */
  location: string | null;
  hostelEnrolled: boolean;
  /* Null while enrolled but nobody has recorded a block yet -- shown
     as "Not updated", distinct from "-" for not enrolled at all. */
  block: string | null;
  room: string | null;
  enteredAt: string | null;
  exitedAt: string | null;
  daysRegistered: string | null;
};

function getTicket(productMeta: string | null) {
  return (
    String(productMeta ?? "").match(/Ticket:\s*(.*)$/i)?.[1]?.trim() ??
    ""
  );
}

/* Same day-parsing as the Hostel tab (app/api/admin/hostel) --
   duplicated rather than imported because that route's version is
   colocated with its own combo-shaped types. */
function parseHostelDay(ticket: string): string | null {
  const text = ticket.toLowerCase();

  if (/day\s*1.*day\s*2|day\s*2.*day\s*1/.test(text)) {
    return "Day 1 + Day 2";
  }

  if (/\bday\s*1\b/.test(text)) return "Day 1";
  if (/\bday\s*2\b/.test(text)) return "Day 2";

  return null;
}

/*
 * The state named on the hostel form. Only that form asks -- a
 * regular event registration has no equivalent field at all, so
 * "location" only ever comes from someone's own hostel booking.
 */
function locationFrom(raw: RawRegistration): string | null {
  const field = raw?.field_values?.find((f) =>
    /state/i.test(f.field_name ?? "")
  );

  return field?.field_value?.trim() || null;
}

async function buildReport(): Promise<ExternalReportRow[]> {
  const db = supabaseAdmin();

  const [{ rows }, eventsResult] = await Promise.all([
    readAll<Registration>((from, to) =>
      db
        .from("registrations")
        .select(
          "id,event_id,resolved_event_id,name,email,product_meta,raw_data"
        )
        .order("id", { ascending: true })
        .range(from, to)
    ),

    db.from("events").select("event_id,name,team_size"),
  ]);

  if (eventsResult.error) throw eventsResult.error;

  const eventsById = new Map<string, EventInfo>(
    (eventsResult.data ?? []).map((row) => [
      String(row.event_id),
      { name: row.name, team_size: row.team_size },
    ])
  );

  type Person = {
    name: string;
    email: string;
    college: string;
    phone: string | null;
    hostelRegistrationId: number | null;
    hostelTicket: string;
    location: string | null;
    events: { name: string; isTeam: boolean }[];
  };

  const people = new Map<string, Person>();

  for (const row of rows) {
    const raw = parseRaw(row.raw_data);
    const email = (row.email?.trim() || emailFrom(raw)).toLowerCase();

    if (!email) continue;

    if (originFrom(raw, email) !== "external") continue;

    const college = collegeFrom(raw);
    const phone = phoneFrom(raw);

    const rawEventId = String(row.event_id ?? "");
    const isHostel = rawEventId === HOSTEL_EVENT_ID;
    const isMerch = rawEventId === MERCH_EVENT_ID;

    const existing = people.get(email);

    const person: Person =
      existing ??
      (() => {
        const created: Person = {
          name: row.name || "",
          email,
          college,
          phone: phone || null,
          hostelRegistrationId: null,
          hostelTicket: "",
          location: null,
          events: [],
        };

        people.set(email, created);

        return created;
      })();

    /* Later registrations only fill in what an earlier one left
       blank -- the first non-empty answer wins, rather than a later
       row silently overwriting a college someone already typed
       correctly. */
    if (!person.name && row.name) person.name = row.name;
    if (!person.college && college) person.college = college;
    if (!person.phone && phone) person.phone = phone;

    if (isHostel) {
      if (person.hostelRegistrationId === null) {
        person.hostelRegistrationId = row.id;
        person.hostelTicket = getTicket(row.product_meta);
      }

      if (!person.location) {
        person.location = locationFrom(raw);
      }

      continue;
    }

    /* Merchandise is not an event in the team/individual sense, so it
       gets no row of its own here -- same reasoning the events list
       already uses to keep it off /events. */
    if (isMerch) continue;

    const eventInfo = row.resolved_event_id
      ? eventsById.get(row.resolved_event_id)
      : undefined;

    const name =
      eventInfo?.name || getTicket(row.product_meta) || "Unmapped ticket";

    person.events.push({
      name,
      isTeam: isTeamEvent(eventInfo?.team_size),
    });
  }

  const hostelRegistrationIds = [...people.values()]
    .map((p) => p.hostelRegistrationId)
    .filter((id): id is number => id !== null);

  const scanByRegistration = new Map<number, Scan>();

  if (hostelRegistrationIds.length > 0) {
    const withHostelColumns = await db
      .from("qr_scans")
      .select("registration_id,created_at,exited_at,block,room")
      .in("registration_id", hostelRegistrationIds);

    /* 42703: supabase/hostel-checkin.sql has not been run. Entry and
       exit still show; block and room just come back empty -- same
       fallback as app/api/admin/hostel. */
    const result =
      withHostelColumns.error?.code === "42703"
        ? await db
            .from("qr_scans")
            .select("registration_id,created_at,exited_at")
            .in("registration_id", hostelRegistrationIds)
        : withHostelColumns;

    if (result.error) throw result.error;

    for (const scan of result.data ?? []) {
      scanByRegistration.set(scan.registration_id, {
        block: null,
        room: null,
        ...scan,
      });
    }
  }

  const report: ExternalReportRow[] = [];

  for (const person of people.values()) {
    const scan =
      person.hostelRegistrationId !== null
        ? scanByRegistration.get(person.hostelRegistrationId)
        : undefined;

    const shared = {
      name: person.name || "Unnamed",
      email: person.email,
      phone: person.phone,
      college: person.college || "Not specified",
      location: person.location,
      hostelEnrolled: person.hostelRegistrationId !== null,
      block: scan?.block ?? null,
      room: scan?.room ?? null,
      enteredAt: scan?.created_at ?? null,
      exitedAt: scan?.exited_at ?? null,
      daysRegistered:
        person.hostelRegistrationId !== null
          ? parseHostelDay(person.hostelTicket)
          : null,
    };

    if (person.events.length === 0) {
      report.push({
        ...shared,
        teamOrIndividual: null,
        eventName: null,
      });

      continue;
    }

    for (const event of person.events) {
      report.push({
        ...shared,
        teamOrIndividual: event.isTeam ? "Team" : "Individual",
        eventName: event.name,
      });
    }
  }

  report.sort(
    (a, b) =>
      a.name.localeCompare(b.name) ||
      (a.eventName ?? "").localeCompare(b.eventName ?? "")
  );

  return report;
}

/*
 * GET /api/admin/external-report        -- every external registration
 * GET /api/admin/external-report?xlsx=1 -- the same, as a spreadsheet
 *
 * "External" means the same thing it means on /admin/external: an
 * email domain that is not @vitap.ac.in / @vitapstudent.ac.in, or a
 * university named on the form that does not resolve to VIT-AP.
 * One row per event a person entered, not per person -- someone in
 * three events appears three times, each with the same contact and
 * hostel details repeated, since those are true of them regardless of
 * which row is showing.
 */
export async function GET(request: Request) {
  const auth = await requireRole("admin", "registrations");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const report = await buildReport();

    if (new URL(request.url).searchParams.get("xlsx") !== "1") {
      return NextResponse.json({ success: true, report });
    }

    const ExcelJS = (await import("exceljs")).default;

    const book = new ExcelJS.Workbook();
    book.creator = "V-TAPP Dashboard";

    const sheet = book.addWorksheet("External participants");

    sheet.columns = [
      { header: "Name", key: "name", width: 28 },
      { header: "Email", key: "email", width: 32 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Team / Individual", key: "teamOrIndividual", width: 16 },
      { header: "Event", key: "eventName", width: 32 },
      { header: "College", key: "college", width: 32 },
      { header: "Location", key: "location", width: 18 },
      { header: "Enrolled in hostel", key: "hostelEnrolled", width: 18 },
      { header: "Block", key: "block", width: 14 },
      { header: "Room", key: "room", width: 10 },
      { header: "Entry time", key: "enteredAt", width: 20 },
      { header: "Exit time", key: "exitedAt", width: 20 },
      { header: "Days registered for", key: "daysRegistered", width: 18 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const row of report) {
      sheet.addRow({
        name: row.name,
        email: row.email,
        phone: row.phone ?? "",
        teamOrIndividual: row.teamOrIndividual ?? "",
        eventName: row.eventName ?? "",
        college: row.college,
        location: row.location ?? "",
        hostelEnrolled: row.hostelEnrolled ? "Yes" : "No",
        block: row.hostelEnrolled ? (row.block ?? "Not updated") : "",
        room: row.hostelEnrolled ? (row.room ?? "") : "",
        enteredAt: row.enteredAt
          ? formatDateTimeIst(row.enteredAt)
          : "",
        exitedAt: row.exitedAt ? formatDateTimeIst(row.exitedAt) : "",
        daysRegistered: row.daysRegistered ?? "",
      });
    }

    const buffer = await book.xlsx.writeBuffer();

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="vtapp-external-participants-${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("External report API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to build the external participants report",
      },
      { status: 500 }
    );
  }
}
