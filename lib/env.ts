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
