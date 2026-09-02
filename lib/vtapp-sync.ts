import { vtappApi } from "./env";
import { supabaseAdmin } from "./supabase";

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

type PreparedRegistration = {
  registrationId: string;
  row: Record<string, unknown>;
  items: ParsedItem[];
};

const CHUNK = 500;

function chunk<T>(values: T[], size = CHUNK): T[][] {
  const chunks: T[][] = [];

  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }

  return chunks;
}

/*
 * Stable identity for a registration's merchandise.
 *
 * Two syncs that parse to the same set of items produce the same
 * signature, which lets the sync leave those rows (and the
 * distribution records pointing at them) completely alone.
 */
function itemsSignature(
  items: { item: string; size: string | null; quantity: number }[]
) {
  return items
    .map(
      (item) =>
        `${item.item} ${item.size ?? ""} ${Number(
          item.quantity ?? 1
        )}`
    )
    .sort()
    .join("");
}

function prepare(
  record: Registration
): PreparedRegistration | null {
  if (
    record.registration_id === undefined ||
    record.registration_id === null
  ) {
    return null;
  }

  const registrationId = String(record.registration_id);
  const ticket = getTicket(record.product_meta);
  const size = getSize(record.field_values);

  return {
    registrationId,

    row: {
      registration_id: registrationId,
      event_id:
        record.event_id != null ? String(record.event_id) : null,
      name: record.name ?? null,
      email: record.email ?? null,
      event_date: record.event_date ?? null,
      order_id: record.order_id ?? null,
      receipt_id: record.receipt_id ?? null,
      product: record.product ?? null,
      product_meta: record.product_meta ?? null,
      payment_date: record.payment_date ?? null,
      invoice_number: record.invoice_number ?? null,
      total: record.total != null ? Number(record.total) : null,
      ticket,
      sale_type: getSaleType(ticket),
      raw_data: record,
    },

    items: parseItems(ticket, size),
  };
}

async function recordSyncState(
  success: boolean,
  message: string | null
) {
  const now = new Date().toISOString();

  await supabaseAdmin().from("sync_state").upsert({
    id: 1,
    last_sync_at: now,
    last_success: success,
    last_error: message,
    updated_at: now,
  });
}

export async function syncVtapp() {
  try {
    return await runSync();
  } catch (error) {
    /*
     * Record the failure before rethrowing. Previously
     * `sync_state` was only written on success, so `last_success`
     * could never actually become false.
     */
    const message =
      error instanceof Error ? error.message : "Sync failed";

    await recordSyncState(false, message).catch((stateError) => {
      console.error(
        "Unable to record sync failure:",
        stateError
      );
    });

    /*
     * Tell the organisers. A sync that quietly stops working means
     * registrations stop arriving and nobody notices until someone is
     * turned away at a gate.
     *
     * Throttled to one message an hour by sendAlert, because a broken
     * upstream fails on every poll and the daily quota belongs to the
     * students' passes, not to this.
     */
    try {
      const { sendAlert } = await import("./mailer");

      await sendAlert(
        "V-TAPP sync failed",
        [
          `The registration sync failed at ${new Date().toISOString()}.`,
          "",
          message,
          "",
          "Registrations are not being updated until this succeeds.",
        ].join("\n")
      );
    } catch (alertError) {
      /* Never let the alert mask the failure it is reporting. */
      console.error("Unable to send sync alert:", alertError);
    }

    throw error;
  }
}

/*
 * Per-phase stopwatch.
 *
 * The manual sync felt slow but the cost was not attributable, so
 * each phase is timed and returned to the caller. The admin UI
 * surfaces the breakdown, which is what tells you whether the delay
 * is the upstream V-TAPP API or our own writes.
 */
function stopwatch() {
  const timings: Record<string, number> = {};

  return {
    timings,

    async time<T>(label: string, work: () => Promise<T>): Promise<T> {
      const started = Date.now();

      try {
        return await work();
      } finally {
        timings[label] =
          (timings[label] ?? 0) + (Date.now() - started);
      }
    },
  };
}

