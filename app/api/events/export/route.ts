import { NextResponse } from "next/server";
import { allowedEventIds, requireRole } from "@/lib/auth";
import { classifyPricing, type Pricing } from "@/lib/event-pricing";
import { merchandiseEventIds } from "@/lib/events";
import { supabaseAdmin } from "@/lib/supabase";

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
 * GET /api/events/export?filter=empty|all
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
    const onlyEmpty =
      new URL(request.url).searchParams.get("filter") === "empty";

    const [summaries, merchIds, allowed] = await Promise.all([
      supabaseAdmin().rpc("event_summaries"),
      merchandiseEventIds(),
      allowedEventIds(auth),
    ]);

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
      onlyEmpty ? "No registrations" : "Events"
    );

    sheet.columns = [
      { header: "Event", key: "name", width: 46 },
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
          onlyEmpty ? "events-with-no-registrations" : "events"
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
