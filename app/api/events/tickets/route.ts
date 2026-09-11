import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export type Spelling = {
  ticket: string;
  registrations: number;
  event_id: string | null;
  event_name: string | null;
  /* 'name' | 'alias' | 'nearly' | 'merchandise' | 'none' */
  matched_by: string;
};

/*
 * GET /api/events/tickets
 *
 * Every ticket name the portal has sold under, with how many
 * registrations carry it and which event it lands on.
 *
 * The interesting rows are the ones where two spellings reach one
 * event -- "Dance in the Dark" and "Glow in the Dark" were one event
 * split across two rows for four days before anybody noticed, and the
 * only way to see it was to already suspect it.
 */
export async function GET() {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { data, error } = await supabaseAdmin().rpc(
      "ticket_spellings"
    );

    /* 42883 / PGRST202: supabase/fuzzy-tickets.sql has not been run. */
    if (error?.code === "42883" || error?.code === "PGRST202") {
      return NextResponse.json(
        {
          error:
            "Run supabase/fuzzy-tickets.sql to list ticket spellings.",
        },
        { status: 409 }
      );
    }

    if (error) throw error;

    const spellings = (data ?? []) as Spelling[];

    /*
     * Which events more than one spelling reaches. Computed here
     * rather than in the client so the count and the list cannot
     * disagree, and rather than in SQL so the sheet stays one flat
     * table.
     */
    const perEvent = new Map<string, number>();

    for (const row of spellings) {
      if (!row.event_id) continue;

      perEvent.set(
        row.event_id,
        (perEvent.get(row.event_id) ?? 0) + 1
      );
    }

    const shared = [...perEvent.entries()]
      .filter(([, count]) => count > 1)
      .map(([eventId]) => eventId);

    return NextResponse.json({
      success: true,
      count: spellings.length,
      /* Events reached by more than one spelling. Each one is either
         a tolerated variation or a duplicate nobody has merged yet. */
      sharedEventIds: shared,
      unresolved: spellings
        .filter((row) => row.matched_by === "none")
        .reduce((sum, row) => sum + Number(row.registrations ?? 0), 0),
      spellings,
    });
  } catch (error) {
    console.error("Ticket spellings error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read ticket spellings",
      },
      { status: 500 }
    );
  }
}
