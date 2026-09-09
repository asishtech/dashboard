import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { originFrom } from "@/lib/form-fields";
import { publicOrigin } from "@/lib/origin";
import { readAll } from "@/lib/paged";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/*
 * Upstream event id for the food-and-accommodation booking. Unlike
 * merchandise (513), there is no `events` row to resolve through --
 * registrations already carry this literally, so no lookup is needed.
 */
const HOSTEL_EVENT_ID = "516";

const ORIGIN_LABEL = {
  internal: "Internal",
  external: "External",
  unknown: "Unknown",
} as const;

type Field = { field_name?: string; field_value?: string };

type Registration = {
  id: number;
  registration_id: string;
  name: string | null;
  email: string | null;
  product_meta: string | null;
  qr_token: string | null;
  raw_data: { field_values?: Field[] } | null;
};

type Scan = {
  registration_id: number;
  created_at: string;
  exited_at: string | null;
  block: string | null;
  room: string | null;
};

export type HostelGuest = {
  id: number;
  registration_id: string;
  qr_token: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  origin: "internal" | "external" | "unknown";
  day: string | null;
  accommodation: string | null;
  entered_at: string | null;
  exited_at: string | null;
  block: string | null;
  room: string | null;
};

function field(fields: Field[] | undefined, name: string) {
  return (
    fields
      ?.find(
        (f) =>
          String(f.field_name ?? "").trim().toLowerCase() === name
      )
      ?.field_value?.trim() || null
  );
}

/*
 * The ticket string carries both which day and what kind of room, in
 * whatever order and casing the booking form happened to save --
 * "Day 1 AC Room with Food per day", "Day 2 NON AC Room with Food",
 * "AC Room with Food per Day" with no day at all. Parsed once here
 * rather than left for every screen that reads this to guess at again.
 */
function parseTicket(ticket: string): {
  day: string | null;
  accommodation: string | null;
} {
  const text = ticket.toLowerCase();

  const day =
    /day\s*1.*day\s*2|day\s*2.*day\s*1/.test(text)
      ? "Day 1 + Day 2"
      : /\bday\s*1\b/.test(text)
        ? "Day 1"
        : /\bday\s*2\b/.test(text)
          ? "Day 2"
          : null;

  const accommodation = /non[\s-]?ac\b/.test(text)
    ? "Non-AC Room with Food"
    : /\bac\s+room/.test(text)
      ? "AC Room with Food"
      : null;

  return { day, accommodation };
}

function getTicket(productMeta: string | null) {
  return (
    String(productMeta ?? "").match(/Ticket:\s*(.*)$/i)?.[1]?.trim() ??
    ""
  );
}

async function loadGuests(): Promise<HostelGuest[]> {
  const db = supabaseAdmin();

  const { rows } = await readAll<Registration>((from, to) =>
    db
      .from("registrations")
      .select(
        "id,registration_id,name,email,product_meta,qr_token,raw_data"
      )
      .eq("event_id", HOSTEL_EVENT_ID)
      .order("id", { ascending: true })
      .range(from, to)
  );

  /*
   * qr_scans is one row per registration (see supabase/event-checkin.sql's
   * unique index), so a single map lookup is enough -- no aggregation
   * needed the way registration_items has to be grouped.
   */
  const scanByRegistration = new Map<number, Scan>();

  if (rows.length > 0) {
    const registrationIds = rows.map((row) => row.id);

    const withHostelColumns = await db
      .from("qr_scans")
      .select("registration_id,created_at,exited_at,block,room")
      .in("registration_id", registrationIds);

    /*
     * 42703: supabase/hostel-checkin.sql has not been run yet.
     * PostgREST rejects the whole select when one requested column is
     * missing, not just that column -- so falling straight through
     * would blank out entered_at and exited_at too, which have
     * existed since supabase/event-exit.sql and have nothing to do
     * with this migration. Re-read without the two new columns rather
     * than lose check-in status over them.
     */
    const result =
      withHostelColumns.error?.code === "42703"
        ? await db
            .from("qr_scans")
            .select("registration_id,created_at,exited_at")
            .in("registration_id", registrationIds)
        : withHostelColumns;

    if (result.error) {
      throw result.error;
    }

    for (const scan of result.data ?? []) {
      scanByRegistration.set(scan.registration_id, {
        block: null,
        room: null,
        ...scan,
      });
    }
  }

  const guests: HostelGuest[] = rows.map((row) => {
    const fields = row.raw_data?.field_values;
    const { day, accommodation } = parseTicket(
      getTicket(row.product_meta)
    );
    const scan = scanByRegistration.get(row.id);

    const email = field(fields, "email") || row.email;

    return {
      id: row.id,
      registration_id: row.registration_id,
      qr_token: row.qr_token,
      /* The field on the form asks who is actually staying;
         the registration's own name is often whoever paid. */
      name: field(fields, "student name") || row.name || "",
      phone: field(fields, "mobile"),
      email,
      origin: originFrom(row.raw_data, email ?? ""),
      day,
      accommodation,
      entered_at: scan?.created_at ?? null,
      exited_at: scan?.exited_at ?? null,
      block: scan?.block ?? null,
      room: scan?.room ?? null,
    };
  });

  guests.sort((a, b) => a.name.localeCompare(b.name));

  return guests;
}

