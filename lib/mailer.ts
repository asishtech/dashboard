import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { mailConfig } from "./env";
import { escape, shell } from "./mail-templates";
import { supabaseAdmin } from "./supabase";
import { buildPassPdf, type Pass } from "./pass-pdf";

export type MailKind =
  | "confirmation"
  | "collection"
  | "alert"
  /*
   * A deliberate second copy, sent by an admin from the mail screen.
   *
   * Logged under its own name so it is outside email_log_once (see
   * supabase/mail-controls.sql): the index has to keep refusing an
   * automatic duplicate while allowing this one. It still records
   * status = "sent", so it still counts against the daily cap --
   * Gmail charges for it either way.
   */
  | "confirmation-resend"
  /*
   * A message to an arbitrary address, to prove the credentials work
   * before 1,241 real ones go out. Never tied to a registration, so
   * email_log_once does not apply and it can be sent as often as
   * needed.
   */
  | "test";

export type SendResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

/*
 * Gmail's ceiling. Not enforced by us so much as respected: crossing
 * it gets the account rate-limited for 24 hours, which during a fest
 * means nobody's pass arrives.
 *
 * The number depends on the plan, and the gap is large:
 *
 *   Google Workspace, paid      ~2,000 recipients / day
 *   Google Workspace, trial       ~500 recipients / day
 *
 * A trial account is the dangerous case, because 1,800 looks like a
 * safe margin and is more than three times the real limit. Nothing in
 * the API says which plan an account is on, so this is configuration
 * rather than detection -- set MAIL_DAILY_CAP to about 400 while on
 * trial and raise it when the plan is paid for.
 */
export const DAILY_CAP = (() => {
  const configured = Number(process.env.MAIL_DAILY_CAP);

  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : 1800;
})();

let cached: Transporter | null = null;

function transport(): Transporter | null {
  const config = mailConfig();

  if (!config) return null;

  if (cached) return cached;

  /*
   * Typed explicitly: createTransport is overloaded, and an untyped
   * object literal resolves to the generic Transport overload, which
   * does not accept `host`.
   */
  const options: SMTPTransport.Options = {
    host: config.host,
    port: config.port,
    /* 587 is STARTTLS, 465 is implicit TLS. */
    secure: config.port === 465,

    /*
     * OAuth2 when a refresh token is configured, a password otherwise.
     * Nodemailer exchanges the refresh token for an access token
     * itself and renews it, so nothing here has to track expiry.
     */
    auth: { user: config.user, pass: config.pass },
  };

  /*
   * Not pooled. Serverless invocations are short-lived, so a pool would
   * be torn down before it paid for itself; the transporter is still
   * reused within one invocation via `cached`.
   */

  cached = nodemailer.createTransport(options);

  return cached;
}

export function mailEnabled() {
  return mailConfig() !== null;
}

export type ConfirmationInput = {
  /* True when an admin asked for another copy. Only changes how the
     send is logged; the message itself is identical. */
  resend?: boolean;
  registrationDbId: number;
  registrationId: string;
  name: string | null;
  email: string;
  qrToken: string;
  isMerch: boolean;
  eventName: string | null;
  eventDay: string | null;
  eventVenue: string | null;
};

/*
 * The QR travels as an attachment referenced by cid, not as a link.
 * A remote image is blocked by default in Gmail, and a pass nobody can
 * see until they tap "display images" is a pass that fails at a gate
 * with a queue behind it.
 */
async function qrAttachment(claimUrl: string) {
  const QRCode = (await import("qrcode")).default;

  const dataUrl = await QRCode.toDataURL(claimUrl, {
    width: 420,
    margin: 2,
    errorCorrectionLevel: "H",
  });

  return {
    filename: "vtapp-qr.png",
    content: Buffer.from(dataUrl.split(",")[1], "base64"),
    cid: "vtappqr",
    contentType: "image/png",
  };
}

