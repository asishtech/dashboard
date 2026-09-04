import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MISSING = ["42883", "PGRST202", "42P01"];

type College = {
  name: string;
  key: string;
  registrations: number;
  people: number;
  events: number;
  revenue: number;
  spellings: number;
};

/*
 * GET /api/external          -- the colleges, grouped
 * GET /api/external?xlsx=1   -- the same thing as a spreadsheet
 *
 * Read-only, so the registrations desk sees it too.
 */
export async function GET(request: Request) {
  const auth = await requireRole("admin", "registrations");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { data, error } = await supabaseAdmin().rpc(
      "external_colleges"
    );

    if (error && MISSING.includes(error.code ?? "")) {
      return NextResponse.json({
        success: true,
        ready: false,
        reason:
          "Run supabase/external-colleges.sql to enable this view.",
      });
    }

    if (error) throw error;

    const payload = data as {
      totals: Record<string, number>;
      colleges: College[];
    };

    if (new URL(request.url).searchParams.get("xlsx") !== "1") {
      return NextResponse.json({
        success: true,
        ready: true,
        ...payload,
      });
    }

    const ExcelJS = (await import("exceljs")).default;

    const book = new ExcelJS.Workbook();
    book.creator = "V-TAPP Dashboard";

    const sheet = book.addWorksheet("External colleges");

    sheet.columns = [
      { header: "College", key: "name", width: 52 },
      { header: "Registrations", key: "registrations", width: 14 },
      { header: "People", key: "people", width: 10 },
      { header: "Events entered", key: "events", width: 15 },
      { header: "Revenue", key: "revenue", width: 12 },
      { header: "Spellings", key: "spellings", width: 10 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const college of payload.colleges) {
      sheet.addRow(college);
    }

    sheet.getColumn("revenue").numFmt = '"₹"#,##0';

    sheet.addRow({});

    const total = sheet.addRow({
      name: `${payload.colleges.length} colleges`,
      registrations: payload.totals.externalRegistrations,
      people: payload.totals.externalPeople,
      revenue: payload.totals.revenue,
    });

    total.font = { bold: true };

    const buffer = await book.xlsx.writeBuffer();

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="vtapp-external-colleges-${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("External colleges API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read external registrations",
      },
      { status: 500 }
    );
  }
}
