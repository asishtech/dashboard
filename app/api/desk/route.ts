import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MISSING = ["42883", "PGRST202", "42P01"];

/*
 * GET /api/desk?q=...&external=1
 *
 * Find a person by name, email, phone or registration number.
 *
 * `external=1` narrows to visitors, which is what the registrations
 * desk works with; without it the search covers everybody, which is
 * what "where is this person" needs.
 */
export async function GET(request: Request) {
  const auth = await requireRole("admin", "registrations");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const params = new URL(request.url).searchParams;

    const query = (params.get("q") ?? "").trim();

    if (query.length < 3) {
      return NextResponse.json(
        { error: "Type at least three characters" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin().rpc("desk_search", {
      p_query: query,
      p_external_only: params.get("external") === "1",
    });

    if (error && MISSING.includes(error.code ?? "")) {
      return NextResponse.json(
        {
          error:
            "Run supabase/desk-tools.sql to enable the desk search.",
        },
        { status: 409 }
      );
    }

    if (error) throw error;

    return NextResponse.json({ success: true, people: data ?? [] });
  } catch (error) {
    console.error("Desk search error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Search failed",
      },
      { status: 500 }
    );
  }
}
