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
 * Two ways to authenticate as the same mailbox:
 *
 *   SMTP_PASSWORD          -- a Gmail App Password.
 *   SMTP_OAUTH_*           -- an OAuth2 refresh token, for when the
 *                             Workspace admin will not allow App
 *                             Passwords. Same sender, same SMTP host;
 *                             only the credential differs.
 *
 * Also works unchanged with a transactional provider's SMTP (Resend,
 * Brevo, SendGrid): point SMTP_HOST/PORT/USER/PASSWORD at them.
 *
 * Optional on purpose: the app has to run before any of this exists,
 * so this reports "not configured" rather than throwing the way the
 * Supabase accessors do. Every caller checks first.
 */
export function mailConfig() {
  const user = process.env.SMTP_USER;

  if (!user) return null;

  const pass = process.env.SMTP_PASSWORD;

  const oauth =
    process.env.SMTP_OAUTH_CLIENT_ID &&
    process.env.SMTP_OAUTH_CLIENT_SECRET &&
    process.env.SMTP_OAUTH_REFRESH_TOKEN
      ? {
          clientId: process.env.SMTP_OAUTH_CLIENT_ID,
          clientSecret: process.env.SMTP_OAUTH_CLIENT_SECRET,
          refreshToken: process.env.SMTP_OAUTH_REFRESH_TOKEN,
        }
      : null;

  /* Neither credential present means mail is simply off. */
  if (!pass && !oauth) return null;

  return {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    user,
    pass: pass ?? null,
    oauth,
    /* Gmail rewrites From to the authenticated account anyway, so a
       mismatch here would silently be ignored rather than honoured. */
    from: process.env.MAIL_FROM || user,
    /* Where sync failures and other operational mail goes. */
    alertTo: process.env.ALERT_EMAIL || user,
    /* Absolute base for links and QR URLs inside emails. */
    appUrl:
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://vtapp-dashboard.netlify.app",
  };
}