/*
 * GET /api/admin/hostel            -- the list, with check-in status
 * GET /api/admin/hostel?xlsx=1     -- the same thing as a spreadsheet
 * GET /api/admin/hostel?pdf=1      -- one QR pass per guest, printable
 *
 * Read-only, so the registrations desk sees it too -- same as
 * Registrations, Inventory and External.
 */
export async function GET(request: Request) {
  const auth = await requireRole("admin", "registrations");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const guests = await loadGuests();

    const params = new URL(request.url).searchParams;

    if (params.get("pdf") === "1") {
      const withQr = guests.filter(
        (guest): guest is HostelGuest & { qr_token: string } =>
          Boolean(guest.qr_token)
      );

      const { buildHostelPassesPdf } = await import(
        "@/lib/hostel-pdf"
      );

      const buffer = await buildHostelPassesPdf(
        withQr.map((guest) => ({
          registration_id: guest.registration_id,
          qr_token: guest.qr_token,
          name: guest.name,
          day: guest.day,
          accommodation: guest.accommodation,
        })),
        publicOrigin(request)
      );

      return new NextResponse(buffer as unknown as ArrayBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="vtapp-hostel-passes-${new Date()
            .toISOString()
            .slice(0, 10)}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const summary = {
      total: guests.length,
      checkedIn: guests.filter((g) => g.entered_at).length,
      inside: guests.filter((g) => g.entered_at && !g.exited_at)
        .length,
      exited: guests.filter((g) => g.exited_at).length,
    };

    if (params.get("xlsx") !== "1") {
      return NextResponse.json({ success: true, guests, summary });
    }

    const ExcelJS = (await import("exceljs")).default;

    const book = new ExcelJS.Workbook();
    book.creator = "V-TAPP Dashboard";

    const sheet = book.addWorksheet("Hostel");

    sheet.columns = [
      { header: "Name", key: "name", width: 28 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Email", key: "email", width: 32 },
      { header: "Internal / External", key: "origin", width: 18 },
      { header: "Day", key: "day", width: 16 },
      { header: "Accommodation", key: "accommodation", width: 22 },
      { header: "Block", key: "block", width: 10 },
      { header: "Room", key: "room", width: 10 },
      { header: "Checked in", key: "entered_at", width: 20 },
      { header: "Exited", key: "exited_at", width: 20 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const guest of guests) {
      sheet.addRow({
        name: guest.name,
        phone: guest.phone ?? "",
        email: guest.email ?? "",
        origin: ORIGIN_LABEL[guest.origin],
        day: guest.day ?? "Not specified",
        accommodation: guest.accommodation ?? "Not specified",
        block: guest.block ?? "",
        room: guest.room ?? "",
        entered_at: guest.entered_at
          ? new Date(guest.entered_at).toLocaleString("en-IN")
          : "",
        exited_at: guest.exited_at
          ? new Date(guest.exited_at).toLocaleString("en-IN")
          : "",
      });
    }

    const buffer = await book.xlsx.writeBuffer();

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="vtapp-hostel-${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Hostel registrations API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read hostel registrations",
      },
      { status: 500 }
    );
  }
}
