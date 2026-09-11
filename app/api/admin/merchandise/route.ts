import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { MERCH_SOURCE_ID } from "@/lib/events";
import { emailFrom, originFrom, parseRaw, phoneFrom } from "@/lib/form-fields";
import { readAll } from "@/lib/paged";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Registration = {
  id: number;
  registration_id: string;
  name: string | null;
  email: string | null;
  qr_token: string | null;
  raw_data: unknown;
};

type Item = {
  id: number;
  registration_id: number;
  item: string;
  size: string | null;
  quantity: number;
};

type Distribution = {
  registration_item_id: number;
  status: string;
};

export type MerchItem = {
  id: number;
  item: string;
  size: string | null;
  quantity: number;
  given: boolean;
};

export type MerchOrder = {
  id: number;
  registration_id: string;
  qr_token: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  origin: "internal" | "external" | "unknown";
  items: MerchItem[];
};

/*
 * GET /api/admin/merchandise
 *
 * Everyone who has ordered merchandise, with their items and
 * collection status -- the buyer list that supabase/inventory covers
 * in aggregate (how many of each item) but never names a person.
 * Admin only. The registrations desk's role narrowed to just the
 * external gate, so it no longer sees this either.
 */
export async function GET() {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const db = supabaseAdmin();

    const { rows } = await readAll<Registration>((from, to) =>
      db
        .from("registrations")
        .select("id,registration_id,name,email,qr_token,raw_data")
        .eq("event_id", MERCH_SOURCE_ID)
        .order("id", { ascending: true })
        .range(from, to)
    );

    const registrationIds = rows.map((row) => row.id);

    const itemsByRegistration = new Map<number, Item[]>();

    if (registrationIds.length > 0) {
      const { rows: items } = await readAll<Item>((from, to) =>
        db
          .from("registration_items")
          .select("id,registration_id,item,size,quantity")
          .in("registration_id", registrationIds)
          .order("id", { ascending: true })
          .range(from, to)
      );

      for (const item of items) {
        const bucket = itemsByRegistration.get(item.registration_id) ?? [];
        bucket.push(item);
        itemsByRegistration.set(item.registration_id, bucket);
      }
    }

    const allItemIds = [...itemsByRegistration.values()]
      .flat()
      .map((item) => item.id);

    const givenItemIds = new Set<number>();

    if (allItemIds.length > 0) {
      const { rows: distributions } = await readAll<Distribution>(
        (from, to) =>
          db
            .from("distributions")
            .select("registration_item_id,status")
            .in("registration_item_id", allItemIds)
            .range(from, to)
      );

      for (const distribution of distributions) {
        if (distribution.status === "GIVEN") {
          givenItemIds.add(distribution.registration_item_id);
        }
      }
    }

    const orders: MerchOrder[] = rows.map((row) => {
      const raw = parseRaw(row.raw_data);
      const email = row.email?.trim() || emailFrom(raw);

      return {
        id: row.id,
        registration_id: row.registration_id,
        qr_token: row.qr_token,
        name: row.name || "Unnamed",
        phone: phoneFrom(raw) || null,
        email: email || null,
        origin: originFrom(raw, email),
        items: (itemsByRegistration.get(row.id) ?? []).map((item) => ({
          id: item.id,
          item: item.item,
          size: item.size,
          quantity: item.quantity,
          given: givenItemIds.has(item.id),
        })),
      };
    });

    orders.sort((a, b) => a.name.localeCompare(b.name));

    const totalItems = orders.reduce(
      (sum, order) => sum + order.items.length,
      0
    );

    const givenItems = orders.reduce(
      (sum, order) =>
        sum + order.items.filter((item) => item.given).length,
      0
    );

    const summary = {
      orders: orders.length,
      items: totalItems,
      collected: givenItems,
      pending: totalItems - givenItems,
    };

    return NextResponse.json({ success: true, orders, summary });
  } catch (error) {
    console.error("Merchandise registrations API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read merchandise registrations",
      },
      { status: 500 }
    );
  }
}
