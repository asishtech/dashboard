import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const HOSTEL_EVENT_ID = "516";

/* IST, not the server's own timezone -- "the 11th" means the 11th at
   the fest, and a UTC day boundary would cut it 5.5 hours early. */
const IST_OFFSET = "+05:30";

function dayBoundsIst(date: string) {
  const start = new Date(`${date}T00:00:00${IST_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start: start.toISOString(), end: end.toISOString() };
}

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

type MerchDetailRow = {
  registration_id: string;
  name: string | null;
  email: string | null;
  item: string;
  size: string | null;
  quantity: number;
  given_at: string;
};

type HostelDetailRow = {
  registration_id: string;
  name: string | null;
  phone: string | null;
  block: string | null;
  room: string | null;
  entered_at: string;
  exited_at: string | null;
};

async function merchReport(date: string) {
  const { start, end } = dayBoundsIst(date);
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("distributions")
    .select(
      `
      given_at,
      item:registration_items(
        item,
        size,
        quantity,
        registration:registrations(registration_id,name,email)
      )
    `
    )
    .eq("status", "GIVEN")
    .gte("given_at", start)
    .lt("given_at", end)
    .order("given_at", { ascending: true });

  if (error) throw error;

  type ItemEmbed = {
    item: string;
    size: string | null;
    quantity: number | string | null;
    registration: RegistrationEmbed | RegistrationEmbed[] | null;
  };

  type RegistrationEmbed = {
    registration_id: string;
    name: string | null;
    email: string | null;
  };

  type Row = {
    given_at: string;
    item: ItemEmbed | ItemEmbed[] | null;
  };

  /* Supabase infers an embedded relation's cardinality from the
     schema, and returns an object for one-to-one and an array for
     one-to-many -- ambiguous enough here that it types this one as an
     array even though a distribution has exactly one item. Normalize
     both shapes rather than trust either. */
  function first<T>(value: T | T[] | null): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value;
  }

  const detail: MerchDetailRow[] = [];

  for (const row of (data ?? []) as unknown as Row[]) {
    const item = first(row.item);

    if (!item) continue;

    const registration = first(item.registration);

    detail.push({
      registration_id: registration?.registration_id ?? "",
      name: registration?.name ?? null,
      email: registration?.email ?? null,
      item: item.item,
      size: item.size,
      quantity: Number(item.quantity ?? 1),
      given_at: row.given_at,
    });
  }

  const countKey = (item: string, size: string | null) =>
    `${item} ${size ?? ""}`;

  const counts = new Map<
    string,
    { item: string; size: string | null; quantity: number }
  >();

  for (const row of detail) {
    const key = countKey(row.item, row.size);
    const existing = counts.get(key);

    if (existing) {
      existing.quantity += row.quantity;
    } else {
      counts.set(key, {
        item: row.item,
        size: row.size,
        quantity: row.quantity,
      });
    }
  }

  return {
    detail,
    counts: [...counts.values()].sort(
      (a, b) => a.item.localeCompare(b.item) || (a.size ?? "").localeCompare(b.size ?? "")
    ),
  };
}

async function hostelReport(date: string) {
  const { start, end } = dayBoundsIst(date);
  const db = supabaseAdmin();

  const withHostelColumns = await db
    .from("qr_scans")
    .select("registration_id,created_at,exited_at,block,room")
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: true });

  /* 42703: supabase/hostel-checkin.sql has not been run. Entry and
     exit still show; block and room just come back empty -- same
     fallback as app/api/admin/hostel. */
  const scansResult =
    withHostelColumns.error?.code === "42703"
      ? await db
          .from("qr_scans")
          .select("registration_id,created_at,exited_at")
          .gte("created_at", start)
          .lt("created_at", end)
          .order("created_at", { ascending: true })
      : withHostelColumns;

  if (scansResult.error) throw scansResult.error;

  const rows = (scansResult.data ?? []) as {
    registration_id: number;
    created_at: string;
    exited_at: string | null;
    block?: string | null;
    room?: string | null;
  }[];

  const registrationIds = [
    ...new Set(rows.map((r) => r.registration_id)),
  ];

  const hostelIds = new Set<number>();

  if (registrationIds.length > 0) {
    const { data: hostelRegs, error: hostelErr } = await db
      .from("registrations")
      .select("id")
      .eq("event_id", HOSTEL_EVENT_ID)
      .in("id", registrationIds);

    if (hostelErr) throw hostelErr;

    for (const row of hostelRegs ?? []) hostelIds.add(row.id);
  }

  const hostelScans = rows.filter((r) => hostelIds.has(r.registration_id));

  const { data: regs, error: regsErr } =
    hostelScans.length > 0
      ? await db
          .from("registrations")
          .select("id,registration_id,name,raw_data")
          .in(
            "id",
            hostelScans.map((r) => r.registration_id)
          )
      : { data: [], error: null };

  if (regsErr) throw regsErr;

  const regById = new Map((regs ?? []).map((r) => [r.id, r]));

  function phoneFromRaw(raw: unknown): string | null {
    const values = (raw as { field_values?: { field_name?: string; field_value?: string }[] })
      ?.field_values;

    for (const field of values ?? []) {
      if (!/(mobile|phone|contact|whatsapp)/i.test(field.field_name ?? "")) {
        continue;
      }

      const digits = (field.field_value ?? "").replace(/\D/g, "");

      if (digits.length >= 10) return digits;
    }

    return null;
  }

  const detail: HostelDetailRow[] = hostelScans.map((scan) => {
    const reg = regById.get(scan.registration_id);

    return {
      registration_id: reg?.registration_id ?? "",
      name: reg?.name ?? null,
      phone: phoneFromRaw(reg?.raw_data),
      block: (scan as { block?: string | null }).block ?? null,
      room: (scan as { room?: string | null }).room ?? null,
      entered_at: scan.created_at,
      exited_at: scan.exited_at,
    };
  });

  return {
    detail,
    total: detail.length,
  };
}

/*
 * GET /api/admin/daily-report?date=YYYY-MM-DD&domain=merch|hostel
 * GET ...&xlsx=1  -- the same, as a two-sheet spreadsheet
 *
 * One calendar day (in IST) of either merchandise collections or
 * hostel check-ins, with a second sheet totalling them -- by item and
 * size for merchandise, since "how many M hoodies went out today" is
 * the number a counter actually needs at the end of a shift.
 */
export async function GET(request: Request) {
  const auth = await requireRole("admin", "registrations");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const params = new URL(request.url).searchParams;

    const date = params.get("date") ?? "";
    const domain = params.get("domain") === "hostel" ? "hostel" : "merch";

    if (!DATE_FORMAT.test(date)) {
      return NextResponse.json(
        { error: "A date (YYYY-MM-DD) is required" },
        { status: 400 }
      );
    }

    if (domain === "merch") {
      const { detail, counts } = await merchReport(date);

      if (params.get("xlsx") !== "1") {
        return NextResponse.json({
          success: true,
          domain,
          date,
          count: detail.length,
          detail,
          counts,
        });
      }

      const ExcelJS = (await import("exceljs")).default;
      const book = new ExcelJS.Workbook();
      book.creator = "V-TAPP Dashboard";

      const detailSheet = book.addWorksheet("Collected");

      detailSheet.columns = [
        { header: "Registration ID", key: "registration_id", width: 16 },
        { header: "Name", key: "name", width: 26 },
        { header: "Email", key: "email", width: 32 },
        { header: "Item", key: "item", width: 24 },
        { header: "Size", key: "size", width: 12 },
        { header: "Quantity", key: "quantity", width: 10 },
        { header: "Given at", key: "given_at", width: 20 },
      ];

      detailSheet.getRow(1).font = { bold: true };
      detailSheet.views = [{ state: "frozen", ySplit: 1 }];

      for (const row of detail) {
        detailSheet.addRow({
          registration_id: row.registration_id,
          name: row.name ?? "",
          email: row.email ?? "",
          item: row.item,
          size: row.size ?? "",
          quantity: row.quantity,
          given_at: new Date(row.given_at).toLocaleString("en-IN"),
        });
      }

      const countSheet = book.addWorksheet("Count by size");

      countSheet.columns = [
        { header: "Item", key: "item", width: 24 },
        { header: "Size", key: "size", width: 12 },
        { header: "Quantity given", key: "quantity", width: 16 },
      ];

      countSheet.getRow(1).font = { bold: true };

      for (const row of counts) {
        countSheet.addRow({
          item: row.item,
          size: row.size ?? "One size",
          quantity: row.quantity,
        });
      }

      countSheet.addRow({});

      const total = countSheet.addRow({
        item: `${detail.length} item${detail.length === 1 ? "" : "s"} total`,
      });

      total.font = { bold: true };

      const buffer = await book.xlsx.writeBuffer();

      return new NextResponse(buffer as ArrayBuffer, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="vtapp-merch-${date}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const { detail, total } = await hostelReport(date);

    if (params.get("xlsx") !== "1") {
      return NextResponse.json({
        success: true,
        domain,
        date,
        count: detail.length,
        detail,
        total,
      });
    }

    const ExcelJS = (await import("exceljs")).default;
    const book = new ExcelJS.Workbook();
    book.creator = "V-TAPP Dashboard";

    const detailSheet = book.addWorksheet("Checked in");

    detailSheet.columns = [
      { header: "Registration ID", key: "registration_id", width: 16 },
      { header: "Name", key: "name", width: 26 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Block", key: "block", width: 12 },
      { header: "Room", key: "room", width: 10 },
      { header: "Entry time", key: "entered_at", width: 20 },
      { header: "Exit time", key: "exited_at", width: 20 },
    ];

    detailSheet.getRow(1).font = { bold: true };
    detailSheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const row of detail) {
      detailSheet.addRow({
        registration_id: row.registration_id,
        name: row.name ?? "",
        phone: row.phone ?? "",
        block: row.block ?? "Not updated",
        room: row.room ?? "",
        entered_at: new Date(row.entered_at).toLocaleString("en-IN"),
        exited_at: row.exited_at
          ? new Date(row.exited_at).toLocaleString("en-IN")
          : "",
      });
    }

    const countSheet = book.addWorksheet("Count");

    countSheet.columns = [
      { header: "", key: "label", width: 30 },
      { header: "", key: "value", width: 16 },
    ];

    countSheet.addRow({ label: "Checked in on this date", value: total });

    const buffer = await book.xlsx.writeBuffer();

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="vtapp-hostel-${date}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Daily report API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to build the report",
      },
      { status: 500 }
    );
  }
}
