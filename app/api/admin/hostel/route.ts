import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { readAll } from "@/lib/paged";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/*
 * Upstream event id for the food-and-accommodation booking. Unlike
 * merchandise (513), there is no `events` row to resolve through --
 * registrations already carry this literally, so no lookup is needed.
 */
const HOSTEL_EVENT_ID = "516";

type Field = { field_name?: string; field_value?: string };

type Registration = {
  id: number;
  registration_id: string;
  name: string | null;
  email: string | null;
  product_meta: string | null;
  raw_data: { field_values?: Field[] } | null;
};

export type HostelGuest = {
  id: number;
  registration_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  day: string | null;
  accommodation: string | null;
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

/*
 * GET /api/admin/hostel
 *
 * Everyone who booked food and accommodation, with the day and room
 * type parsed out of their ticket. Read-only, so the registrations
 * desk sees it too -- same as Registrations, Inventory and External.
 */
export async function GET() {
  const auth = await requireRole("admin", "registrations");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const db = supabaseAdmin();

    const { rows } = await readAll<Registration>((from, to) =>
      db
        .from("registrations")
        .select("id,registration_id,name,email,product_meta,raw_data")
        .eq("event_id", HOSTEL_EVENT_ID)
        .order("id", { ascending: true })
        .range(from, to)
    );

    const guests: HostelGuest[] = rows.map((row) => {
      const fields = row.raw_data?.field_values;
      const { day, accommodation } = parseTicket(
        getTicket(row.product_meta)
      );

      return {
        id: row.id,
        registration_id: row.registration_id,
        /* The field on the form asks who is actually staying;
           the registration's own name is often whoever paid. */
        name: field(fields, "student name") || row.name || "",
        phone: field(fields, "mobile"),
        email: field(fields, "email") || row.email,
        day,
        accommodation,
      };
    });

    guests.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, guests });
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
