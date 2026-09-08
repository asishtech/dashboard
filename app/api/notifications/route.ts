import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { mailConfig, mailProblem } from "@/lib/env";
import {
  CONCURRENCY,
  DAILY_CAP,
  closeMailer,
  mailEnabled,
  sendPersonPasses,
  sendTest,
} from "@/lib/mailer";
import { supabaseAdmin } from "@/lib/supabase";
import {
  readAutoSend,
  writeAutoSend,
} from "@/lib/mail-settings";

export const dynamic = "force-dynamic";

/*
 * The most people one request will attempt. The real limit is the
 * deadline below -- this is just the size of the queue read, so a
 * fast connection is not capped at a number chosen when every message
 * cost a TLS handshake.
 */
const BATCH_SIZE = 20;

/*
 * Raised with concurrency: five in flight at roughly a second each
 * clears about a hundred inside the deadline, and a ceiling of forty
 * would just mean more round trips to send the same queue. The
 * deadline is still what actually stops the batch.
 */
const MAX_BATCH = 150;

/*
 * How long the send loop may run before it stops and reports.
 *
 * The gateway in front of this gives up at thirty seconds. It used to
 * be the only limit, so a batch of twenty at roughly eight seconds
 * each ran for three minutes: the browser saw 504, the function
 * carried on writing rows nobody was watching, and the last message
 * died mid-handshake when the platform finally froze it. Every one of
 * those symptoms is the same missing thing -- a deadline the code
 * knows about.
 *
 * Twenty-two seconds leaves room for the queue read, the cap check
 * and the response.
 */
const DEADLINE_MS = 22_000;

/* One pass. Several of these belong to one Person. */
type Pass = {
  id: number;
  registration_id: string;
  qr_token: string;
  event_name: string | null;
  event_day: string | null;
  event_venue: string | null;
  is_merch: boolean;
};

