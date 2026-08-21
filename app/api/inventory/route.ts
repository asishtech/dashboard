import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {

  const {
    data,
    error,
  } = await supabase
    .from("inventory_status")
    .select("*")
    .order("item");

  if (error) {

    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }

  return NextResponse.json({
    inventory:
      data ?? [],
  });
}


export async function PUT(
  request: Request
) {

  try {

    const body =
      await request.json();

    const inventory =
      body.inventory;

    if (
      !Array.isArray(inventory)
    ) {

      return NextResponse.json(
        {
          error:
            "Invalid inventory payload",
        },
        {
          status: 400,
        }
      );

    }


    for (
      const item
      of inventory
    ) {

      const {
        data: current
      } = await supabase
        .from("inventory_status")
        .select("sold")
        .eq(
          "id",
          item.id
        )
        .single();

      if (
        current &&
        Number(
          item.initial_stock
        ) <
          Number(
            current.sold
          )
      ) {

        return NextResponse.json(
          {
            error:
              `Cannot set stock below sold quantity for item ${item.id}`,
          },
          {
            status: 400,
          }
        );

      }

      const {
        error
      } = await supabase
        .from("inventory")
        .update({
          initial_stock:
            Number(
              item.initial_stock
            ),

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          item.id
        );

      if (error) {
        throw error;
      }

    }


    return NextResponse.json({
      success: true,
    });

  } catch (error) {

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update inventory",
      },
      {
        status: 500,
      }
    );
  }
}
