import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      token: string;
    }>;
  }
) {

  const { token } =
    await params;

  const {
    data: registration,
    error,
  } = await supabase
    .from("registrations")
    .select(`
      registration_id,
      name,
      email,
      items:registration_items(
        id,
        item,
        size,
        quantity,
        distribution:distributions(
          status
        )
      )
    `)
    .eq(
      "qr_token",
      token
    )
    .single();

  if (
    error ||
    !registration
  ) {

    return NextResponse.json(
      {
        error:
          "QR code not found",
      },
      {
        status: 404,
      }
    );

  }

  return NextResponse.json({
    registration: {
      ...registration,

      items:
        registration.items.map(
          (item: any) => ({
            ...item,

            status:
              item.distribution
                ?.at(0)
                ?.status ??
              "PENDING",
          })
        ),
    },
  });
}
