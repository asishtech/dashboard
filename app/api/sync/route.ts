import { NextResponse } from "next/server";
import { syncVtapp } from "@/lib/vtapp-sync";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await syncVtapp();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "Manual V-TAPP sync failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Sync failed",
      },
      {
        status: 500,
      }
    );
  }
}
