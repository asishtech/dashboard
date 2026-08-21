import { supabase } from "./supabase";

type Field = {
  field_name?: string;
  field_value?: string;
};

type Registration = {
  registration_id?: number | string;
  event_id?: number | string;
  name?: string;
  email?: string;
  event_date?: string;
  order_id?: string;
  receipt_id?: string;
  product?: string;
  product_meta?: string;
  payment_date?: string;
  invoice_number?: string;
  total?: number | string;
  field_values?: Field[];
  [key: string]: unknown;
};


type ParsedItem = {
  item: string;
  size: string | null;
  quantity: number;
};


/*
 * ============================================================
 * V-TAPP 2026 MERCHANDISE CATALOG
 * ============================================================
 */

const COMBOS: Record<
  string,
  ParsedItem[]
> = {

  "Combo 1": [
    {
      item: "Cap",
      size: "FREE SIZE",
      quantity: 1,
    },
    {
      item: "Hoodie (Navy Blue)",
      size: null,
      quantity: 1,
    },
    {
      item: "Polo (Dark Navy Blue)",
      size: null,
      quantity: 1,
    },
  ],

  "Combo 2": [
    {
      item: "Cap",
      size: "FREE SIZE",
      quantity: 1,
    },
    {
      item: "Hoodie (White)",
      size: null,
      quantity: 1,
    },
    {
      item: "Polo (Dark Navy Blue)",
      size: null,
      quantity: 1,
    },
  ],

  "Combo 3": [
    {
      item: "Cap",
      size: "FREE SIZE",
      quantity: 1,
    },
    {
      item: "Hoodie (White)",
      size: null,
      quantity: 1,
    },
    {
      item: "Polo (White)",
      size: null,
      quantity: 1,
    },
  ],

  "Combo 4": [
    {
      item: "Hoodie (Navy Blue)",
      size: null,
      quantity: 1,
    },
    {
      item: "Polo (White)",
      size: null,
      quantity: 1,
    },
  ],

  "Combo 5": [
    {
      item: "Hoodie (White)",
      size: null,
      quantity: 1,
    },
    {
      item: "Hoodie (Navy Blue)",
      size: null,
      quantity: 1,
    },
  ],

  "Combo 6": [
    {
      item: "Cap",
      size: "FREE SIZE",
      quantity: 1,
    },
    {
      item: "Hoodie (White)",
      size: null,
      quantity: 1,
    },
  ],

  "Combo 7": [
    {
      item: "Cap",
      size: "FREE SIZE",
      quantity: 1,
    },
    {
      item: "Hoodie (Navy Blue)",
      size: null,
      quantity: 1,
    },
  ],

  "Combo 8": [
    {
      item: "Cap",
      size: "FREE SIZE",
      quantity: 1,
    },
    {
      item: "Polo (White)",
      size: null,
      quantity: 1,
    },
  ],

  "Combo 9": [
    {
      item: "Cap",
      size: "FREE SIZE",
      quantity: 1,
    },
    {
      item: "Polo (Dark Navy Blue)",
      size: null,
      quantity: 1,
    },
  ],

  "Combo 10": [
    {
      item: "Polo (White)",
      size: null,
      quantity: 1,
    },
    {
      item: "Polo (Dark Navy Blue)",
      size: null,
      quantity: 1,
    },
  ],

  "Combo 11": [
    {
      item: "Hoodie (White)",
      size: null,
      quantity: 1,
    },
    {
      item: "Polo (Dark Navy Blue)",
      size: null,
      quantity: 1,
    },
  ],

  "Combo 12": [
    {
      item: "Hoodie (Navy Blue)",
      size: null,
      quantity: 2,
    },
  ],

  "Combo 13": [
    {
      item: "Hoodie (White)",
      size: null,
      quantity: 2,
    },
  ],

  "Combo 14": [
    {
      item: "Hoodie (Navy Blue)",
      size: null,
      quantity: 1,
    },
    {
      item: "Polo (Dark Navy Blue)",
      size: null,
      quantity: 1,
    },
  ],

  "Combo 15": [
    {
      item: "Hoodie (White)",
      size: null,
      quantity: 1,
    },
    {
      item: "Polo (White)",
      size: null,
      quantity: 1,
    },
  ],
};