/* One email: everything one address is owed. */
type Person = {
  email: string;
  name: string | null;
  passes: Pass[];
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
      /* Named so the screen can say where mail is going out through,
         which is the first thing to check after a move. */
      relay: config?.host ?? null,
      /* Configured wrongly, in words. Null when it is fine. */
      problem: mailProblem(),
      batchSize: BATCH_SIZE,
      maxBatch: MAX_BATCH,
      concurrency: CONCURRENCY,
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

    if (body.action === "test") {
      return test(String(body.to ?? ""));
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

    /* Configured, but in a way that cannot work. Said once here
       rather than a hundred times in the failure list. */
    const problem = mailProblem();

    if (!dryRun && problem) {
      return NextResponse.json({ error: problem }, { status: 409 });
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

    const { data, error } = await db.rpc("pending_people", {
      p_limit: limit,
    });

    /* 42883 / PGRST202: supabase/person-passes.sql has not been run. */
    if (error?.code === "42883" || error?.code === "PGRST202") {
      return NextResponse.json(
        {
          error:
            "Run supabase/person-passes.sql to send passes as one email per person.",
        },
        { status: 409 }
      );
    }

    if (error) throw error;

    const pending = (data ?? []) as Person[];

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        wouldSend: pending.length,
        recipients: pending.map((person) => ({
          registration_id: `${person.passes.length} pass${
            person.passes.length === 1 ? "" : "es"
          }`,
          email: person.email,
          subject:
            person.passes.length === 1
              ? "Your V-TAPP pass"
              : `Your ${person.passes.length} V-TAPP passes`,
        })),
      });
    }

    let sent = 0;
    let failed = 0;

    const started = Date.now();

    let ranOut = false;

    const errors: { email: string; error: string }[] = [];

    /*
     * CONCURRENCY messages at a time, which is 1 on Gmail and 5 on a
     * transactional relay. Workers pull from one queue rather than
     * the batch being sliced up front, so a slow message holds up
     * nothing but itself.
     *
     * Not Promise.all over the whole batch: that is what a rate
     * limiter sees as an attack, and the failure lands on every
     * message at once instead of one.
     */
    let next = 0;

    async function worker() {
      for (;;) {
        /*
         * Checked before taking work rather than after finishing it:
         * stopping with time left is fine, being killed mid-send is
         * what wrote a half-finished row last time.
         */
        if (Date.now() - started > DEADLINE_MS) {
          /* Only when there was work left to abandon. */
          if (next < pending.length) ranOut = true;
          return;
        }

        /* Safe without a lock: nothing yields between the read and
           the increment. */
        const person = pending[next++];

        if (!person) return;

        const result = await sendPersonPasses({
          email: person.email,
          name: person.name,
          passes: person.passes ?? [],
        });

        if (result.status === "sent") {
          sent += 1;
        } else if (result.status === "failed") {
          failed += 1;

          if (errors.length < 5) {
            errors.push({ email: person.email, error: result.error });
          }
        }
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(CONCURRENCY, pending.length || 1) },
        worker
      )
    );

    /*
     * Hand the socket back before returning. A function frozen with a
     * pooled connection still open leaves the next invocation holding
     * a socket the platform has since discarded -- which is exactly
     * the "socket disconnected before secure TLS" failure in the log.
     */
    closeMailer();

    const elapsed = Date.now() - started;

    return NextResponse.json({
      success: true,
      attempted: sent + failed,
      sent,
      failed,
      errors,
      /* Stopped for time rather than because the batch was done. */
      ranOut,
      /* So the screen can say how fast it is actually going. */
      elapsedMs: elapsed,
      msPerEmail: sent > 0 ? Math.round(elapsed / sent) : null,
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
async function resend(body: { email?: unknown; confirm?: unknown }) {
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

  const email =
    typeof body.email === "string" ? body.email.trim() : "";

  if (!email) {
    return NextResponse.json(
      { error: "An email address is required" },
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
   * Keyed on the address, which is what the operation is about.
   *
   * It used to take a registration id, from back when one
   * registration was one email. Now the send carries every pass the
   * person holds, so the id of whichever row happened to be clicked
   * decided nothing -- and routing it through the search to get back
   * to the address is how "no registration with id 1" happened.
   */
  const { data: personData, error } = await db.rpc("person_passes", {
    p_email: email,
  });

  if (error?.code === "42883" || error?.code === "PGRST202") {
    return NextResponse.json(
      { error: "Run supabase/person-passes.sql to enable resending." },
      { status: 409 }
    );
  }

  if (error) throw error;

  const person = personData as Person | null;

  if (!person?.passes?.length) {
    return NextResponse.json(
      {
        error: `Nothing to send to ${email} — no registration on that address has a QR code.`,
      },
      { status: 404 }
    );
  }

  const result = await sendPersonPasses({
    resend: true,
    email: person.email,
    name: person.name,
    passes: person.passes,
  });

  if (result.status !== "sent") {
    return NextResponse.json(
      {
        error:
          result.status === "failed" ? result.error : result.reason,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    sent: 1,
    email: person.email,
    passes: person.passes.length,
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

/*
 * Send one message to a typed-in address.
 *
 * The cheapest way to find out whether the App Password is right,
 * without touching the queue or marking anybody as having been sent
 * to. Nothing here reads the registrations table at all.
 */
async function test(to: string) {
  const address = to.trim();

  /*
   * Deliberately loose. This is the same shape check the invite form
   * uses, and its job is to catch a typo, not to adjudicate RFC 5322.
   */
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return NextResponse.json(
      { error: "That does not look like an email address" },
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

  /* A test is a real message to Gmail, and counts like one. */
  const { data: summaryData } = await supabaseAdmin().rpc(
    "email_queue_summary"
  );

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

  const result = await sendTest(address);

  if (result.status !== "sent") {
    return NextResponse.json(
      {
        error:
          result.status === "failed" ? result.error : result.reason,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, to: address });
}
