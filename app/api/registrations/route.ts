import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { readAll } from "@/lib/paged";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ItemRow = {
  id: number;
  item: string;
  size: string | null;
  quantity: number | string | null;
  distribution:
    | { status: string | null }[]
    | { status: string | null }
    | null;
};

function toArray(distribution: ItemRow["distribution"]) {
  if (Array.isArray(distribution)) {
    return distribution;
  }

  return distribution ? [distribution] : [];
}

export async function GET(request: Request) {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const url = new URL(request.url);

    /*
     * Paging is opt-in. Without an explicit `limit` the full set
     * is returned, so existing callers keep seeing every row.
     */
    const limitParam = url.searchParams.get("limit");

    const limit = limitParam
      ? Math.min(Math.max(Number(limitParam), 1), 500)
      : null;

    const offset = Math.max(
      Number(url.searchParams.get("offset") ?? 0),
      0
    );

    const db = supabaseAdmin();

    /*
     * These three reads are independent, so run them
     * concurrently instead of one after another.
     *
     * Columns are listed explicitly: the previous `select("*")`
     * also pulled `raw_data`, the full upstream V-TAPP payload,
     * for every registration on every poll.
     */
    const [
      registrationsResult,
      inventoryResult,
      syncStateResult,
      eventMapResult,
    ] = await Promise.all([
        (() => {
          const select = () => {
            const query = db
              .from("registrations")
              .select(
                `
              id,
              registration_id,
              name,
              email,
              ticket,
              sale_type,
              total,
              created_at,
              items:registration_items(
                id,
                item,
                size,
                quantity,
                distribution:distributions(status)
              )
            `,
                { count: "exact" }
              )
              /*
               * created_at alone is not a total order -- a sync writes
               * many rows in the same instant -- and ties let rows swap
               * between pages, dropping some and repeating others. id
               * breaks them.
               */
              .order("created_at", { ascending: false })
              .order("id", { ascending: false });

            return query;
          };

          /* An explicit page is honoured as asked for. */
          if (limit) {
            return select()
              .range(offset, offset + limit - 1)
              .then((r) => ({
                data: r.data,
                error: r.error,
                count: r.count,
              }));
          }

          /*
           * Otherwise every row, in pages. PostgREST stops at 1000 and
           * says nothing, so an unpaged read silently lost everyone
           * past the thousandth registration.
           */
          return readAll<Record<string, unknown>>((from, to) =>
            select().range(from, to)
          ).then(({ rows, total }) => ({
            data: rows,
            error: null,
            count: total,
          }));
        })(),

        db
          .from("inventory_status")
          .select(
            "id,item,initial_stock,sold,remaining,remaining_percentage"
          )
          .order("item"),

        db
          .from("sync_state")
          .select("last_sync_at,last_success,last_error")
          .eq("id", 1)
          .maybeSingle(),

        /*
         * Resolved event names, keyed by registration id. Fetched
         * alongside the page rather than after it, because it does not
         * depend on which rows came back.
         */
        db.rpc("registration_event_map"),
      ]);

    if (registrationsResult.error) {
      throw registrationsResult.error;
    }

    if (inventoryResult.error) {
      throw inventoryResult.error;
    }

    /*
     * Flatten the embedded distribution into a `status` field.
     *
     * The client renders `item.status`; without this the nested
     * relation never matched and every item read as PENDING.
     */
    /*
     * 42883 / PGRST202: supabase/event-checkin.sql has not been run, so
     * rows keep the generic label rather than the request failing.
     */
    const eventMap = (eventMapResult.error
      ? {}
      : ((eventMapResult.data ?? {}) as Record<
          string,
          {
            slug: string | null;
            name: string;
            day: string | null;
            venue: string | null;
            merch: boolean;
          }
        >)) as Record<
      string,
      {
        slug: string | null;
        name: string;
        day: string | null;
        venue: string | null;
        merch: boolean;
      }
    >;

    const registrations = (registrationsResult.data ?? []).map(
      (registration) => ({
        ...registration,

        event: eventMap[String(registration.id)] ?? {
          slug: null,
          name: "Unmapped ticket",
          day: null,
          venue: null,
          merch: false,
        },

        items: ((registration.items ?? []) as ItemRow[]).map(
          (item) => {
            const quantity = Math.max(
              Number(item.quantity ?? 1),
              1
            );

            const given = toArray(item.distribution).filter(
              (distribution) => distribution?.status === "GIVEN"
            ).length;

            return {
              id: item.id,
              item: item.item,
              size: item.size,
              quantity,
              status: given >= quantity ? "GIVEN" : "PENDING",
            };
          }
        ),
      })
    );

    return NextResponse.json({
      success: true,
      count: registrationsResult.count ?? registrations.length,
      limit,
      offset,
      /*
       * Named for what it is. It was `data`, so a caller reading
       * `data.registrations` got undefined and rendered an empty
       * table with no error to explain it -- which is exactly what
       * happened. One consumer, so renaming is safe.
       */
      registrations,
      inventory: inventoryResult.data ?? [],
      syncState: syncStateResult.data ?? null,
    });
  } catch (error) {
    console.error("Registrations API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
