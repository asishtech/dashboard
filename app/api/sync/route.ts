import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { syncVtapp } from "@/lib/vtapp-sync";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  /*
   * Guarded: this calls the upstream V-TAPP API and rewrites
   * registration data, so it must not be reachable anonymously.
   */
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    /*
     * `resume` works from the payload the previous pass stored rather
     * than fetching 2.5 MB again. The upstream call is 7 to 17
     * seconds and the gateway allows thirty, so a run with real work
     * in it cannot fit in one request -- it takes as many as it
     * takes, and the browser presses again while `remaining` is
     * above zero.
     */
    const body = await request.json().catch(() => ({}));

    const result = await syncVtapp({ resume: body?.resume === true });

    /*
     * Signal every open page that the sync is fully complete.
     *
     * The sync writes rows to `registrations` throughout its run,
     * so Supabase Realtime fires mid-sync and open pages (events,
     * admin) refresh with partial data. They then go silent for up
     * to 2 minutes before the reconciliation poll corrects them.
     *
     * Writing to sync_log here — after every registration row has
     * been upserted — gives all subscribers a clean "done" signal.
     * They refresh once, at the end, with the complete dataset.
     *
     * The table is a single row (id = 1) that never grows.
     * A missing table is silently ignored: the sync result is
     * already correct and the Realtime signal is best-effort.
     */
    await supabaseAdmin()
      .from("sync_log")
      .upsert({ id: 1, synced_at: new Date().toISOString() });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Manual V-TAPP sync failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Sync failed",
      },
      { status: 500 }
    );
  }
}