export async function sendConfirmation(
  input: ConfirmationInput
): Promise<SendResult> {
  const config = mailConfig();
  const mailer = transport();

  if (!config || !mailer) {
    return { status: "skipped", reason: "Mail is not configured" };
  }

  const claimUrl = `${config.appUrl}/claim/${input.qrToken}`;

  const what = input.isMerch
    ? "V-TAPP merchandise"
    : (input.eventName ?? "your V-TAPP event");

  const where = [input.eventDay, input.eventVenue]
    .filter(Boolean)
    .join(" · ");

  const subject = input.isMerch
    ? "Your V-TAPP merchandise collection pass"
    : `Your V-TAPP pass — ${what}`;

  const lines = input.isMerch
    ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">Your merchandise order is confirmed. Show this code at the V-TAPP counter to collect it.</p>`
    : `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">You are registered for <strong>${escape(
        what
      )}</strong>${where ? ` — ${escape(where)}` : ""}. Show this code at the venue to check in.</p>`;

  const html = shell(
    `Hello${input.name ? ` ${escape(input.name.split(" ")[0])}` : ""},`,
    `${lines}
<p style="margin:0 0 18px;font-size:13px;color:#6a6a74">Registration <strong style="font-family:ui-monospace,Menlo,monospace">#${escape(
      input.registrationId
    )}</strong></p>
<p style="margin:0 0 18px;text-align:center"><img src="cid:vtappqr" width="240" height="240" alt="Your V-TAPP QR code" style="border-radius:10px"></p>
<p style="margin:0;font-size:13px;color:#6a6a74">If the code will not scan, open <a href="${escape(
      claimUrl
    )}" style="color:#c2410c">${escape(claimUrl)}</a> on your phone.</p>`
  );

  const text = [
    `Hello${input.name ? ` ${input.name.split(" ")[0]}` : ""},`,
    "",
    input.isMerch
      ? "Your V-TAPP merchandise order is confirmed. Show your QR code at the counter to collect it."
      : `You are registered for ${what}${where ? ` (${where})` : ""}. Show your QR code at the venue to check in.`,
    "",
    `Registration #${input.registrationId}`,
    `Your pass: ${claimUrl}`,
    "",
    "Sent by the V-TAPP registration desk, VIT-AP University.",
  ].join("\n");

  return deliver({
    to: input.email,
    subject,
    html,
    text,
    kind: input.resend ? "confirmation-resend" : "confirmation",
    registrationDbIds: [input.registrationDbId],
    attachments: [await qrAttachment(claimUrl)],
  });
}

export type CollectionInput = {
  registrationDbId: number;
  registrationId: string;
  name: string | null;
  email: string;
  items: { item: string; size: string | null; quantity: number }[];
};

export async function sendCollectionReceipt(
  input: CollectionInput
): Promise<SendResult> {
  if (!mailEnabled()) {
    return { status: "skipped", reason: "Mail is not configured" };
  }

  const rows = input.items
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #eeeef1;font-size:14px">${escape(
          item.item
        )}${item.size ? ` <span style="color:#8a8a94">· ${escape(item.size)}</span>` : ""}</td><td style="padding:8px 0;border-bottom:1px solid #eeeef1;text-align:right;font-size:14px">${item.quantity}</td></tr>`
    )
    .join("");

  const html = shell(
    `Collected — thank you`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">This confirms you have collected your V-TAPP merchandise. Keep this email as your record.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${rows}</table>
<p style="margin:0;font-size:13px;color:#6a6a74">Registration <strong style="font-family:ui-monospace,Menlo,monospace">#${escape(
      input.registrationId
    )}</strong></p>`
  );

  const text = [
    "This confirms you have collected your V-TAPP merchandise.",
    "",
    ...input.items.map(
      (item) =>
        `- ${item.item}${item.size ? ` (${item.size})` : ""} x${item.quantity}`
    ),
    "",
    `Registration #${input.registrationId}`,
  ].join("\n");

  return deliver({
    to: input.email,
    subject: "Your V-TAPP merchandise — collected",
    html,
    text,
    kind: "collection",
    registrationDbIds: [input.registrationDbId],
  });
}

/*
 * Operational mail, to the organisers rather than to a student.
 *
 * Throttled per subject: a sync that fails on every poll would
 * otherwise fill the inbox and burn the daily quota that the
 * confirmations need.
 */
