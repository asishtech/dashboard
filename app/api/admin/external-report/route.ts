import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { formatDateTimeIst } from "@/lib/format-time";
import {
  collegeFrom,
  emailFrom,
  originFrom,
  parseRaw,
  phoneFrom,
} from "@/lib/form-fields";
import { readAll } from "@/lib/paged";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const HOSTEL_EVENT_ID = "516";

type Registration = {
  id: number;
  event_id: string | number | null;
  name: string | null;
  email: string | null;
  product_meta: string | null;
  raw_data: unknown;
};

type Scan = {
  registration_id: number;
  created_at: string;
  exited_at: string | null;
  block: string | null;
  room: string | null;
};

export type ExternalReportRow = {
  name: string;
  email: string;
  college: string;
  phone: string | null;
  hostelEnrolled: boolean;
  /* Null while enrolled but nobody has recorded a block yet -- the
     page shows "Not updated" for that case, "-" for not enrolled at
     all. Kept as two different nulls' worth of meaning rather than
     one string, so a spreadsheet and a page can each word it their
     own way. */
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

/* Same day-parsing as lib for the Hostel tab (app/api/admin/hostel) --
   duplicated rather than imported because that route's version is
   colocated with its own combo-shaped types; this is the one other
   place that needs "which day" out of a ticket string. */
function parseHostelDay(ticket: string): string | null {
  const text = ticket.toLowerCase();

  if (/day\s*1.*day\s*2|day\s*2.*day\s*1/.test(text)) {
    return "Day 1 + Day 2";
  }

  if (/\bday\s*1\b/.test(text)) return "Day 1";
  if (/\bday\s*2\b/.test(text)) return "Day 2";

  return null;
}

async function buildReport(): Promise<ExternalReportRow[]> {
  const db = supabaseAdmin();

  const { rows } = await readAll<Registration>((from, to) =>
    db
      .from("registrations")
      .select("id,event_id,name,email,product_meta,raw_data")
      .order("id", { ascending: true })
      .range(from, to)
  );

  type Person = {
    name: string;
    email: string;
    college: string;
    phone: string | null;
    hostelRegistrationId: number | null;
    hostelTicket: string;
  };

  const people = new Map<string, Person>();

  for (const row of rows) {
    const raw = parseRaw(row.raw_data);
    const email = (row.email?.trim() || emailFrom(raw)).toLowerCase();

    if (!email) continue;

    if (originFrom(raw, email) !== "external") continue;

    const college = collegeFrom(raw);
    const phone = phoneFrom(raw);
    const isHostel = String(row.event_id ?? "") === HOSTEL_EVENT_ID;

    const existing = people.get(email);

    if (!existing) {
      people.set(email, {
        name: row.name || "",
        email,
        college,
        phone: phone || null,
        hostelRegistrationId: isHostel ? row.id : null,
        hostelTicket: isHostel ? getTicket(row.product_meta) : "",
      });

      continue;
    }

    /* Later registrations only fill in what an earlier one left
       blank -- the first non-empty answer for each field wins,
       rather than the last registration silently overwriting a
       college someone already typed correctly. */
    if (!existing.name && row.name) existing.name = row.name;
    if (!existing.college && college) existing.college = college;
    if (!existing.phone && phone) existing.phone = phone;

    if (isHostel && existing.hostelRegistrationId === null) {
      existing.hostelRegistrationId = row.id;
      existing.hostelTicket = getTicket(row.product_meta);
    }
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

  const report: ExternalReportRow[] = [...people.values()].map(
    (person) => {
      const scan =
        person.hostelRegistrationId !== null
          ? scanByRegistration.get(person.hostelRegistrationId)
          : undefined;

      return {
        name: person.name || "Unnamed",
        email: person.email,
        college: person.college || "Not specified",
        phone: person.phone,
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
    }
  );

  report.sort((a, b) => a.name.localeCompare(b.name));

  return report;
}

/*
 * GET /api/admin/external-report        -- every external participant
 * GET /api/admin/external-report?xlsx=1 -- the same, as a spreadsheet
 *
 * "External" here means the same thing it means on /admin/external:
 * an email domain that is not @vitap.ac.in / @vitapstudent.ac.in, or a
 * university named on the form that does not resolve to VIT-AP --
 * across every registration they hold, not only a hostel booking.
 * Someone who only ever booked accommodation is still on this list;
 * someone who registered for an event and never touched the hostel
 * shows up with hostelEnrolled: false.
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
      { header: "College", key: "college", width: 32 },
      { header: "Phone", key: "phone", width: 16 },
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
        college: row.college,
        phone: row.phone ?? "",
        hostelEnrolled: row.hostelEnrolled ? "Yes" : "No",
        block: row.hostelEnrolled
          ? (row.block ?? "Not updated")
          : "",
        room: row.hostelEnrolled ? (row.room ?? "") : "",
        enteredAt: row.enteredAt
          ? formatDateTimeIst(row.enteredAt)
          : "",
        exitedAt: row.exitedAt
          ? formatDateTimeIst(row.exitedAt)
          : "",
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