async function runSync() {
  const clock = stopwatch();
  const startedAt = Date.now();

  const { url, key } = vtappApi();

  const payload = await clock.time("upstreamApi", async () => {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-KEY": key,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`V-TAPP returned HTTP ${response.status}`);
    }

    return response.json();
  });

  const records: Registration[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : [];

  /*
   * Later records win, matching the previous behaviour of
   * upserting duplicates one after another.
   */
  const prepared = new Map<string, PreparedRegistration>();

  for (const record of records) {
    const entry = prepare(record);

    if (entry) {
      prepared.set(entry.registrationId, entry);
    }
  }

  const entries = [...prepared.values()];

  if (entries.length === 0) {
    await recordSyncState(true, null);

    return {
      fetched: records.length,
      created: 0,
      updated: 0,
      itemsRewritten: 0,
      durationMs: Date.now() - startedAt,
      timings: clock.timings,
    };
  }

  const db = supabaseAdmin();

  /*
   * 1. Upsert every registration in batches.
   *
   *    This replaces one round-trip per record.
   */
  const idByRegistrationId = new Map<string, number>();

  for (const batch of chunk(entries)) {
    const data = await clock.time("upsertRegistrations", async () => {
      const { data, error } = await db
        .from("registrations")
        .upsert(
          batch.map((entry) => entry.row),
          { onConflict: "registration_id" }
        )
        .select("id,registration_id");

      if (error) {
        throw error;
      }

      return data;
    });

    for (const row of data ?? []) {
      idByRegistrationId.set(
        String(row.registration_id),
        row.id
      );
    }
  }

  /*
   * Record every event the feed mentions.
   *
   * The upstream payload has no event name; the name is the
   * `product_meta` prefix:
   *   'Robotics Club Expo - Date: 11 Sep 2026 - Ticket: General'
   *    ^^^^^^^^^^^^^^^^^^
   *
   * `name_locked` guards an admin's rename from being overwritten on
   * the next sync.
   */
  const eventRows = new Map<
    string,
    { event_id: string; name: string; event_date: string | null }
  >();

  for (const entry of entries) {
    const eventId = String(entry.row.event_id ?? "").trim();

    if (!eventId) {
      continue;
    }

    if (eventRows.has(eventId)) {
      continue;
    }

    const meta = String(entry.row.product_meta ?? "");

    const name =
      meta.split(" - Date:")[0].trim() || `Event ${eventId}`;

    eventRows.set(eventId, {
      event_id: eventId,
      name,
      event_date:
        (entry.row.event_date as string | null) ?? null,
    });
  }

  if (eventRows.size > 0) {
    await clock.time("upsertEvents", async () => {
      /*
       * Insert unseen events only. A plain upsert would clobber
       * `name` for every event on every sync, including renamed ones.
       */
      const { data: known, error: knownError } = await db
        .from("events")
        .select("event_id")
        .in("event_id", [...eventRows.keys()]);

      if (knownError) {
        throw knownError;
      }

      const seen = new Set(
        (known ?? []).map((row) => String(row.event_id))
      );

      const fresh = [...eventRows.values()].filter(
        (row) => !seen.has(row.event_id)
      );

      if (fresh.length > 0) {
        const { error } = await db.from("events").insert(fresh);

        if (error) {
          throw error;
        }
      }
    });
  }

  const registrationIds = [...idByRegistrationId.values()];

  /*
   * 2. Read the existing items for every registration at once.
   */
  const existingByRegistration = new Map<
    number,
    { item: string; size: string | null; quantity: number }[]
  >();

  for (const batch of chunk(registrationIds)) {
    const data = await clock.time("readItems", async () => {
      const { data, error } = await db
        .from("registration_items")
        .select("registration_id,item,size,quantity")
        .in("registration_id", batch);

      if (error) {
        throw error;
      }

      return data;
    });

    for (const row of data ?? []) {
      const bucket =
        existingByRegistration.get(row.registration_id) ?? [];

      bucket.push({
        item: row.item,
        size: row.size,
        quantity: Number(row.quantity ?? 1),
      });

      existingByRegistration.set(row.registration_id, bucket);
    }
  }

  /*
   * 3. Only rewrite items for registrations whose merchandise
   *    actually changed.
   *
   *    The previous implementation deleted and re-inserted every
   *    registration's items on every sync. Because `distributions`
   *    reference `registration_items`, that threw away the record
   *    of what had already been handed out.
   */
  const staleRegistrationIds: number[] = [];

  const itemsToInsert: {
    registration_id: number;
    item: string;
    size: string | null;
    quantity: number;
  }[] = [];

  let created = 0;
  let updated = 0;

  for (const entry of entries) {
    const registrationId = idByRegistrationId.get(
      entry.registrationId
    );

    if (registrationId === undefined) {
      continue;
    }

    const existing = existingByRegistration.get(registrationId);

    if (existing && existing.length > 0) {
      updated++;
    } else {
      created++;
    }

    if (
      itemsSignature(existing ?? []) ===
      itemsSignature(entry.items)
    ) {
      continue;
    }

    if (existing && existing.length > 0) {
      staleRegistrationIds.push(registrationId);
    }

    for (const item of entry.items) {
      itemsToInsert.push({
        registration_id: registrationId,
        item: item.item,
        size: item.size,
        quantity: item.quantity,
      });
    }
  }

  for (const batch of chunk(staleRegistrationIds)) {
    await clock.time("deleteItems", async () => {
      const { error } = await db
        .from("registration_items")
        .delete()
        .in("registration_id", batch);

      if (error) {
        throw error;
      }
    });
  }

  for (const batch of chunk(itemsToInsert)) {
    await clock.time("insertItems", async () => {
      const { error } = await db
        .from("registration_items")
        .insert(batch);

      if (error) {
        throw error;
      }
    });
  }

  await clock.time("syncState", () => recordSyncState(true, null));

  return {
    fetched: records.length,
    created,
    updated,
    itemsRewritten: itemsToInsert.length,
    durationMs: Date.now() - startedAt,
    timings: clock.timings,
  };
}
