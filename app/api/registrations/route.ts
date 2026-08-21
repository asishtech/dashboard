import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { syncVtapp } from "@/lib/vtapp-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  try {

    /*
     * Development mode:
     * sync V-TAPP whenever this endpoint
     * is requested.
     *
     * Later the 5-minute Supabase cron
     * will handle synchronization.
     */

    const sync =
      await syncVtapp();

    /*
     * Read registrations from Supabase.
     */

    const {
      data: registrations,
      error: registrationsError,
    } = await supabase
      .from("registrations")
      .select(`
        *,
        fields:registration_fields(*),
        items:registration_items(
          *,
          distribution:distributions(*)
        )
      `)
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (registrationsError) {
      throw registrationsError;
    }

    /*
     * Inventory.
     */

    const {
      data: inventory,
      error: inventoryError,
    } = await supabase
      .from("inventory_status")
      .select("*")
      .order("item");

    if (inventoryError) {
      throw inventoryError;
    }

    /*
     * Sync state.
     */

    const {
      data: syncState,
    } = await supabase
      .from("sync_state")
      .select("*")
      .eq("id", 1)
      .single();

    return NextResponse.json({
      success: true,

      sync,

      count:
        registrations?.length ?? 0,

      data:
        registrations ?? [],

      inventory:
        inventory ?? [],

      syncState:
        syncState ?? null,
    });

  } catch (error) {

    console.error(
      "V-TAPP / Supabase error:",
      error
    );

    await supabase
      .from("sync_state")
      .update({
        last_error:
          error instanceof Error
            ? error.message
            : String(error),

        updated_at:
          new Date().toISOString(),
      })
      .eq("id", 1);

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
      }
    );
  }
}
