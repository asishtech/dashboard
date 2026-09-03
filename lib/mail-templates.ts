/*
 * Email bodies.
 *
 * Kept free of any database, SMTP or environment import so they can be
 * rendered and asserted on directly -- an email that escapes a name
 * wrongly is an injection, and that has to be testable without a
 * mail server.
 */

export function escape(text: string) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/*
 * A plain, mostly-unstyled shell.
 *
 * Gmail strips <style> blocks and most layout, and half these will be
 * read on a phone, so this leans on inline styles and a single column
 * rather than anything that needs a rendering engine to cooperate.
 */
export function shell(heading: string, body: string) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px" cellpadding="0" cellspacing="0">
<tr><td>
<p style="margin:0 0 4px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8a8a94">V-TAPP 2026</p>
<h1 style="margin:0 0 18px;font-size:20px;line-height:1.3">${escape(heading)}</h1>
${body}
<p style="margin:26px 0 0;font-size:12px;color:#8a8a94;border-top:1px solid #e6e6ea;padding-top:14px">
Sent by the V-TAPP registration desk, VIT-AP University. Please do not reply to this message.
</p>
</td></tr></table></td></tr></table></body></html>`;
}

