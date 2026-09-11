import { vtappApi } from "./env";
import { MERCH_SOURCE_ID } from "./events";
import { readAutoSend } from "./mail-settings";
import {
  DAILY_CAP,
  mailEnabled,
  sendPersonPasses,
} from "./mailer";
import { readAll } from "./paged";
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

  /*
   * Extract the combo number and look it up exactly. A prefix scan
   * over COMBOS in insertion order matched "Combo 1" against
   * "Combo 10", "Combo 11" ... "Combo 15" -- "combo 1" is a string
   * prefix of "combo 10" -- so every ticket for combo 10 and up
   * silently resolved to combo 1's items: a phantom cap for combo 10
   * (which has none), navy instead of white for combo 11, and so on.
   */
  const match =
    normalized.match(
      /^combo\s+(\d+)/
    );

  if (!match) {
    return null;
  }

  return (
    COMBOS[`Combo ${match[1]}`] ??
    null
  );
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

/*
 * Whether the feed's version of a registration matches the stored one.
 *
 * Compared column by column rather than by hashing the whole record:
 * the stored row is what Postgres gives back, so `total` is a string
 * where we wrote a number and a JSON column comes back re-ordered.
 * Comparing the values we actually write, loosely, is the comparison
 * that means "nothing to do" -- a stricter one would report every row
 * as changed and put the write phase straight back.
 */
function sameRow(
  stored: Record<string, unknown>,
  next: Record<string, unknown>
) {
  for (const [key, value] of Object.entries(next)) {
    if (key === "raw_data") {
      /* The upstream payload, stored verbatim. Key order is not
         stable across JSON round trips, so compare the parsed shape
         rather than the text. */
      if (
        JSON.stringify(sortKeys(stored[key])) !==
        JSON.stringify(sortKeys(value))
      ) {
        return false;
      }

      continue;
    }

    const a = stored[key];
    const b = value;

    if (a === b) continue;

    /* null and undefined both mean "not set" here. */
    if (a == null && b == null) continue;

    /* numeric(10,2) comes back as "150.00" for the 150 we wrote. */
    if (
      a != null &&
      b != null &&
      Number.isFinite(Number(a)) &&
      Number.isFinite(Number(b)) &&
      Number(a) === Number(b)
    ) {
      continue;
    }

    if (String(a ?? "") === String(b ?? "")) continue;

    return false;
  }

  return true;
}

/* Deep key sort, so two equal objects serialise identically. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)])
    );
  }

  return value;
}

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
        `${item.item}|${item.size ?? ""}|${Number(
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

    /*
     * Only ever parsed for an actual merchandise order. parseItems()
     * matches on substrings of the ticket text -- "cap", "hoodie",
     * "polo" -- because that is what a merchandise ticket looks like,
     * and nothing stops an *event* from being named in a way that
     * happens to contain one of those substrings. "Escape Room" and
     * "Tech Escape Quest" both contain "cap" inside "escape", and
     * every one of their 205 registrations picked up a phantom Cap
     * this way before this check existed -- inflating Cap's sold
     * count on /admin/inventory by more than 4x, and appearing as an
     * uncollectable "pending" item on every one of those bookings.
     */
    items:
      String(record.event_id ?? "") === MERCH_SOURCE_ID
        ? parseItems(ticket, size)
        : [],
  };
}

/*
 * Record how the sync went. Diagnostic only, and never fatal.
 *
 * This threw on every single run and stopped the sync at the last
 * step. `sync_state` in the live database has `last_success_at`, a
 * timestamp; this wrote `last_success`, a boolean, and PostgREST
 * answers an unknown column with PGRST204 rather than ignoring it.
 * Every registration had already been upserted by then, so the data
 * was right and the request still returned 500 -- and autoMail(),
 * which runs after this line, never ran once. That is the whole of
 * "automatic sending is not working".
 *
 * Two lessons, both applied here: write whichever shape the table
 * actually has, and never let bookkeeping decide whether the mail
 * goes out.
 */
async function recordSyncState(
  success: boolean,
  message: string | null
) {
  const now = new Date().toISOString();
  const db = supabaseAdmin();

  /* The shape the live table has. */
  const first = await db.from("sync_state").upsert({
    id: 1,
    last_sync_at: now,
    ...(success ? { last_success_at: now } : {}),
    last_error: message,
    updated_at: now,
  });

  if (!first.error) return;

  /* PGRST204 / 42703: a database with the older boolean column. */
  if (!["PGRST204", "42703"].includes(first.error.code ?? "")) {
    console.error("Unable to record sync state:", first.error);
    return;
  }

  const second = await db.from("sync_state").upsert({
    id: 1,
    last_sync_at: now,
    last_success: success,
    last_error: message,
    updated_at: now,
  });

  if (second.error) {
    console.error("Unable to record sync state:", second.error);
  }
}

