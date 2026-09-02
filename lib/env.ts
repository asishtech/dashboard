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
 * Optional on purpose: the app has to run before anyone has set up an
 * App Password, so this reports "not configured" rather than throwing
 * the way the Supabase accessors do. Every caller checks first.
 */
export function mailConfig() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!user || !pass) {
    return null;
  }

  return {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    user,
    pass,
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
