import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { mailConfig } from "./env";
import { escape, shell } from "./mail-templates";
import { supabaseAdmin } from "./supabase";

export type MailKind = "confirmation" | "collection" | "alert";

export type SendResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

/*
 * Gmail's Workspace ceiling. Not enforced by us so much as respected:
 * crossing it gets the account rate-limited for 24 hours, which during
 * a fest means nobody's pass arrives.
 */
export const DAILY_CAP = 1800;

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
    kind: "confirmation",
    registrationDbId: input.registrationDbId,
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
    registrationDbId: input.registrationDbId,
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
    registrationDbId: null,
  });
}

type DeliverInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  kind: MailKind;
  registrationDbId: number | null;
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

    const { error } = await db.from("email_log").insert({
      registration_id: input.registrationDbId,
      /* The column is email_type, not kind: this table predates the
         current mail code and its names win. */
      email_type: input.kind,
      recipient: input.to,
      subject: input.subject,
      status: "sent",
    });

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

    await db.from("email_log").insert({
      registration_id: input.registrationDbId,
      email_type: input.kind,
      recipient: input.to,
      subject: input.subject,
      status: "failed",
      error_message: message.slice(0, 500),
    });

    return { status: "failed", error: message };
  }
}
