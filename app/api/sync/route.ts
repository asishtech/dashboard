import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { syncVtapp } from "@/lib/vtapp-sync";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST() {
  /*
   * Guarded: this calls the upstream V-TAPP API and rewrites
   * registration data, so it must not be reachable anonymously.
   */
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const result = await syncVtapp();

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
