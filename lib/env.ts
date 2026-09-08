/*
 * Environment access.
 *
 * Reading a missing variable throws with the variable's
 * name instead of silently handing `undefined` to the
 * Supabase SDK, which fails later with an opaque error.
 *
 * Values are read lazily so that `next build` does not
 * require a populated environment.
 */

function required(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`
    );
  }

  return value;
}

export function supabaseUrl() {
  return required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

export function supabaseAnonKey() {
  return required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function supabaseServiceRoleKey() {
  return required(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function vtappApi() {
  return {
    url: required("VTAPP_API_URL", process.env.VTAPP_API_URL),
    key: required("VTAPP_API_KEY", process.env.VTAPP_API_KEY),
  };
}

/*
 * Mail.
 *
 * Sent through Google Workspace as tickets@vtapp.co.in. That domain
 * publishes `v=spf1 include:_spf.google.com` and routes MX to Google,
 * so mail from Gmail is SPF-aligned with no DNS work.
 *
 * Optional on purpose: the app has to run before anyone has set up an
 * App Password, so this reports "not configured" rather than throwing
 * the way the Supabase accessors do. Every caller checks first.
 */
export function mailConfig() {
  /*
   * Two spellings accepted for three of these.
   *
   * SMTP_USERNAME / SMTP_FROM_EMAIL / SMTP_FROM_NAME are what most
   * SMTP tooling calls them, and are what actually got typed into the
   * hosting console. Reading only our own names meant mailConfig()
   * returned null, which is indistinguishable from "no App Password
   * yet": the deploy succeeds, the screen says "not configured", and
   * nothing anywhere names the variable that was misspelled.
   *
   * Our names win where both are set, so this widens what works
   * without changing what already did.
   */
  const user = process.env.SMTP_USER || process.env.SMTP_USERNAME;
  const pass = process.env.SMTP_PASSWORD;

  if (!user || !pass) {
    return null;
  }

  /*
   * The username is not always an address.
   *
   * On Gmail it is the mailbox, and Gmail rewrites From to the
   * authenticated account anyway, so falling back to it was free. On
   * ZeptoMail the username is the literal string "emailapikey" -- so
   * the same fallback puts `emailapikey` in the From header and in
   * ALERT_EMAIL, and every message is rejected by a relay that will
   * not explain itself. Only fall back when it is actually an
   * address; mailProblem() below says so plainly when it is not.
   */
  const userIsAddress = user.includes("@");

  return {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    user,
    pass,
    from:
      process.env.MAIL_FROM ||
      process.env.SMTP_FROM_EMAIL ||
      (userIsAddress ? user : ""),
    /* A display name is what stops this reading as spam. */
    fromName:
      process.env.MAIL_FROM_NAME ||
      process.env.SMTP_FROM_NAME ||
      "V-TAPP 2026",
    /* Where sync failures and other operational mail goes. */
    alertTo:
      process.env.ALERT_EMAIL ||
      process.env.MAIL_FROM ||
      (userIsAddress ? user : ""),
    /* Absolute base for links and QR URLs inside emails. */
    appUrl:
      process.env.NEXT_PUBLIC_APP_URL || "https://vtapp.co.in",
  };
}

/*
 * What is wrong with the mail settings, in words, or null if nothing.
 *
 * Separate from mailConfig() returning null, which means "nobody has
 * set this up yet" and is a normal state. This is the other kind:
 * configured, and configured wrongly. A relay answers that with a
 * 5xx per message and the screen fills with a hundred identical
 * failures, none of which name the setting at fault.
 */
export function mailProblem() {
  const config = mailConfig();

  if (!config) return null;

  if (!config.from.includes("@")) {
    return "MAIL_FROM is not set. The SMTP username is not an email address (ZeptoMail uses the literal 'emailapikey'), so there is nothing to send as -- set MAIL_FROM to an address on the verified domain.";
  }

  /*
   * ZeptoMail only accepts a From on a domain verified in the
   * account, and rejects anything else per message. Catching the
   * common mistake -- leaving a gmail.com sender behind after moving
   * the host -- is worth one string comparison.
   */
  if (
    config.host.includes("zeptomail") &&
    /@(gmail|googlemail)\.com$/i.test(config.from)
  ) {
    return `MAIL_FROM is ${config.from}, which ZeptoMail will reject: the sender has to be on a domain verified in the ZeptoMail account.`;
  }

  return null;
}