export async function syncVtapp(options?: { resume?: boolean }) {
  try {
    /*
     * A resumed pass works from the payload the first pass stored,
     * which is what keeps it inside the gateway's window: the fetch
     * is the slow part and it has already happened.
     */
    const supplied = options?.resume
      ? ((await storedPayload()) ?? undefined)
      : undefined;

    return await runSync(supplied);
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
     * Tell the organisers. A sync that quietly stops means
     * registrations stop arriving and nobody notices until somebody is
     * turned away at a gate. Throttled to one an hour by sendAlert:
     * a broken upstream fails on every poll, and the daily quota
     * belongs to the students' passes.
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

/*
 * How long a pass may spend writing before it stops and reports.
 *
 * The gateway kills the function at thirty seconds. Eighteen leaves
 * room for the payload read, the comparison and the response, and a
 * pass that stops early is not a failure -- it returns how many rows
 * are left and the browser presses again.
 */
const WRITE_BUDGET_MS = 18_000;

/*
 * Fetch the feed and put it where a later pass can find it.
 *
 * Separate from the writing because it is the part that cannot be
 * made shorter: the portal ignores every pagination parameter and
 * answers with all 2.5 MB, in anything from 7 to 17 seconds.
 */
export async function fetchUpstream() {
  const clock = stopwatch();
  const { url, key } = vtappApi();

  const payload = await clock.time("upstreamApi", async () => {
    /*
     * A deadline, because the gateway has one.
     *
     * This call has been measured at 10 and at 17 seconds for the
     * same 2.5 MB, and the function in front of it is killed at
     * thirty. Without a limit here a slow upstream becomes a 504
     * with an empty body, which reads as "the dashboard is broken"
     * rather than "the events portal is slow today".
     */
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-KEY": key,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    }).catch((error) => {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error(
          "The V-TAPP events portal did not answer within 20 seconds. Nothing was changed; try again in a minute."
        );
      }

      throw error;
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
   * Held in the database rather than in memory: the next pass is a
   * different invocation of the function, and may be a different
   * container entirely.
   *
   * A missing table means supabase/sync-resume.sql has not run. That
   * is not fatal -- the caller falls back to doing everything in one
   * pass, which is what it did before -- so the payload is returned
   * either way.
   */
  const { error } = await supabaseAdmin()
    .from("sync_payload")
    .upsert({
      id: 1,
      payload: records,
      records: records.length,
      fetched_at: new Date().toISOString(),
    });

  if (error && !["42P01", "PGRST205"].includes(error.code ?? "")) {
    throw error;
  }

  return {
    records,
    stored: !error,
    timings: clock.timings,
  };
}

/*
 * The feed as it was last fetched, or null if nothing is stored.
 */
async function storedPayload(): Promise<Registration[] | null> {
  const { data, error } = await supabaseAdmin()
    .from("sync_payload")
    .select("payload,fetched_at")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) return null;

  /*
   * Stale after ten minutes. A resumed pass should finish the run it
   * started, not carry on from a picture of the festival taken during
   * a previous one.
   */
  const age = Date.now() - new Date(data.fetched_at).getTime();

  if (age > 10 * 60_000) return null;

  return Array.isArray(data.payload)
    ? (data.payload as Registration[])
    : null;
}

async function runSync(supplied?: Registration[]) {
  const clock = stopwatch();
  const startedAt = Date.now();

  const records: Registration[] =
    supplied ?? (await fetchUpstream()).records;

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
      unchanged: 0,
      remaining: 0,
      itemsRewritten: 0,
      durationMs: Date.now() - startedAt,
      timings: clock.timings,
    };
  }

  const db = supabaseAdmin();

  /*
   * 0. What is already stored.
   *
   *    The upstream API has no "changed since" parameter, so every
   *    sync receives all 4,287 registrations whether or not any of
   *    them moved. Writing all of them back took longer than the
   *    gateway's thirty seconds and the manual sync began returning
   *    504 -- and it gets worse with every registration the fest
   *    takes.
   *
   *    Reading the stored copy first costs about three seconds and
   *    turns the write phase into "the handful that actually
   *    changed", which on a normal sync is none of them. Reading
   *    beats writing by enough that this is worth the round trip
   *    even when everything has changed.
   */
  const stored = new Map<
    string,
    { id: number; row: Record<string, unknown> }
  >();

  await clock.time("readExisting", async () => {
    const { rows } = await readAll<
      Record<string, unknown> & { id: number; registration_id: string }
    >((from, to) =>
      db
        .from("registrations")
        .select(
          "id,registration_id,event_id,name,email,event_date,order_id,receipt_id,product,product_meta,payment_date,invoice_number,total,ticket,sale_type,raw_data"
        )
        .order("id", { ascending: true })
        .range(from, to)
    );

    for (const row of rows) {
      stored.set(String(row.registration_id), { id: row.id, row });
    }
  });

  /*
   * 1. Upsert only what differs.
   */
  const idByRegistrationId = new Map<string, number>();

  const changed: PreparedRegistration[] = [];

  let unchanged = 0;

  for (const entry of entries) {
    const existing = stored.get(entry.registrationId);

    if (existing && sameRow(existing.row, entry.row)) {
      idByRegistrationId.set(entry.registrationId, existing.id);
      unchanged += 1;
      continue;
    }

    changed.push(entry);
  }

  /*
   * As many as fit. `changed` is ordered as the feed gave it, so a
   * pass that stops early leaves the rest for the next one and the
   * same rows are not reconsidered -- the comparison above will find
   * them already stored.
   */
  let remaining = 0;
  let written = 0;

  for (const batch of chunk(changed)) {
    if (Date.now() - startedAt > WRITE_BUDGET_MS) {
      /*
       * Counted from what this pass wrote, not from the size of
       * idByRegistrationId -- that map also holds every unchanged
       * row, so using it here reported far less work left than
       * there was, and the browser would stop pressing while rows
       * were still unwritten.
       */
      remaining = changed.length - written;
      break;
    }

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

    written += batch.length;
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

  /*
   * Only the changed ones. A registration whose stored row is
   * identical cannot have different merchandise -- the items are
   * parsed from `ticket`, which is part of the comparison -- so
   * reading its items would be a round trip to confirm nothing.
   */
  const registrationIds = changed
    .map((entry) => idByRegistrationId.get(entry.registrationId))
    .filter((id): id is number => id !== undefined);

  /*
   * 2. Read the existing items for every registration at once.
   */
  const existingByRegistration = new Map<
    number,
    {
      id: number;
      item: string;
      size: string | null;
      quantity: number;
    }[]
  >();

  for (const batch of chunk(registrationIds)) {
    const data = await clock.time("readItems", async () => {
      const { data, error } = await db
        .from("registration_items")
        .select("id,registration_id,item,size,quantity")
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
        id: row.id,
        item: row.item,
        size: row.size,
        quantity: Number(row.quantity ?? 1),
      });

      existingByRegistration.set(row.registration_id, bucket);
    }
  }

  /*
   * Which of those existing rows have already been handed over.
   *
   * A row a volunteer has scanned is a physical fact, not a cache
   * entry -- it must never be deleted to make room for a fresh
   * parse, however wrong the parse it came from turns out to have
   * been. See the Combo 1 mis-parse below.
   */
  const allExistingIds = [...existingByRegistration.values()]
    .flat()
    .map((row) => row.id);

  const givenItemIds = new Set<number>();

  for (const batch of chunk(allExistingIds)) {
    if (batch.length === 0) continue;

    const data = await clock.time("readDistributions", async () => {
      const { data, error } = await db
        .from("distributions")
        .select("registration_item_id,status")
        .in("registration_item_id", batch)
        .eq("status", "GIVEN");

      if (error) {
        throw error;
      }

      return data;
    });

    for (const row of data ?? []) {
      givenItemIds.add(row.registration_item_id);
    }
  }

  /*
   * 3. Reconcile items for registrations whose merchandise actually
   *    changed, without ever discarding a row that has been handed
   *    over.
   *
   *    A blanket delete-and-reinsert here doesn't just cost a round
   *    trip on a no-op sync (the itemsSignature check above already
   *    guards that) -- it is unsafe on a genuine change, because
   *    `distributions` references `registration_items`. A parser bug
   *    that mis-resolved "Combo 10" through "Combo 15" to "Combo 1"
   *    (fixed in findCombo() above) had already been handed out
   *    against seven real registrations by the time it was caught;
   *    a plain replace here would have taken the record of those
   *    handovers with it.
   *
   *    Instead: rows already GIVEN are left alone and counted toward
   *    the target; only the remaining shortfall is inserted, and
   *    only never-given rows are deleted.
   */
  function itemKey(item: string, size: string | null) {
    return `${item}|${size ?? ""}`;
  }

  const itemsToDelete: number[] = [];

  const itemsToInsert: {
    registration_id: number;
    item: string;
    size: string | null;
    quantity: number;
  }[] = [];

  let created = 0;
  let updated = 0;

  for (const entry of changed) {
    const registrationId = idByRegistrationId.get(
      entry.registrationId
    );

    if (registrationId === undefined) {
      continue;
    }

    const existing = existingByRegistration.get(registrationId) ?? [];

    if (existing.length > 0) {
      updated++;
    } else {
      created++;
    }

    if (itemsSignature(existing) === itemsSignature(entry.items)) {
      continue;
    }

    const given = existing.filter((row) => givenItemIds.has(row.id));
    const notGiven = existing.filter(
      (row) => !givenItemIds.has(row.id)
    );

    for (const row of notGiven) {
      itemsToDelete.push(row.id);
    }

    /* How much of the target each already-given row covers. */
    const covered = new Map<string, number>();

    for (const row of given) {
      const key = itemKey(row.item, row.size);
      covered.set(key, (covered.get(key) ?? 0) + row.quantity);
    }

    for (const target of entry.items) {
      const key = itemKey(target.item, target.size);
      const have = covered.get(key) ?? 0;
      const need = target.quantity - have;

      if (need > 0) {
        itemsToInsert.push({
          registration_id: registrationId,
          item: target.item,
          size: target.size,
          quantity: need,
        });
      }

      covered.set(key, Math.max(0, have - target.quantity));
    }
  }

  for (const batch of chunk(itemsToDelete)) {
    await clock.time("deleteItems", async () => {
      const { error } = await db
        .from("registration_items")
        .delete()
        .in("id", batch);

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

  /*
   * Ordered deliberately: the mail is the point of the run and the
   * state row is a note about it. Nothing between here and autoMail
   * is allowed to throw.
   */
  await clock.time("syncState", () => recordSyncState(true, null));

  /*
   * Whatever is left of the thirty seconds. Sending is a second a
   * message and happens inside this request, so a sync that has
   * already spent its budget writing must not start a mail run it
   * cannot finish -- anyone skipped is picked up by the next sync
   * two minutes later.
   */
  const mailed = await clock.time("autoMail", () =>
    autoMail(WRITE_BUDGET_MS + 6_000 - (Date.now() - startedAt))
  );

  return {
    fetched: records.length,
    created,
    updated,
    /* Rows the feed sent back exactly as they are stored. On a quiet
       minute this is all of them, and the sync writes nothing. */
    unchanged,
    /* Greater than zero when the pass stopped for time. The caller
       presses again; nothing was lost. */
    remaining,
    itemsRewritten: itemsToInsert.length,
    mailed,
    durationMs: Date.now() - startedAt,
    timings: clock.timings,
  };
}

/*
 * Mail the people who registered since automatic sending was switched
 * on, if it was.
 *
 * Bounded at AUTO_MAIL_BATCH per sync, because this runs inside the
 * sync request and Gmail takes about a second a message. Anyone left
 * over is picked up by the next sync, or by the manual button --
 * pending_confirmations still sees them, since nothing was logged.
 *
 * Never throws. A mail failure must not fail the sync and roll the
 * registrations back; the sync is the part that matters.
 */
const AUTO_MAIL_BATCH = 15;

async function autoMail(budgetMs: number): Promise<number> {
  try {
    /* No time left in this request. Not a failure: the next sync
       finds exactly the same people waiting. */
    if (budgetMs < 2_000) return 0;

    const startedAt = Date.now();

    const setting = await readAutoSend();

    if (!setting.enabled || !setting.enabledAt) return 0;
    if (!mailEnabled()) return 0;

    const db = supabaseAdmin();

    /*
     * The cap is Gmail's, and it does not care that this send was
     * automatic. Stopping short leaves the allowance for the manual
     * batches an admin is watching.
     */
    const { data: summary } = await db.rpc("email_queue_summary");

    const sentLast24h = Number(
      (summary as { sentLast24h?: number })?.sentLast24h ?? 0
    );

    /* People, which is also messages: one person is one email. */
    const room = Math.min(AUTO_MAIL_BATCH, DAILY_CAP - sentLast24h);

    if (room <= 0) return 0;

    const { data, error } = await db.rpc("pending_people_since", {
      p_limit: room,
      p_since: setting.enabledAt,
    });

    /* The migrations behind this have not been run. */
    if (error) return 0;

    const pending = (data ?? []) as {
      email: string;
      name: string | null;
      passes: {
        id: number;
        registration_id: string;
        qr_token: string;
        event_name: string | null;
        event_day: string | null;
        event_venue: string | null;
        is_merch: boolean;
      }[];
    }[];

    let sent = 0;

    /* Sequential: Gmail throttles parallel SMTP from one account,
       and this runs inside a request that is already partly spent. */
    for (const person of pending) {
      if (Date.now() - startedAt > budgetMs) break;

      const result = await sendPersonPasses({
        email: person.email,
        name: person.name,
        passes: person.passes ?? [],
      });

      if (result.status === "sent") sent += 1;
    }

    return sent;
  } catch (error) {
    console.error("Automatic mail after sync failed:", error);
    return 0;
  }
}
