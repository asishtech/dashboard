import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
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
      .order("created_at", {
        ascending: false,
      });

    if (registrationsError) {
      throw registrationsError;
    }

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

    const {
      data: syncState,
    } = await supabase
      .from("sync_state")
      .select("*")
      .eq("id", 1)
      .single();

    return NextResponse.json({
      success: true,
      count: registrations?.length ?? 0,
      data: registrations ?? [],
      inventory: inventory ?? [],
      syncState: syncState ?? null,
    });

  } catch (error) {
    console.error(
      "Registrations API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 }
    );
  }
}
