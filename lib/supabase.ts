import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  supabaseServiceRoleKey,
  supabaseUrl,
} from "./env";

let client: SupabaseClient | null = null;

/*
 * Service-role Supabase client.
 *
 * This bypasses row level security, so every call site is
 * responsible for authorizing the request first. Prefer the
 * request-scoped client from `lib/auth.ts` when the caller's
 * own permissions are enough.
 *
 * The client is created on first use rather than at import
 * time so that builds and client bundles never depend on the
 * service-role key being present.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(
      supabaseUrl(),
      supabaseServiceRoleKey(),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  return client;
}