export async function sendAlert(
  subject: string,
  detail: string,
  throttleMinutes = 60
): Promise<SendResult> {
  const config = mailConfig();

  if (!config) {
    return { status: "skipped", reason: "Mail is not configured" };
  }

  const since = new Date(
    Date.now() - throttleMinutes * 60_000
  ).toISOString();

  const { count } = await supabaseAdmin()
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .eq("email_type", "alert")
    .eq("subject", subject)
    .gte("sent_at", since);

  if ((count ?? 0) > 0) {
    return {
      status: "skipped",
      reason: `Already alerted within ${throttleMinutes} minutes`,
    };
  }

  return deliver({
    to: config.alertTo,
    subject: `[V-TAPP] ${subject}`,
    html: shell(
      subject,
      `<pre style="margin:0;white-space:pre-wrap;font-size:13px;font-family:ui-monospace,Menlo,monospace;color:#1a1a1a">${escape(
        detail
      )}</pre>`
    ),
    text: `${subject}\n\n${detail}`,
    kind: "alert",
    registrationDbIds: [],
  });
}

type DeliverInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  kind: MailKind;
  /*
   * Every registration this one message covers. A person with nine
   * passes gets one PDF and nine log rows, so email_log_once keeps
   * guaranteeing that no registration is confirmed twice while the
   * message count stays honest.
   */
  registrationDbIds: number[];
  attachments?: {
    filename: string;
    content: Buffer;
    cid: string;
    contentType: string;
  }[];
};

/*
 * The single place mail leaves the process, and the single place the
 * log is written. Keeping those together is what makes the unique index
 * on email_log meaningful: there is no path that sends without
 * recording it.
 */
