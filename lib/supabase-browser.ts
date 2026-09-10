import { createBrowserClient } from "@supabase/ssr";

/*
 * One client for the life of the tab, not one per caller.
 *
 * NavBar, useStepUp, useRealtime and half a dozen other client
 * components each called createBrowserClient() on their own mount.
 * Every one of those is a separate GoTrueClient with its own session
 * refresh cycle, all reading the same cookie -- so a page with three
 * of them mounted at once made three simultaneous attempts to use one
 * single-use refresh token. Two of those always lost, Supabase
 * answered with 400 on /auth/v1/token, and the losing client cleared
 * its session, which is what then made /api/auth/role and other
 * routes come back 401 even for an account that had signed in fine
 * the day before -- it was never the account, it was three clients
 * racing themselves.
 */
function makeClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/*
 * ReturnType<typeof createBrowserClient> directly would resolve
 * against the last of its overloads rather than the one actually
 * called above -- routing through this single-signature wrapper
 * keeps the inferred type the real one.
 */
let client: ReturnType<typeof makeClient> | undefined;

export function createSupabaseBrowser() {
  if (!client) {
    client = makeClient();
  }

  return client;
}
