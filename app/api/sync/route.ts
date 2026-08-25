import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { syncVtapp } from "@/lib/vtapp-sync";

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