/*
 * ============================================================
 * NORMALIZE TEXT
 * ============================================================
 */

function normalize(
  value: unknown
): string {

  return String(value ?? "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}


/*
 * ============================================================
 * TICKET
 * ============================================================
 */

function getTicket(
  productMeta?: string
) {

  const match =
    String(
      productMeta ?? ""
    ).match(
      /Ticket:\s*(.*)$/i
    );

  return (
    match?.[1]?.trim() ??
    ""
  );
}


/*
 * ============================================================
 * SIZE
 * ============================================================
 */

function getSize(
  fields?: Field[]
) {

  const field =
    fields?.find(
      f =>
        String(
          f.field_name ?? ""
        )
          .toLowerCase()
          .includes("size")
    );

  return (
    field?.field_value
      ?.replace(
        /^SIZE-/i,
        ""
      )
      .trim() ||
    null
  );
}


/*
 * ============================================================
 * SALE TYPE
 * ============================================================
 */

function getSaleType(
  ticket: string
) {

  return /^combo\b/i.test(
    ticket
  ) ||
    ticket.includes("+")
    ? "Combo"
    : "Single";
}


/*
 * ============================================================
 * FIND COMBO
 * ============================================================
 */

function findCombo(
  ticket: string
) {

  const normalized =
    normalize(ticket);

  for (
    const [
      comboName,
      items,
    ]
    of Object.entries(
      COMBOS
    )
  ) {

    if (
      normalized.startsWith(
        comboName.toLowerCase()
      )
    ) {

      return items;
    }

  }

  return null;
}


/*
 * ============================================================
 * SINGLE ITEM PARSER
 * ============================================================
 */

function parseSingleItem(
  ticket: string,
  size: string | null
): ParsedItem[] {

  const text =
    normalize(ticket);


  if (
    text.includes("cap")
  ) {

    return [
      {
        item: "Cap",
        size: "FREE SIZE",
        quantity: 1,
      },
    ];

  }


  if (
    text.includes(
      "hoodie (white"
    ) ||
    text.includes(
      "hoodie white"
    )
  ) {

    return [
      {
        item:
          "Hoodie (White)",
        size,
        quantity: 1,
      },
    ];

  }


  if (
    text.includes(
      "hoodie (navy"
    ) ||
    text.includes(
      "hoodie navy"
    ) ||
    text.includes(
      "hoodie navy blue"
    )
  ) {

    return [
      {
        item:
          "Hoodie (Navy Blue)",
        size,
        quantity: 1,
      },
    ];

  }


  if (
    text.includes(
      "polo (dark navy"
    ) ||
    text.includes(
      "polo dark navy"
    ) ||
    text.includes(
      "polo navy blue"
    )
  ) {

    return [
      {
        item:
          "Polo (Dark Navy Blue)",
        size,
        quantity: 1,
      },
    ];

  }


  if (
    text.includes(
      "polo (white"
    ) ||
    text.includes(
      "polo white"
    )
  ) {

    return [
      {
        item:
          "Polo (White)",
        size,
        quantity: 1,
      },
    ];

  }


  return [];
}


/*
 * ============================================================
 * PARSE ITEMS
 *
 * COMBO → physical merchandise
 * SINGLE → physical merchandise
 * ============================================================
 */

function parseItems(
  ticket: string,
  size: string | null
): ParsedItem[] {

  /*
   * First check combos.
   */
  const combo =
    findCombo(ticket);

  if (combo) {

    return combo.map(
      item => ({
        ...item,

        /*
         * Apply the purchased size
         * to wearable items.
         */
        size:
          item.item === "Cap"
            ? "FREE SIZE"
            : size,
      })
    );

  }


  /*
   * Otherwise treat it as a
   * single merchandise purchase.
   */
  return parseSingleItem(
    ticket,
    size
  );
}


/*
 * ============================================================
 * SYNC
 * ============================================================
 */

export async function syncVtapp() {

  const apiUrl =
    process.env.VTAPP_API_URL;

  const apiKey =
    process.env.VTAPP_API_KEY;


  if (
    !apiUrl ||
    !apiKey
  ) {

    throw new Error(
      "V-TAPP API configuration missing."
    );

  }


  const response =
    await fetch(
      apiUrl,
      {
        method: "GET",

        headers: {
          "X-API-KEY":
            apiKey,

          Accept:
            "application/json",
        },

        cache:
          "no-store",
      }
    );


  if (!response.ok) {

    throw new Error(
      `V-TAPP returned HTTP ${response.status}`
    );

  }


  const payload =
    await response.json();


  const records:
    Registration[] =
      Array.isArray(payload)
        ? payload
        : Array.isArray(
            payload?.data
          )
          ? payload.data
          : [];


  let created = 0;
  let updated = 0;


  for (
    const record
    of records
  ) {

    if (
      record.registration_id ===
        undefined ||
      record.registration_id ===
        null
    ) {

      continue;

    }


    const registrationId =
      String(
        record.registration_id
      );


    const ticket =
      getTicket(
        record.product_meta
      );


    const saleType =
      getSaleType(
        ticket
      );


    const size =
      getSize(
        record.field_values
      );


    /*
     * Expand combo/single into
     * physical merchandise.
     */
    const items =
      parseItems(
        ticket,
        size
      );


    /*
     * Upsert registration.
     */

    const {
      data: registration,
      error,
    } =
      await supabase
        .from(
          "registrations"
        )
        .upsert(
          {
            registration_id:
              registrationId,

            event_id:
              record.event_id !=
              null
                ? String(
                    record.event_id
                  )
                : null,

            name:
              record.name ??
              null,

            email:
              record.email ??
              null,

            event_date:
              record.event_date ??
              null,

            order_id:
              record.order_id ??
              null,

            receipt_id:
              record.receipt_id ??
              null,

            product:
              record.product ??
              null,

            product_meta:
              record.product_meta ??
              null,

            payment_date:
              record.payment_date ??
              null,

            invoice_number:
              record.invoice_number ??
              null,

            total:
              record.total !=
              null
                ? Number(
                    record.total
                  )
                : null,

            ticket,

            sale_type:
              saleType,

            raw_data:
              record,
          },

          {
            onConflict:
              "registration_id",
          }
        )
        .select()
        .single();


    if (error) {

      throw error;

    }


    /*
     * Check whether this registration
     * already existed.
     */
    const {
      data:
        existingItems,
    } =
      await supabase
        .from(
          "registration_items"
        )
        .select(
          "id"
        )
        .eq(
          "registration_id",
          registration.id
        );


    /*
     * Replace registration items.
     *
     * Distribution records are preserved
     * only when the item identity remains
     * compatible.
     */
    if (
      existingItems &&
      existingItems.length >
        0
    ) {

      await supabase
        .from(
          "registration_items"
        )
        .delete()
        .eq(
          "registration_id",
          registration.id
        );

    }


    /*
     * Insert expanded physical items.
     */
    if (
      items.length > 0
    ) {

      const {
        error:
          itemsError,
      } =
        await supabase
          .from(
            "registration_items"
          )
          .insert(
            items.map(
              item => ({
                registration_id:
                  registration.id,

                item:
                  item.item,

                size:
                  item.size,

                quantity:
                  item.quantity,
              })
            )
          );


      if (itemsError) {

        throw itemsError;

      }

    }


    /*
     * Track sync statistics.
     */
    if (
      existingItems &&
      existingItems.length >
        0
    ) {

      updated++;

    } else {

      created++;

    }

  }


  /*
   * Update sync state.
   */
  await supabase
    .from("sync_state")
    .upsert(
      {
        id: 1,

        last_sync_at:
          new Date().toISOString(),

        last_success:
          true,

        last_error:
          null,

        updated_at:
          new Date().toISOString(),
      }
    );


  return {
    fetched:
      records.length,

    created,

    updated,
  };
}
