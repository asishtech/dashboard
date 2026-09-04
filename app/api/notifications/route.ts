import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { mailConfig } from "@/lib/env";
import {
  DAILY_CAP,
  mailEnabled,
  sendConfirmation,
} from "@/lib/mailer";
import { supabaseAdmin } from "@/lib/supabase";
import {
  readAutoSend,
  writeAutoSend,
} from "@/lib/mail-settings";

export const dynamic = "force-dynamic";

/*
 * Batches are small on purpose. Gmail takes roughly a second per
 * message over SMTP, and a Netlify function is cut off at 26 seconds,
 * so 20 leaves room for the round-trips either side. Sending the whole
 * queue in one request would time out halfway and leave nobody able to
 * say which half went.
 */
const BATCH_SIZE = 20;
const MAX_BATCH = 40;

type Pending = {
  id: number;
  registration_id: string;
  name: string | null;
  email: string;
  qr_token: string;
  event_name: string | null;
  event_day: string | null;
  event_venue: string | null;
  is_merch: boolean;
};

/*
 * GET /api/notifications
 *
 * What is outstanding, and whether sending is even possible.
 */
export async function GET() {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const config = mailConfig();

    const { data, error } = await supabaseAdmin().rpc(
      "email_queue_summary"
    );

    /* 42883 / PGRST202: supabase/email-log.sql has not been run. */
    if (
      error &&
      (error.code === "42883" || error.code === "PGRST202")
    ) {
      return NextResponse.json({
        success: true,
        ready: false,
        reason: "Run supabase/email-log.sql to enable notifications.",
        configured: config !== null,
      });
    }

    if (error) throw error;

    const summary = data as {
      pendingConfirmations: number;
      sentLast24h: number;
      [key: string]: unknown;
    };

    const autoSend = await readAutoSend();

    return NextResponse.json({
      success: true,
      ready: true,
      configured: config !== null,
      sender: config?.from ?? null,
      batchSize: BATCH_SIZE,
      dailyCap: DAILY_CAP,
      autoSend,
      remainingToday: Math.max(
        0,
        DAILY_CAP - Number(summary.sentLast24h ?? 0)
      ),
      ...summary,
    });
  } catch (error) {
    console.error("Notifications GET error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read the mail queue",
      },
      { status: 500 }
    );
  }
}

/*
 * POST /api/notifications
 *
 * Send one batch of registration confirmations.
 *
 * Deliberately not wired to the sync. Several hundred emails to real
 * students is not a decision a background job should take on its own,
 * and a mistake cannot be recalled -- so it happens when an admin
 * presses the button, one batch at a time, with the queue visible.
 *
 * Pass { "dryRun": true } to see exactly who the next batch would go to
 * without sending anything.
 */
export async function POST(request: Request) {
  const auth = await requireRole("admin");

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const body = await request.json().catch(() => ({}));

    /*
     * Three actions share this handler because they share the guard,
     * the cap check and the mail transport. Dispatched on an explicit
     * `action`, so the default -- no action at all -- stays the batch
     * send that already existed.
     */
    if (body.action === "lookup") {
      return lookup(String(body.query ?? ""));
    }

    if (body.action === "resend") {
      return resend(body);
    }

    if (body.action === "autoSend") {
      return setAutoSend(body.enabled === true);
    }

    const dryRun = body.dryRun === true;

    const limit = Math.min(
      Math.max(Number(body.limit) || BATCH_SIZE, 1),
      MAX_BATCH
    );

    if (!dryRun && !mailEnabled()) {
      return NextResponse.json(
        {
          error:
            "Mail is not configured. Set SMTP_USER and SMTP_PASSWORD.",
        },
        { status: 409 }
      );
    }

    const db = supabaseAdmin();

    /*
     * Check the cap before sending, not after. Crossing Gmail's daily
     * limit locks the account out for 24 hours, which during a fest
     * means the remaining passes never arrive at all.
     */
    const { data: summaryData } = await db.rpc("email_queue_summary");

    const sentLast24h = Number(
      (summaryData as { sentLast24h?: number })?.sentLast24h ?? 0
    );

    if (!dryRun && sentLast24h + limit > DAILY_CAP) {
      return NextResponse.json(
        {
          error: `That would pass the daily limit (${sentLast24h} sent in the last 24 hours, cap ${DAILY_CAP}). Wait, or send a smaller batch.`,
        },
        { status: 429 }
      );
    }

    const { data, error } = await db.rpc("pending_confirmations", {
      p_limit: limit,
    });

    if (error) throw error;

    const pending = (data ?? []) as Pending[];

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        wouldSend: pending.length,
        recipients: pending.map((row) => ({
          registration_id: row.registration_id,
          email: row.email,
          subject: row.is_merch
            ? "Your V-TAPP merchandise collection pass"
            : `Your V-TAPP pass — ${row.event_name ?? "your V-TAPP event"}`,
        })),
      });
    }

    let sent = 0;
    let failed = 0;

    const errors: { email: string; error: string }[] = [];

    /*
     * Sequential, not Promise.all. Gmail throttles parallel SMTP
     * connections from one account, and a burst that trips it fails the
     * whole batch rather than one message.
     */
    for (const row of pending) {
      const result = await sendConfirmation({
        registrationDbId: row.id,
        registrationId: row.registration_id,
        name: row.name,
        email: row.email,
        qrToken: row.qr_token,
        isMerch: Boolean(row.is_merch),
        eventName: row.event_name,
        eventDay: row.event_day,
        eventVenue: row.event_venue,
      });

      if (result.status === "sent") {
        sent += 1;
      } else if (result.status === "failed") {
        failed += 1;

        if (errors.length < 5) {
          errors.push({ email: row.email, error: result.error });
        }
      }
    }

    return NextResponse.json({
      success: true,
      attempted: pending.length,
      sent,
      failed,
      errors,
    });
  } catch (error) {
    console.error("Notifications POST error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to send notifications",
      },
      { status: 500 }
    );
  }
}