async function deliver(input: DeliverInput): Promise<SendResult> {
  const config = mailConfig();
  const mailer = transport();

  if (!config || !mailer) {
    return { status: "skipped", reason: "Mail is not configured" };
  }

  const db = supabaseAdmin();

  try {
    await mailer.sendMail({
      from: `"${config.fromName}" <${config.from}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments,
    });

    const rows = (
      input.registrationDbIds.length > 0
        ? input.registrationDbIds
        : [null]
    ).map((id) => ({
      registration_id: id,
      /* The column is email_type, not kind: this table predates the
         current mail code and its names win. */
      email_type: input.kind,
      recipient: input.to,
      subject: input.subject,
      status: "sent",
    }));

    const { error } = await db.from("email_log").insert(rows);

    /*
     * 23505: something else logged this send first, so a duplicate went
     * out. Report it rather than swallow it -- it means two senders ran
     * concurrently and the batch size or trigger needs looking at.
     */
    if (error && error.code !== "23505") {
      console.error("Mail sent but not logged:", error);
    }

    return { status: "sent" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    await db.from("email_log").insert(
      (input.registrationDbIds.length > 0
        ? input.registrationDbIds
        : [null]
      ).map((id) => ({
        registration_id: id,
        email_type: input.kind,
        recipient: input.to,
        subject: input.subject,
        status: "failed",
        error_message: message.slice(0, 500),
      }))
    );

    return { status: "failed", error: message };
  }
}


/*
 * Send one message to any address, to check the plumbing.
 *
 * Deliberately not a copy of a real pass. Somebody testing at a desk
 * should be able to tell at a glance whether the mail in front of
 * them is a genuine ticket or their own probe -- and if a test ever
 * does reach a student by mistake, it should say so itself.
 */
export async function sendTest(to: string): Promise<SendResult> {
  const config = mailConfig();

  if (!config) {
    return { status: "skipped", reason: "Mail is not configured" };
  }

  const now = new Date().toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const html = shell(
    "Mail is working",
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">This is a test from the V-TAPP dashboard. If you are reading it, the sending account and its password are set up correctly.</p>
<p style="margin:0 0 8px;font-size:13px;color:#6a6a74">Sent ${escape(now)} from <strong>${escape(config.from)}</strong></p>
<p style="margin:0;font-size:13px;color:#6a6a74">Passes link to ${escape(config.appUrl)} — check that this is the address students should see.</p>`
  );

  const text = [
    "This is a test from the V-TAPP dashboard.",
    "",
    "If you are reading it, the sending account and its password are",
    "set up correctly.",
    "",
    `Sent ${now} from ${config.from}`,
    `Passes link to ${config.appUrl}`,
  ].join("\n");

  return deliver({
    to,
    subject: "V-TAPP dashboard — test message",
    html,
    text,
    kind: "test",
    /* No registration, so nothing is marked as delivered by this. */
    registrationDbIds: [],
  });
}


export type PersonPasses = {
  email: string;
  name: string | null;
  passes: (Pass & { id: number })[];
  /* An admin asked for another copy; only changes how it is logged. */
  resend?: boolean;
};

/*
 * Every pass one person holds, as a single email with a single PDF.
 *
 * The alternative -- one message per registration -- sent somebody
 * entered for nine events nine near-identical emails, and cost 491
 * messages across the fest that a 500-a-day trial account cannot
 * spare.
 *
 * The PDF rather than inline images: a student can save it, print it,
 * and open it at a gate with no signal, and it survives being
 * forwarded. Inline images are the thing mail clients hide.
 */
export async function sendPersonPasses(
  input: PersonPasses
): Promise<SendResult> {
  const config = mailConfig();

  if (!config) {
    return { status: "skipped", reason: "Mail is not configured" };
  }

  if (input.passes.length === 0) {
    return { status: "skipped", reason: "Nothing to send" };
  }

  const count = input.passes.length;
  const one = count === 1;

  const pdf = await buildPassPdf({
    name: input.name,
    email: input.email,
    passes: input.passes,
    appUrl: config.appUrl,
  });

  const subject = one
    ? "Your V-TAPP pass"
    : `Your ${count} V-TAPP passes`;

  const rows = input.passes
    .map((pass) => {
      const what = pass.is_merch
        ? "Merchandise collection"
        : (pass.event_name ?? "V-TAPP event");

      const where = pass.is_merch
        ? "V-TAPP counter"
        : [pass.event_day, pass.event_venue]
            .filter(Boolean)
            .join(" · ");

      return `<tr><td style="padding:7px 0;border-bottom:1px solid #eeeef1;font-size:14px">${escape(
        what
      )}${where ? `<br><span style="color:#8a8a94;font-size:12px">${escape(where)}</span>` : ""}</td></tr>`;
    })
    .join("");

  const html = shell(
    `Hello${input.name ? ` ${escape(input.name.split(" ")[0])}` : ""},`,
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">Your ${
      one ? "pass is" : `${count} passes are`
    } attached as a PDF — one page each, with the QR code to show at the ${
      one ? "gate" : "gate or counter"
    }.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${rows}</table>
<p style="margin:0 0 14px;font-size:13px;color:#6a6a74">Save the PDF to your phone before you arrive. It works without a signal.</p>
<p style="margin:0;font-size:13px;color:#6a6a74">If a code will not scan, the link printed under it opens the same pass in a browser.</p>`
  );

  const text = [
    `Hello${input.name ? ` ${input.name.split(" ")[0]}` : ""},`,
    "",
    one
      ? "Your V-TAPP pass is attached as a PDF."
      : `Your ${count} V-TAPP passes are attached as a PDF, one page each.`,
    "",
    ...input.passes.map((pass) => {
      const what = pass.is_merch
        ? "Merchandise collection"
        : (pass.event_name ?? "V-TAPP event");

      const where = pass.is_merch
        ? "V-TAPP counter"
        : [pass.event_day, pass.event_venue].filter(Boolean).join(" - ");

      return `- ${what}${where ? ` (${where})` : ""}`;
    }),
    "",
    "Save the PDF to your phone before you arrive. It works without a",
    "signal. If a code will not scan, the link printed under it opens",
    "the same pass in a browser.",
    "",
    "Sent by the V-TAPP registration desk, VIT-AP University.",
  ].join("\n");

  return deliver({
    to: input.email,
    subject,
    html,
    text,
    kind: input.resend ? "confirmation-resend" : "confirmation",
    registrationDbIds: input.passes.map((pass) => pass.id),
    attachments: [
      {
        filename: one ? "vtapp-pass.pdf" : "vtapp-passes.pdf",
        content: pdf,
        cid: "vtapppdf",
        contentType: "application/pdf",
      },
    ],
  });
}