/*
 * Find a registration to resend to.
 *
 * Search rather than a bare email match: the desk is usually working
 * from a half-remembered address or a name called across a counter.
 */
async function lookup(query: string) {
  const trimmed = query.trim();

  if (trimmed.length < 3) {
    return NextResponse.json(
      { error: "Type at least three characters" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin().rpc("mail_lookup", {
    p_query: trimmed,
  });

  if (error?.code === "42883" || error?.code === "PGRST202") {
    return NextResponse.json(
      {
        error:
          "Run supabase/mail-controls.sql to enable resending.",
      },
      { status: 409 }
    );
  }

  if (error) throw error;

  return NextResponse.json({ success: true, matches: data ?? [] });
}

/*
 * Send somebody another copy of their pass.
 *
 * `confirm` is not ceremony. This is the one path that deliberately
 * mails a person who has already been mailed, and the request that
 * does it should not be one field away from the request that does
 * not.
 */
async function resend(body: {
  registrationDbId?: unknown;
  confirm?: unknown;
}) {
  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "Tick the confirmation box first" },
      { status: 400 }
    );
  }

  if (!mailEnabled()) {
    return NextResponse.json(
      {
        error:
          "Mail is not configured. Set SMTP_USER and SMTP_PASSWORD.",
      },
      { status: 409 }
    );
  }

  const id = Number(body.registrationDbId);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: "A registration is required" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  /*
   * The cap applies here too. A resend is a real message as far as
   * Gmail is concerned, and the account gets locked the same way.
   */
  const { data: summaryData } = await db.rpc("email_queue_summary");

  const sentLast24h = Number(
    (summaryData as { sentLast24h?: number })?.sentLast24h ?? 0
  );

  if (sentLast24h + 1 > DAILY_CAP) {
    return NextResponse.json(
      {
        error: `That would pass the daily limit (${sentLast24h} sent in the last 24 hours, cap ${DAILY_CAP}).`,
      },
      { status: 429 }
    );
  }

  /*
   * Re-read the row rather than trusting the one the browser is
   * showing. The address may have been corrected since the search,
   * and the corrected one is the whole reason for resending.
   */
  const { data: rows, error } = await db.rpc("mail_lookup", {
    p_query: String(id),
  });

  if (error) throw error;

  const row = ((rows ?? []) as Pending[]).find(
    (candidate) => Number(candidate.id) === id
  );

  if (!row) {
    return NextResponse.json(
      { error: "Registration not found, or it has no email address" },
      { status: 404 }
    );
  }

  const result = await sendConfirmation({
    resend: true,
    registrationDbId: row.id,
    registrationId: row.registration_id,
    name: row.name,
    email: row.email,
    qrToken: row.qr_token,
    isMerch: Boolean(row.is_merch),
    eventName: row.event_name,
    eventDay: row.event_day,
    eventVenue: row.event_venue,
  });

  if (result.status !== "sent") {
    return NextResponse.json(
      {
        error:
          result.status === "failed"
            ? result.error
            : result.reason,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    sent: 1,
    email: row.email,
  });
}

/*
 * Turn automatic sending on or off.
 *
 * Switching on stamps the moment, and the automatic path only ever
 * looks at registrations from that moment onwards. Switching off
 * clears it, so switching on again next week does not suddenly
 * capture everything in between.
 */
async function setAutoSend(enabled: boolean) {
  const { value, error } = await writeAutoSend(enabled);

  if (error?.code === "42883" || error?.code === "PGRST202") {
    return NextResponse.json(
      {
        error:
          "Run supabase/mail-controls.sql to enable automatic sending.",
      },
      { status: 409 }
    );
  }

  if (error) throw error;

  return NextResponse.json({ success: true, autoSend: value });
}
